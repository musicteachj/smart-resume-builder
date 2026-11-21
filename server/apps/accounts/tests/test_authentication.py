"""The default API authentication refuses a demo guest past its expiry, even with a live access token.

These tests send real Bearer tokens: `force_authenticate` would skip the authentication classes."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.ai.models import AIUsageLog

ME = "/api/auth/me"
IMPROVE = "/api/ai/improve-bullet"
RESUMES = "/api/resumes/"


def bearer(user) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


@pytest.fixture(autouse=True)
def stub_ai(monkeypatch):
    monkeypatch.setattr("apps.ai.service.improve_bullet", lambda text, role="", **_kw: "Better: " + text)


@pytest.mark.django_db
@pytest.mark.parametrize("url, body", [(ME, None), (IMPROVE, {"text": "Led a team."}), (RESUMES, None)])
def test_an_expired_guest_gets_session_ended_with_a_live_access_token(make_guest, url, body):
    guest = make_guest(expires=timezone.now() - timedelta(seconds=1))
    client = bearer(guest)
    res = client.post(url, body, format="json") if body else client.get(url)
    assert res.status_code == 401
    assert res.json() == {"detail": "Your session ended.", "code": "session_ended"}
    assert "Bearer" in res.headers["WWW-Authenticate"]
    guest.refresh_from_db()
    assert guest.ai_calls_this_month == 0
    assert not AIUsageLog.objects.exists()


@pytest.mark.django_db
def test_a_live_guest_is_unaffected(make_guest):
    guest = make_guest(expires=timezone.now() + timedelta(minutes=5))
    client = bearer(guest)
    assert client.get(ME).status_code == 200
    res = client.post(IMPROVE, {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()["suggestion"]) == (200, "Better: Led a team.")


@pytest.mark.django_db
def test_an_account_is_unaffected(user):
    client = bearer(user)
    assert client.get(ME).status_code == 200
    assert client.post(IMPROVE, {"text": "Led a team."}, format="json").status_code == 200


@pytest.mark.django_db
def test_the_demo_views_ignore_an_expired_guests_bearer(make_guest):
    # The demo status and start views have no authentication, so a stale Bearer never 401s them.
    client = bearer(make_guest(expires=timezone.now() - timedelta(seconds=1)))
    assert client.get("/api/demo/status").status_code == 200
