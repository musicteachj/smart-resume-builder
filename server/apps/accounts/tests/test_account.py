"""Account features: password reset (request + confirm), account deletion, and the
password-similarity check at registration."""

import re
from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.ai.models import AIUsageLog
from apps.resumes.models import CoverLetter, Resume, ResumeVersion

User = get_user_model()

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
REFRESH = "/api/auth/refresh"
ME = "/api/auth/me"
RESET = "/api/auth/password-reset"
RESET_CONFIRM = "/api/auth/password-reset/confirm"
DELETE = "/api/auth/delete-account"

VALID = {"name": "Maya Chen", "email": "maya@example.com", "password": "sup3rSecret!"}
NEW_PASSWORD = "brand-New-pass-42"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def _client_url(settings):
    # The reset link is built only from CLIENT_URL; pin it so these tests don't depend on
    # the DEBUG-dependent default.
    settings.CLIENT_URL = "http://app.test"


def _register(client):
    res = client.post(REGISTER, VALID, format="json")
    assert res.status_code == 201
    return res


def _reset_link(mailoutbox):
    assert len(mailoutbox) == 1
    match = re.search(r"https?://\S+/reset-password#\S+", mailoutbox[0].body)
    assert match, mailoutbox[0].body
    query = parse_qs(urlparse(match.group(0)).fragment)
    return match.group(0), query["uid"][0], query["token"][0]


# --- Registration: password similarity ------------------------------------------


@pytest.mark.django_db
def test_register_rejects_a_password_similar_to_the_email(client):
    res = client.post(REGISTER, {**VALID, "password": "maya@example"}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()
    assert not User.objects.filter(email=VALID["email"]).exists()


@pytest.mark.django_db
def test_register_rejects_a_password_similar_to_the_name(client):
    res = client.post(REGISTER, {**VALID, "password": "mayachen1"}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()


@pytest.mark.django_db
def test_register_reports_email_and_password_errors_together(client):
    _register(client)
    res = client.post(REGISTER, {**VALID, "password": "123"}, format="json")
    assert res.status_code == 400
    body = res.json()
    assert "email" in body and "password" in body


# --- Password reset: request ------------------------------------------------------


@pytest.mark.django_db
@override_settings(CLIENT_URL="http://app.test")
def test_reset_request_responds_the_same_for_known_and_unknown_emails(client, mailoutbox):
    _register(client)
    known = client.post(RESET, {"email": "MAYA@example.com"}, format="json")
    unknown = client.post(RESET, {"email": "nobody@example.com"}, format="json")

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()

    # Only the real account got an email, with a link to the SPA's reset page.
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["maya@example.com"]
    link, uid, token = _reset_link(mailoutbox)
    assert link.startswith("http://app.test/reset-password#")
    assert uid and token


@pytest.mark.django_db
@override_settings(CLIENT_URL="", ALLOWED_HOSTS=["testserver", "evil.example"])
def test_reset_never_builds_the_link_from_the_request_host(client, mailoutbox, caplog):
    # Without CLIENT_URL there is no trusted host, so nothing is sent (a forged Host
    # header must never decide where the reset link points).
    _register(client)
    with caplog.at_level("ERROR", logger="apps.accounts.views"):
        res = client.post(
            RESET, {"email": VALID["email"]}, format="json", HTTP_HOST="evil.example"
        )
    assert res.status_code == 202
    assert res.json() == {"detail": "If an account exists for that email, we sent a reset link."}
    assert mailoutbox == []
    assert "CLIENT_URL is not set" in caplog.text


@pytest.mark.django_db
@override_settings(ALLOWED_HOSTS=["testserver", "evil.example"])
def test_reset_link_ignores_a_forged_host_header(client, mailoutbox):
    _register(client)
    client.post(RESET, {"email": VALID["email"]}, format="json", HTTP_HOST="evil.example")
    link, _, _ = _reset_link(mailoutbox)
    assert link.startswith("http://app.test/reset-password#")


@pytest.mark.django_db
def test_reset_request_survives_an_email_failure(client, mailoutbox, caplog, monkeypatch):
    def broken_send_mail(**kwargs):
        raise ConnectionError("provider down")

    monkeypatch.setattr("apps.accounts.views.send_mail", broken_send_mail)
    _register(client)
    with caplog.at_level("WARNING", logger="apps.accounts.views"):
        known = client.post(RESET, {"email": VALID["email"]}, format="json")
    unknown = client.post(RESET, {"email": "nobody@example.com"}, format="json")

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert "could not be sent" in caplog.text
    assert "reset-password#" not in caplog.text
    assert VALID["email"] not in caplog.text


@pytest.mark.django_db
def test_reset_request_skips_inactive_users(client, mailoutbox):
    _register(client)
    User.objects.filter(email=VALID["email"]).update(is_active=False)
    res = client.post(RESET, {"email": VALID["email"]}, format="json")
    assert res.status_code == 202
    assert mailoutbox == []


@pytest.mark.django_db
def test_reset_request_validates_the_email_field(client):
    res = client.post(RESET, {"email": "not-an-email"}, format="json")
    assert res.status_code == 400
    assert "email" in res.json()


@pytest.mark.django_db
@override_settings(EMAIL_BACKEND="django.core.mail.backends.dummy.EmailBackend")
def test_reset_request_warns_when_email_is_not_configured(client, caplog):
    _register(client)
    with caplog.at_level("WARNING", logger="apps.accounts.views"):
        res = client.post(RESET, {"email": VALID["email"]}, format="json")
    assert res.status_code == 202
    assert "dummy" in caplog.text.lower()
    assert "reset-password#" not in caplog.text  # never log the link


@pytest.mark.django_db
def test_reset_request_ignores_a_stale_bearer(client, mailoutbox):
    _register(client)
    client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
    assert client.post(RESET, {"email": VALID["email"]}, format="json").status_code == 202


# --- Password reset: confirm ------------------------------------------------------


@pytest.mark.django_db
def test_reset_confirm_sets_the_new_password(client, mailoutbox):
    _register(client)
    client.post(RESET, {"email": VALID["email"]}, format="json")
    _, uid, token = _reset_link(mailoutbox)

    res = client.post(
        RESET_CONFIRM, {"uid": uid, "token": token, "new_password": NEW_PASSWORD}, format="json"
    )
    assert res.status_code == 204

    fresh = APIClient()
    old = fresh.post(LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json")
    assert old.status_code == 401
    new = fresh.post(LOGIN, {"email": VALID["email"], "password": NEW_PASSWORD}, format="json")
    assert new.status_code == 200


@pytest.mark.django_db
def test_reset_confirm_revokes_existing_refresh_tokens(client, mailoutbox):
    reg = _register(client)
    first = reg.cookies["refresh_token"].value
    other_device = APIClient()
    login = other_device.post(
        LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json"
    )
    second = login.cookies["refresh_token"].value

    client.post(RESET, {"email": VALID["email"]}, format="json")
    _, uid, token = _reset_link(mailoutbox)
    res = client.post(
        RESET_CONFIRM, {"uid": uid, "token": token, "new_password": NEW_PASSWORD}, format="json"
    )
    assert res.status_code == 204

    for refresh in (first, second):
        probe = APIClient()
        probe.cookies["refresh_token"] = refresh
        assert probe.post(REFRESH).status_code == 401


@pytest.mark.django_db
def test_reset_confirm_rejects_a_reused_token(client, mailoutbox):
    _register(client)
    client.post(RESET, {"email": VALID["email"]}, format="json")
    _, uid, token = _reset_link(mailoutbox)
    payload = {"uid": uid, "token": token, "new_password": NEW_PASSWORD}

    assert client.post(RESET_CONFIRM, payload, format="json").status_code == 204
    again = client.post(RESET_CONFIRM, {**payload, "new_password": "another-Pass-77"}, format="json")
    assert again.status_code == 400
    assert again.json() == {"detail": "This reset link is invalid or has expired."}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "tamper",
    [
        lambda uid, token: {"uid": uid, "token": token + "x"},
        lambda uid, token: {"uid": "bm9wZQ", "token": token},  # base64 "nope"
        lambda uid, token: {"uid": "!!!", "token": token},
        lambda uid, token: {"uid": "OTk5OTk5", "token": token},  # base64 "999999": no such user
    ],
)
def test_reset_confirm_rejects_a_bad_link(client, mailoutbox, tamper):
    _register(client)
    client.post(RESET, {"email": VALID["email"]}, format="json")
    _, uid, token = _reset_link(mailoutbox)

    res = client.post(
        RESET_CONFIRM, {**tamper(uid, token), "new_password": NEW_PASSWORD}, format="json"
    )
    assert res.status_code == 400
    assert res.json() == {"detail": "This reset link is invalid or has expired."}


@pytest.mark.django_db
@pytest.mark.parametrize("weak", ["123", "password", "maya@example", "mayachen1"])
def test_reset_confirm_rejects_weak_or_similar_passwords(client, mailoutbox, weak):
    _register(client)
    client.post(RESET, {"email": VALID["email"]}, format="json")
    _, uid, token = _reset_link(mailoutbox)

    res = client.post(
        RESET_CONFIRM, {"uid": uid, "token": token, "new_password": weak}, format="json"
    )
    assert res.status_code == 400
    assert "new_password" in res.json()
    # The link still works after a rejected password.
    ok = client.post(
        RESET_CONFIRM, {"uid": uid, "token": token, "new_password": NEW_PASSWORD}, format="json"
    )
    assert ok.status_code == 204


@pytest.mark.django_db
def test_reset_request_is_throttled_separately_from_confirm(client, mailoutbox, monkeypatch):
    rates = {**SimpleRateThrottle.THROTTLE_RATES, "password-reset": "2/hour"}
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", rates)
    cache.clear()
    try:
        _register(client)
        for _ in range(2):
            assert client.post(RESET, {"email": VALID["email"]}, format="json").status_code == 202
        assert client.post(RESET, {"email": VALID["email"]}, format="json").status_code == 429

        # Confirm has its own bucket, so weak-password retries still get through.
        _, uid, token = _reset_link(mailoutbox[:1])
        weak = {"uid": uid, "token": token, "new_password": "123"}
        assert client.post(RESET_CONFIRM, weak, format="json").status_code == 400
        ok = {**weak, "new_password": NEW_PASSWORD}
        assert client.post(RESET_CONFIRM, ok, format="json").status_code == 204
    finally:
        cache.clear()


# --- Account deletion ---------------------------------------------------------------


def _seed_user_data(user):
    resume = Resume.objects.create(user=user, title="PM résumé", content={})
    ResumeVersion.objects.create(
        resume=resume, user=user, kind=ResumeVersion.Kind.MANUAL, title="PM résumé", template="classic"
    )
    CoverLetter.objects.create(resume=resume, user=user, title="Letter", body="Dear team")
    AIUsageLog.objects.create(user=user, feature="improve-bullet", input_length=10, output_length=20)


@pytest.mark.django_db
def test_delete_account_requires_authentication(client):
    assert client.post(DELETE, {"password": "x"}, format="json").status_code == 401


@pytest.mark.django_db
def test_delete_account_rejects_a_wrong_password(client):
    reg = _register(client).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg['access']}")
    res = client.post(DELETE, {"password": "wrong-password"}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()
    assert User.objects.filter(email=VALID["email"]).exists()


@pytest.mark.django_db
def test_delete_account_requires_a_password(client):
    reg = _register(client).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg['access']}")
    res = client.post(DELETE, {}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()


@pytest.mark.django_db
def test_delete_account_removes_the_user_and_everything_they_own(client):
    reg = _register(client)
    access = reg.json()["access"]
    refresh = reg.cookies["refresh_token"].value
    user = User.objects.get(email=VALID["email"])
    _seed_user_data(user)

    # Someone else's data must survive.
    other = User.objects.create_user(email="rival@example.com", name="Rival", password="sup3rSecret!")
    _seed_user_data(other)

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    res = client.post(DELETE, {"password": VALID["password"]}, format="json")
    assert res.status_code == 204
    assert res.cookies["refresh_token"].value == ""  # cookie cleared

    assert not User.objects.filter(pk=user.pk).exists()
    for model in (Resume, ResumeVersion, CoverLetter, AIUsageLog):
        assert not model.objects.filter(user_id=user.pk).exists()
        assert model.objects.filter(user=other).count() == 1

    # The old access token no longer authenticates.
    assert client.get(ME).status_code == 401

    # The old refresh token can't mint a new access token.
    probe = APIClient()
    probe.cookies["refresh_token"] = refresh
    assert probe.post(REFRESH).status_code == 401


def _start_guest(client, monkeypatch):
    from apps.demo.turnstile import Verdict

    monkeypatch.setattr("apps.demo.views.turnstile.verify", lambda token, remote_ip: Verdict.PASSED)
    res = client.post("/api/demo/start", {"turnstile_token": "t"}, format="json")
    assert res.status_code == 201
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    return res


@pytest.mark.django_db
def test_a_guest_can_end_the_demo_without_a_password(client, settings, monkeypatch):
    settings.DEMO_MODE = True
    start = _start_guest(client, monkeypatch)
    guest = User.objects.get(pk=start.json()["user"]["id"])
    refresh = start.cookies["refresh_token"].value
    res = client.post(DELETE, {}, format="json")
    assert res.status_code == 204
    assert res.cookies["refresh_token"].value == ""  # cookie cleared
    assert not User.objects.filter(pk=guest.pk).exists()
    assert not Resume.objects.filter(user_id=guest.pk).exists()
    probe = APIClient()
    probe.cookies["refresh_token"] = refresh
    assert probe.post(REFRESH).status_code == 401


@pytest.mark.django_db
def test_an_account_still_needs_its_password_to_delete(client):
    reg = _register(client).json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg['access']}")
    res = client.post(DELETE, {}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()
    assert User.objects.filter(email=VALID["email"]).exists()


@pytest.mark.django_db
def test_a_guest_cannot_use_a_password_that_does_not_exist(guest_client, guest):
    # A guest never needs one; a wrong one is simply ignored, never a way to fail the delete.
    res = guest_client.post(DELETE, {"password": "anything"}, format="json")
    assert res.status_code == 204
    assert not User.objects.filter(pk=guest.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("password", ["", None])
def test_a_guest_may_send_a_blank_password(guest_client, guest, password):
    res = guest_client.post(DELETE, {"password": password}, format="json")
    assert res.status_code == 204
    assert not User.objects.filter(pk=guest.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("password", ["", None])
def test_an_account_still_needs_a_non_blank_password(auth_client, user, password):
    res = auth_client.post(DELETE, {"password": password}, format="json")
    assert res.status_code == 400
    assert "password" in res.json()
    assert User.objects.filter(pk=user.pk).exists()
