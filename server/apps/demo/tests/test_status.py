from datetime import UTC, datetime, timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from apps.ai import ledger

URL = "/api/demo/status"


def test_status_is_public_and_describes_the_demo(db, settings):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    res = APIClient().get(URL)
    assert res.json() == {
        "demo_mode": True,
        "turnstile_site_key": "1x00000000000000000000AA",
        "ai_available": True,
        "ai_reason": "ok",
        "guest_start_available": True,
    }
    assert res.headers["Cache-Control"] == "public, max-age=60"


def test_status_ignores_a_stale_bearer_token(db):
    res = APIClient().get(URL, HTTP_AUTHORIZATION="Bearer not-a-real-token")
    assert res.status_code == 200


def test_status_says_live_ai_is_off(db, settings):
    settings.AI_MONTHLY_BUDGET_USD = 0
    body = APIClient().get(URL).json()
    assert body["ai_available"] is False
    assert body["ai_reason"] == "off"


def test_status_says_todays_budget_is_used(db, at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))  # default $10 budget: day one allows $1.00
    ledger.reserve(amount_micros=750_001, feature="improve_bullet", model="m", visitor_id=None)
    assert ledger.room_today_micros() == 249_999
    body = APIClient().get(URL).json()
    assert body["ai_available"] is False
    assert body["ai_reason"] == "daily_used"


def test_status_is_cached_for_a_minute(db, monkeypatch):
    calls = []

    def room():
        calls.append(1)
        return 1_000_000

    monkeypatch.setattr(ledger, "room_today_micros", room)
    first = APIClient().get(URL)
    second = APIClient().get(URL)
    assert first.json() == second.json()
    assert len(calls) == 1


def test_status_outside_demo_mode_offers_no_guest_start(db, settings):
    settings.DEMO_MODE = False
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    body = APIClient().get(URL).json()
    assert body["demo_mode"] is False
    assert body["guest_start_available"] is False


def test_guest_start_needs_a_turnstile_site_key(db, settings):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = ""
    assert APIClient().get(URL).json()["guest_start_available"] is False


def test_guest_start_is_unavailable_at_the_live_guest_cap(db, settings, guest, make_guest):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    settings.DEMO_MAX_LIVE_GUESTS = 1
    assert APIClient().get(URL).json()["guest_start_available"] is False


def test_an_expired_guest_does_not_count_toward_the_cap(db, settings, make_guest):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    settings.DEMO_MAX_LIVE_GUESTS = 1
    make_guest(expires=timezone.now() - timedelta(minutes=1))
    assert APIClient().get(URL).json()["guest_start_available"] is True
