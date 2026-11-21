from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

from apps.ai import ledger
from apps.ai.pricing import Attempt, input_token_bound, reservation_micros
from apps.ai.prompts import IMPROVE_BULLET
from apps.ai.refusals import REFUSALS
from apps.ai.service import (
    AIBudgetRefusedError,
    AIProviderLimitError,
    AIServiceError,
    AIUnavailableError,
)
from apps.ai.service import improve_bullet as real_improve_bullet

from .conftest import make_content

AI_ROUTES = [
    ("improve-bullet", {"text": "Led a team."}),
    ("generate-summary", {"content": make_content()}),
    ("tailor-jd", {"content": make_content(), "job_description": "Python"}),
    ("cover-letter", {"content": make_content(), "job_description": "Python"}),
    ("ats-check", {"content": make_content()}),
    ("parse-resume", {"text": "Jordan Rivera, engineer"}),
]


@pytest.mark.django_db
@pytest.mark.parametrize("route, body", AI_ROUTES)
def test_budget_off_refuses_every_route_with_the_free_path(auth_client, user, settings, route, body):
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    res = auth_client.post(f"/api/ai/{route}", body, format="json")
    assert (res.status_code, res.json()["code"]) == (503, "ai_off")
    user.refresh_from_db()
    assert user.ai_calls_today == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "raised, status, code",
    [
        (AIBudgetRefusedError("off"), 503, "ai_off"),
        (AIBudgetRefusedError("daily"), 503, "ai_daily_used"),
        (AIBudgetRefusedError("visitor"), 429, "ai_visitor_used"),
        (AIBudgetRefusedError("visitor_busy"), 429, "ai_busy"),
        (AIProviderLimitError("limit"), 503, "ai_provider_limit"),
        (AIUnavailableError("down"), 502, "ai_unavailable"),
        (AIServiceError("missing ANTHROPIC_API_KEY"), 502, "ai_unavailable"),
    ],
)
def test_refusals_are_friendly_in_production(auth_client, user, settings, monkeypatch, raised, status, code):
    settings.DEBUG = False
    monkeypatch.setattr("apps.ai.service.improve_bullet", Mock(side_effect=raised))
    res = auth_client.post("/api/ai/improve-bullet", {"text": "\U0001d49c" * 2000}, format="json")
    assert (res.status_code, res.json()) == (status, {"detail": REFUSALS[code][1], "code": code})
    assert chr(0x2014) not in res.json()["detail"]
    user.refresh_from_db()
    assert user.ai_calls_today == 0  # the per-user slot is refunded


@pytest.mark.django_db
def test_emoji_and_cjk_at_the_cap_get_the_friendly_daily_refusal_through_the_real_service(
    auth_client, user, settings, monkeypatch, fake
):
    """End to end through the real service and ledger (only the Anthropic client is faked): a bullet at the
    2,000-character cap made of 4-byte emoji and 3-byte CJK is reserved by its UTF-8 bytes, so a site budget
    that a character count would fit refuses it with the friendly copy, and nothing is sent."""
    settings.DEBUG = False
    monkeypatch.setattr("apps.ai.service.improve_bullet", real_improve_bullet)  # undo the autouse stub
    text = "\U0001F600\u5c65" * 1000  # 2,000 characters, 7,000 UTF-8 bytes
    messages = [{"role": "user", "content": f"Rewrite this resume bullet:\n\n{text}"}]
    by_bytes = input_token_bound(system=IMPROVE_BULLET, messages=messages, output_config={"effort": "low"})
    by_chars = by_bytes - (len(text.encode()) - len(text))
    attempts = [Attempt(settings.AI_MODEL_SIMPLE, 1024)]
    amount, char_amount = reservation_micros(attempts, by_bytes), reservation_micros(attempts, by_chars)
    allowance = (amount + char_amount) // 2
    assert char_amount < allowance < amount
    # A month's budget equal to the daily floor makes today's allowance exactly that amount.
    settings.AI_MONTHLY_BUDGET_USD = settings.AI_DAILY_FLOOR_USD = Decimal(allowance) / Decimal(1_000_000)

    asked = []
    real_reserve = ledger.reserve
    monkeypatch.setattr(ledger, "reserve", lambda **kw: asked.append(kw["amount_micros"]) or real_reserve(**kw))
    client = fake(SimpleNamespace())  # never reached

    res = auth_client.post("/api/ai/improve-bullet", {"text": text}, format="json")
    assert (res.status_code, res.json()) == (503, {"detail": REFUSALS["ai_daily_used"][1], "code": "ai_daily_used"})
    assert asked == [amount]  # the reservation counted bytes, not characters
    assert client.messages.calls == [] and client.beta.messages.calls == []
    user.refresh_from_db()
    assert user.ai_calls_today == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    "raised, status, code",
    [
        (AIServiceError("missing ANTHROPIC_API_KEY"), 502, "ai_unavailable"),
        (AIProviderLimitError("spend limit ANTHROPIC_API_KEY"), 503, "ai_provider_limit"),
    ],
)
def test_debug_also_gets_the_table_copy_never_the_exception_text(
    auth_client, settings, monkeypatch, raised, status, code
):
    settings.DEBUG = True
    monkeypatch.setattr("apps.ai.service.improve_bullet", Mock(side_effect=raised))
    res = auth_client.post("/api/ai/improve-bullet", {"text": "x"}, format="json")
    assert (res.status_code, res.json()) == (status, {"detail": REFUSALS[code][1], "code": code})


BUSY_COPY = (
    "Another AI request from this demo is still running. Please wait for it to finish, then try again. "
    "You can still edit, switch templates, and export your resume as a PDF or Word file."
)


def test_busy_refusal_copy_is_exact():
    assert REFUSALS["ai_busy"] == (429, BUSY_COPY)


@pytest.mark.django_db
def test_a_guest_whose_own_call_is_in_flight_is_told_to_wait(guest_client, guest, settings, monkeypatch, fake):
    """Through the real service and ledger (only the Anthropic client is faked): the guest's earlier call holds
    their whole allowance, so the next one gets `ai_busy` (not "used up"), nothing is sent, and the per-user call
    slot is refunded."""
    settings.DEBUG = False
    settings.AI_VISITOR_BUDGET_USD = Decimal("0.01")
    monkeypatch.setattr("apps.ai.service.improve_bullet", real_improve_bullet)  # undo the autouse stub
    ledger.reserve(amount_micros=10_000, feature="tailor-jd", model=settings.AI_MODEL_TAILOR, visitor_id=guest.pk)
    client = fake(SimpleNamespace())  # never reached

    res = guest_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()) == (429, {"detail": BUSY_COPY, "code": "ai_busy"})
    assert client.messages.calls == [] and client.beta.messages.calls == []
    guest.refresh_from_db()
    assert guest.ai_calls_today == 0 and guest.ai_calls_this_month == 0


@pytest.mark.django_db
def test_an_unpriced_model_that_slipped_past_startup_is_a_clean_502(auth_client, user, settings, monkeypatch, fake):
    """Through the real service: no reservation is opened, nothing is sent, and the per-user slot is refunded."""
    from apps.ai.models import AIReservation

    settings.DEBUG = False
    settings.AI_MODEL_SIMPLE = "claude-mystery"  # startup would refuse this; the override bypasses that check
    monkeypatch.setattr("apps.ai.service.improve_bullet", real_improve_bullet)  # undo the autouse stub
    client = fake(SimpleNamespace())  # never reached

    res = auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()) == (502, {"detail": REFUSALS["ai_unavailable"][1], "code": "ai_unavailable"})
    assert client.messages.calls == [] and client.beta.messages.calls == []
    assert not AIReservation.objects.exists()
    user.refresh_from_db()
    assert user.ai_calls_today == 0


@pytest.mark.django_db
def test_burst_throttle_is_friendly(auth_client, monkeypatch):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, "ai-burst": "1/hour"})
    cache.clear()
    auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    res = auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()["code"]) == (429, "ai_rate_limited")
    assert res.json()["detail"] == REFUSALS["ai_rate_limited"][1]
    assert "Retry-After" in res.headers


@pytest.mark.django_db
def test_admins_and_debug_still_pay_in_dollars(auth_client, user, settings):
    user.is_admin = True
    user.save()
    settings.DEBUG = True
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    assert auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json").status_code == 503
