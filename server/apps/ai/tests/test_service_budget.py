"""Every Claude call reserves its worst case in the ledger first and settles from real usage after."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

import anthropic
import httpx
import pytest
from django.db import InterfaceError, OperationalError, connection

from apps.accounts.models import User
from apps.ai import ledger, service
from apps.ai.models import AIBudgetDay, AIReservation
from apps.ai.service import (
    AIBudgetRefusedError,
    AIProviderLimitError,
    AIRefusedError,
    AIServiceError,
    AIUnavailableError,
    ats_health_check as real_ats_health_check,
    tailor_to_jd as real_tailor_to_jd,
)

from .fakes import _response, _text

pytestmark = pytest.mark.django_db

REQ = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
ATS_JSON = '{"score": 70, "issues": [], "recommendations": []}'
CREDIT_MESSAGE = (
    "Your credit balance is too low to access the Anthropic API. "
    "Please go to Plans & Billing to upgrade or purchase credits."
)


def status_error(code, message="error", body=None):
    return anthropic.APIStatusError(
        message,
        response=httpx.Response(code, request=REQ),
        body=body or {"type": "error", "error": {"type": "x", "message": message}},
    )


def test_a_call_reserves_then_settles_from_usage(fake, content):
    fake(_response(_text(ATS_JSON)))
    real_ats_health_check(content)
    r = AIReservation.objects.get()
    assert (r.feature, r.settled_how, r.actual_micros) == ("ats-check", "usage", 21_000)
    assert r.amount_micros > 21_000


@pytest.mark.parametrize("stop_reason, error", [("refusal", AIRefusedError), ("max_tokens", AIServiceError)])
def test_billed_endings_are_settled_before_raising(fake, content, stop_reason, error):
    fake(_response(_text("partial"), stop_reason=stop_reason))
    with pytest.raises(error):
        real_ats_health_check(content)
    assert AIReservation.objects.get().settled_how == "usage"


def test_unreadable_json_is_still_charged(fake, content):
    fake(_response(_text("not json")))
    with pytest.raises(AIServiceError):
        real_ats_health_check(content)
    assert AIReservation.objects.get().actual_micros == 21_000


UNBILLED = [
    (status_error(401), AIUnavailableError),
    (status_error(403), AIUnavailableError),
    (status_error(402), AIProviderLimitError),
    (
        status_error(
            400,
            "You have reached your specified workspace API usage limits. "
            "You will regain access on 2026-12-01 at 00:00 UTC.",
        ),
        AIProviderLimitError,
    ),
    (
        status_error(
            400,
            "You have reached your specified organization API usage limits. "
            "You will regain access on 2026-12-01 at 00:00 UTC.",
        ),
        AIProviderLimitError,
    ),
    (status_error(400, CREDIT_MESSAGE), AIProviderLimitError),
    (
        status_error(
            429,
            "limit",
            {"type": "error", "error": {"type": "rate_limit_error", "message": "limit",
                                        "error_code": "enforced_spend_limit_reached"}},
        ),
        AIProviderLimitError,
    ),
    (status_error(429, "Number of requests has exceeded your rate limit"), AIUnavailableError),
    (status_error(529, "Overloaded"), AIUnavailableError),
]


@pytest.mark.parametrize("exc, error", UNBILLED)
def test_known_unbilled_failures_settle_to_zero(fake, content, exc, error):
    fake(exc)
    with pytest.raises(error) as raised:
        real_ats_health_check(content)
    assert raised.value.__cause__ is exc
    r = AIReservation.objects.get()
    assert (r.settled_how, r.actual_micros) == ("unbilled", 0)


KEPT = [
    anthropic.APITimeoutError(request=REQ),
    anthropic.APIConnectionError(request=REQ),
    status_error(500),
    status_error(400, "messages: field required"),
]


@pytest.mark.parametrize("exc", KEPT)
def test_unknown_outcomes_keep_the_full_reservation(fake, content, exc):
    fake(exc)
    with pytest.raises(AIUnavailableError):
        real_ats_health_check(content)
    r = AIReservation.objects.get()
    assert (r.settled_how, r.actual_micros) == ("kept", r.amount_micros)


def test_an_input_over_its_bound_is_logged(fake, content, caplog):
    huge = SimpleNamespace(input_tokens=10**9, output_tokens=0, cache_read_input_tokens=0,
                           cache_creation_input_tokens=0, iterations=None)
    fake(_response(_text(ATS_JSON), usage=huge))
    with caplog.at_level("WARNING", logger="apps.ai.service"):
        real_ats_health_check(content)
    assert "exceeded its bound" in caplog.text


def test_budget_refusal_messages_read_sensibly():
    assert str(AIBudgetRefusedError("off")) == "Live AI is off."
    assert "daily" not in str(AIBudgetRefusedError("daily")) and AIBudgetRefusedError("daily").scope == "daily"


def test_budget_refusal_sends_nothing(fake, content, settings):
    client = fake(_response(_text(ATS_JSON)))
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    with pytest.raises(AIBudgetRefusedError) as refused:
        real_ats_health_check(content)
    assert refused.value.scope == "off"
    assert client.messages.calls + client.beta.messages.calls == []


@pytest.mark.parametrize("error", [OperationalError, InterfaceError])  # InterfaceError: a closed connection
def test_ledger_outage_fails_closed(fake, content, monkeypatch, error):
    client = fake(_response(_text(ATS_JSON)))
    monkeypatch.setattr(ledger, "reserve", Mock(side_effect=error("down")))
    with pytest.raises(AIUnavailableError):
        real_ats_health_check(content)
    assert client.beta.messages.calls == []


@pytest.mark.parametrize("error", [OperationalError, InterfaceError])
def test_settle_failure_still_returns_the_answer(fake, content, monkeypatch, at, error):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    fake(_response(_text(ATS_JSON)))
    monkeypatch.setattr(service.ledger, "settle", Mock(side_effect=error("blip")))
    assert real_ats_health_check(content)["score"] == 70
    assert AIReservation.objects.get().settled_at is None
    monkeypatch.undo()
    at(datetime(2026, 11, 1, 12, 11, tzinfo=UTC))
    assert ledger.sweep_stale(older_than=timedelta(minutes=10)) == 1


def test_guest_deleted_during_the_call_still_settles(fake, content, guest):
    fake(_response(_text(ATS_JSON)), on_call=lambda _kw: User.objects.filter(pk=guest.pk).delete())
    real_ats_health_check(content, visitor_id=guest.pk)
    assert AIBudgetDay.objects.get().settled_micros == 21_000


@pytest.mark.django_db(transaction=True)
def test_no_transaction_is_open_during_the_model_call(fake, content):
    seen = []
    fake(_response(_text(ATS_JSON)), on_call=lambda _kw: seen.append(connection.in_atomic_block))
    real_ats_health_check(content)
    assert seen == [False]


def test_the_fallback_doubles_the_reservation_and_has_its_own_max_tokens(fake, content, settings):
    client = fake(_response(_text('{"match_score": 50, "missing_keywords": [], "suggestions": []}')))
    real_tailor_to_jd(content, "Python")
    call = client.beta.messages.calls[0]
    assert call["fallbacks"] == [{"model": "claude-sonnet-5", "max_tokens": 8000}]
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    with_fallback = AIReservation.objects.get().amount_micros
    settings.AI_SERVER_SIDE_FALLBACK = False
    real_tailor_to_jd(content, "Python")
    assert len(client.messages.calls) == 1 and "fallbacks" not in client.messages.calls[0]
    single = AIReservation.objects.exclude(amount_micros=with_fallback).get().amount_micros
    # reservation_micros rounds the sum up, so an odd byte count can differ by one.
    assert 2 * single - 1 <= with_fallback <= 2 * single
