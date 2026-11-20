from decimal import Decimal
from unittest.mock import Mock

import pytest
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

from apps.ai.refusals import REFUSALS
from apps.ai.service import (
    AIBudgetRefusedError,
    AIProviderLimitError,
    AIServiceError,
    AIUnavailableError,
)

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
def test_debug_keeps_the_raw_message_with_the_same_code(auth_client, settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setattr("apps.ai.service.improve_bullet", Mock(side_effect=AIServiceError("missing ANTHROPIC_API_KEY")))
    res = auth_client.post("/api/ai/improve-bullet", {"text": "x"}, format="json")
    assert (res.status_code, res.json()["code"]) == (502, "ai_unavailable")
    assert "ANTHROPIC_API_KEY" in res.json()["detail"]


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
