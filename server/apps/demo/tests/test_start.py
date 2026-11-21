import logging
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.demo.messages import START_REFUSALS
from apps.demo.sample import SAMPLE_CONTENT, SAMPLE_TITLE
from apps.demo.turnstile import Verdict
from apps.resumes.models import Resume

User = get_user_model()
START = "/api/demo/start"
BODY = {"turnstile_token": "t"}


@pytest.fixture(autouse=True)
def _demo_on(settings):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    settings.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"


@pytest.fixture
def client():
    return APIClient()


def _verdict(monkeypatch, verdict):
    calls = []

    def fake(token, remote_ip):
        calls.append((token, remote_ip))
        return verdict

    monkeypatch.setattr("apps.demo.views.turnstile.verify", fake)
    return calls


def test_start_is_404_outside_demo_mode(client, settings, monkeypatch):
    settings.DEMO_MODE = False
    calls = _verdict(monkeypatch, Verdict.PASSED)
    assert client.post(START, BODY, format="json").status_code == 404
    assert calls == []
    assert not User.objects.filter(is_guest=True).exists()


def test_start_creates_a_guest_with_the_sample_resume(client, monkeypatch):
    calls = _verdict(monkeypatch, Verdict.PASSED)
    res = client.post(START, {"turnstile_token": "t"}, format="json")
    assert res.status_code == 201
    assert calls == [("t", "127.0.0.1")]
    guest = User.objects.get(pk=res.json()["user"]["id"])
    assert guest.is_guest and guest.email.endswith("@demo.invalid") and not guest.has_usable_password()
    assert res.json()["user"]["is_guest"] is True
    assert res.json()["access"]
    resume = Resume.objects.get(pk=res.json()["resume_id"], user=guest)
    assert (resume.title, resume.content) == (SAMPLE_TITLE, SAMPLE_CONTENT)
    assert resume.template == "classic"
    assert abs(int(res.cookies["refresh_token"]["max-age"]) - 86_400) <= 5
    exp = RefreshToken(res.cookies["refresh_token"].value)["exp"]
    assert exp <= guest.guest_expires_at.timestamp() + 1
    outstanding = OutstandingToken.objects.get(user=guest)
    assert outstanding.expires_at <= guest.guest_expires_at + timedelta(seconds=1)
    assert res.cookies["refresh_token"]["httponly"]


def test_start_gives_the_guest_the_configured_lifetime(client, settings, monkeypatch):
    settings.DEMO_GUEST_TTL_HOURS = 2
    _verdict(monkeypatch, Verdict.PASSED)
    res = client.post(START, BODY, format="json")
    guest = User.objects.get(pk=res.json()["user"]["id"])
    assert abs((guest.guest_expires_at - timezone.now()).total_seconds() - 7200) < 10
    assert abs(int(res.cookies["refresh_token"]["max-age"]) - 7200) <= 5


def test_the_access_token_works(client, monkeypatch):
    _verdict(monkeypatch, Verdict.PASSED)
    access = client.post(START, BODY, format="json").json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["is_guest"] is True


def test_start_logs_the_guest_id_but_never_the_ip_or_token(client, monkeypatch, caplog):
    _verdict(monkeypatch, Verdict.PASSED)
    with caplog.at_level(logging.INFO):
        res = client.post(START, {"turnstile_token": "secret-token-value"}, format="json")
    guest_id = res.json()["user"]["id"]
    assert str(guest_id) in caplog.text
    assert "secret-token-value" not in caplog.text
    assert "127.0.0.1" not in caplog.text


def test_start_rejects_a_missing_or_oversized_token(client, monkeypatch):
    calls = _verdict(monkeypatch, Verdict.PASSED)
    assert client.post(START, {}, format="json").status_code == 400
    assert client.post(START, {"turnstile_token": ""}, format="json").status_code == 400
    assert client.post(START, {"turnstile_token": "x" * 2049}, format="json").status_code == 400
    assert calls == []


def test_start_when_the_bot_check_fails(client, monkeypatch):
    _verdict(monkeypatch, Verdict.FAILED)
    res = client.post(START, BODY, format="json")
    assert res.status_code == 403
    assert res.json() == {"detail": START_REFUSALS["bot_check_failed"][1], "code": "bot_check_failed"}
    assert res.json()["detail"] == (
        "We couldn't confirm you're a person. Please try the check again."
    )
    assert not User.objects.filter(is_guest=True).exists()
    assert not Resume.objects.exists()
    assert "refresh_token" not in res.cookies


def test_start_when_the_bot_check_is_unavailable(client, monkeypatch):
    _verdict(monkeypatch, Verdict.UNAVAILABLE)
    res = client.post(START, BODY, format="json")
    assert res.status_code == 503
    assert res.json()["code"] == "bot_check_unavailable"
    assert res.json()["detail"] == (
        "The bot check isn't available right now, so new demos can't start. "
        "The screenshots on this page show what the app does."
    )
    assert not User.objects.filter(is_guest=True).exists()


def test_start_when_the_demo_is_full(client, settings, guest, monkeypatch):
    settings.DEMO_MAX_LIVE_GUESTS = 1
    calls = _verdict(monkeypatch, Verdict.PASSED)
    res = client.post(START, BODY, format="json")
    assert res.status_code == 503
    assert res.json()["code"] == "demo_full"
    assert res.json()["detail"] == (
        "The demo is full right now. The screenshots on this page show what the app does. "
        "Please check back later."
    )
    assert calls == []
    assert User.objects.filter(is_guest=True).count() == 1


def test_expired_guests_do_not_count_toward_the_cap(client, settings, make_guest, monkeypatch):
    settings.DEMO_MAX_LIVE_GUESTS = 1
    make_guest(expires=timezone.now() - timedelta(hours=1))
    _verdict(monkeypatch, Verdict.PASSED)
    assert client.post(START, BODY, format="json").status_code == 201


def test_start_is_limited_per_ip(client, monkeypatch):
    monkeypatch.setattr(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {"demo-start-hour": "2/hour", "demo-start-day": None},
    )
    cache.clear()
    _verdict(monkeypatch, Verdict.PASSED)
    assert client.post(START, BODY, format="json").status_code == 201
    assert client.post(START, BODY, format="json").status_code == 201
    res = client.post(START, BODY, format="json")
    assert res.status_code == 429
    assert res.json()["code"] == "demo_rate_limited"
    assert res.json()["detail"] == (
        "A lot of demos have started from your network recently. Please try again later. "
        "The screenshots on this page show what the app does."
    )
    assert int(res["Retry-After"]) > 0
    assert User.objects.filter(is_guest=True).count() == 2


def test_the_day_limit_applies_too_and_other_ips_are_separate(client, monkeypatch):
    monkeypatch.setattr(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {"demo-start-hour": None, "demo-start-day": "1/day"},
    )
    cache.clear()
    _verdict(monkeypatch, Verdict.PASSED)
    assert client.post(START, BODY, format="json").status_code == 201
    assert client.post(START, BODY, format="json").status_code == 429
    elsewhere = client.post(START, BODY, format="json", REMOTE_ADDR="203.0.113.9")
    assert elsewhere.status_code == 201


def test_throttle_rates_are_configured_from_settings(settings):
    from rest_framework.settings import api_settings

    rates = api_settings.DEFAULT_THROTTLE_RATES
    assert rates["demo-start-hour"] == f"{settings.DEMO_STARTS_PER_HOUR}/hour"
    assert rates["demo-start-day"] == f"{settings.DEMO_STARTS_PER_DAY}/day"


def test_a_stale_bearer_does_not_block_a_start(client, monkeypatch):
    _verdict(monkeypatch, Verdict.PASSED)
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
    assert client.post(START, BODY, format="json").status_code == 201


def test_start_answers_503_not_500_when_the_reply_is_garbled(client, settings, monkeypatch):
    import http.client
    from unittest.mock import Mock

    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=http.client.IncompleteRead(b"")))
    res = client.post(START, BODY, format="json")
    assert (res.status_code, res.json()["code"]) == (503, "bot_check_unavailable")
    assert not User.objects.filter(is_guest=True).exists()


def test_start_answers_403_not_500_for_a_malformed_object(client, settings, monkeypatch):
    import io
    import json
    from unittest.mock import Mock

    class Reply(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    settings.ALLOWED_HOSTS = ["testserver", "resumeiq.jameslittlefield.net"]
    body = json.dumps({"success": True, "hostname": ["x"], "error-codes": [["y"]]}).encode()
    monkeypatch.setattr("urllib.request.urlopen", Mock(return_value=Reply(body)))
    res = client.post(START, BODY, format="json")
    assert (res.status_code, res.json()["code"]) == (403, "bot_check_failed")
    assert not User.objects.filter(is_guest=True).exists()


def test_the_cookie_never_outlives_the_seven_day_refresh_token(client, settings, monkeypatch):
    settings.DEMO_GUEST_TTL_HOURS = 24 * 30
    _verdict(monkeypatch, Verdict.PASSED)
    res = client.post(START, BODY, format="json")
    assert int(res.cookies["refresh_token"]["max-age"]) == 7 * 24 * 3600
    exp = RefreshToken(res.cookies["refresh_token"].value)["exp"]
    assert exp - timezone.now().timestamp() <= 7 * 24 * 3600 + 5
