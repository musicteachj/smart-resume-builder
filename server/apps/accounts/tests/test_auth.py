from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
ME = "/api/auth/me"

VALID = {"name": "Maya Chen", "email": "maya@example.com", "password": "sup3rSecret!"}


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_register_creates_user_and_returns_tokens(client):
    res = client.post(REGISTER, VALID, format="json")
    assert res.status_code == 201
    body = res.json()
    assert body["access"]
    assert "refresh" not in body  # refresh is an httpOnly cookie now
    cookie = res.cookies.get("refresh_token")
    assert cookie is not None and cookie["httponly"]
    assert body["user"]["email"] == "maya@example.com"
    assert body["user"]["is_admin"] is False
    assert body["user"]["ai_usage"]["daily_limit"] == 10
    assert User.objects.filter(email="maya@example.com").exists()


@pytest.mark.django_db
def test_register_normalizes_email_and_rejects_duplicate(client):
    assert client.post(REGISTER, VALID, format="json").status_code == 201
    dup = {**VALID, "email": "MAYA@example.com"}
    res = client.post(REGISTER, dup, format="json")
    assert res.status_code == 400
    assert "email" in res.json()


@pytest.mark.django_db
def test_register_rejects_weak_password(client):
    res = client.post(REGISTER, {**VALID, "password": "123"}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()


@pytest.mark.django_db
def test_login_returns_access_and_sets_refresh_cookie(client):
    client.post(REGISTER, VALID, format="json")
    res = client.post(
        LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["access"]
    assert "refresh" not in body
    assert res.cookies.get("refresh_token") is not None
    assert body["user"]["email"] == "maya@example.com"


@pytest.mark.django_db
def test_refresh_uses_cookie_and_returns_access(client):
    client.post(REGISTER, VALID, format="json")
    client.post(LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json")
    # The test client persists cookies across requests, so the refresh cookie is sent automatically.
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert res.json()["access"]


@pytest.mark.django_db
def test_refresh_without_cookie_is_unauthorized(client):
    assert client.post("/api/auth/refresh").status_code == 401


@pytest.mark.django_db
def test_refresh_rotates_the_cookie_and_blacklists_the_old_token(client):
    reg = client.post(REGISTER, VALID, format="json")
    original = reg.cookies["refresh_token"].value

    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    rotated = res.cookies["refresh_token"].value
    assert rotated and rotated != original

    # Replaying the pre-rotation token must fail (blacklisted).
    client.cookies["refresh_token"] = original
    assert client.post("/api/auth/refresh").status_code == 401

    # The rotated token still works.
    client.cookies["refresh_token"] = rotated
    assert client.post("/api/auth/refresh").status_code == 200


@pytest.mark.django_db
def test_logout_revokes_the_refresh_token(client):
    reg = client.post(REGISTER, VALID, format="json")
    token = reg.cookies["refresh_token"].value

    assert client.post("/api/auth/logout").status_code == 204

    # Re-presenting the logged-out token must fail even before its expiry.
    client.cookies["refresh_token"] = token
    assert client.post("/api/auth/refresh").status_code == 401


def _send_expired_bearer(client, user):
    """The SPA sends its in-memory access token on every request; after 15 minutes it's expired."""
    expired = AccessToken.for_user(user)
    expired.set_exp(lifetime=-timedelta(minutes=1))
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {expired}")


@pytest.mark.django_db
def test_refresh_works_with_an_expired_bearer(client):
    # Regression: the expired Bearer made DRF 401 before the view ran, so the
    # silent refresh failed and users were logged out ~15 minutes in.
    client.post(REGISTER, VALID, format="json")
    _send_expired_bearer(client, User.objects.get(email=VALID["email"]))
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert res.json()["access"]


@pytest.mark.django_db
def test_logout_with_an_expired_bearer_still_revokes_the_cookie(client):
    reg = client.post(REGISTER, VALID, format="json")
    token = reg.cookies["refresh_token"].value
    _send_expired_bearer(client, User.objects.get(email=VALID["email"]))

    assert client.post("/api/auth/logout").status_code == 204

    client.credentials()
    client.cookies["refresh_token"] = token
    assert client.post("/api/auth/refresh").status_code == 401


@pytest.mark.django_db
def test_register_and_login_ignore_a_stale_bearer(client):
    client.post(REGISTER, VALID, format="json")
    _send_expired_bearer(client, User.objects.get(email=VALID["email"]))
    other = {**VALID, "email": "other@example.com"}
    assert client.post(REGISTER, other, format="json").status_code == 201
    creds = {"email": VALID["email"], "password": VALID["password"]}
    assert client.post(LOGIN, creds, format="json").status_code == 200


@pytest.mark.django_db
def test_logout_clears_the_cookie(client):
    client.post(REGISTER, VALID, format="json")
    res = client.post("/api/auth/logout")
    assert res.status_code == 204
    # delete_cookie sets the cookie to empty with a past expiry.
    assert res.cookies["refresh_token"].value == ""


@pytest.mark.django_db
def test_login_rejects_bad_password(client):
    client.post(REGISTER, VALID, format="json")
    res = client.post(
        LOGIN, {"email": VALID["email"], "password": "wrong"}, format="json"
    )
    assert res.status_code == 401


@pytest.mark.django_db
def test_me_requires_auth(client):
    assert client.get(ME).status_code == 401


@pytest.mark.django_db
def test_me_returns_current_user_with_token(client):
    reg = client.post(REGISTER, VALID, format="json").json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg['access']}")
    res = client.get(ME)
    assert res.status_code == 200
    assert res.json()["email"] == "maya@example.com"


@pytest.mark.django_db
def test_set_admin_command_grants_and_revokes(client):
    # Admin is never granted by email at register/login (anyone could register the
    # admin's address first, unverified); only this command, run by the operator, grants it.
    from django.core.management import call_command

    client.post(REGISTER, VALID, format="json")
    assert User.objects.get(email="maya@example.com").is_admin is False

    call_command("set_admin", "MAYA@example.com")
    assert User.objects.get(email="maya@example.com").is_admin is True

    call_command("set_admin", "maya@example.com", "--revoke")
    assert User.objects.get(email="maya@example.com").is_admin is False


@pytest.mark.django_db
def test_set_admin_command_rejects_unknown_email():
    from django.core.management import call_command
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("set_admin", "nobody@example.com")
