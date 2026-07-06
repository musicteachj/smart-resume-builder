import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

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
def test_admin_email_sets_is_admin(client, settings):
    settings.ADMIN_EMAILS = ["maya@example.com"]
    res = client.post(REGISTER, VALID, format="json")
    assert res.status_code == 201
    assert res.json()["user"]["is_admin"] is True
    assert User.objects.get(email="maya@example.com").is_admin is True
