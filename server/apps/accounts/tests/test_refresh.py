from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts.tokens import issue_refresh

REFRESH = "/api/auth/refresh"
LOGOUT = "/api/auth/logout"


@pytest.fixture(autouse=True)
def _clean_cache(db):
    cache.clear()
    yield
    cache.clear()


def _client_for(account):
    client = APIClient()
    client.cookies["refresh_token"] = str(issue_refresh(account))
    return client


@pytest.fixture
def signed_in_client(user):
    return _client_for(user)


@pytest.fixture
def guest_cookie_client(guest):
    return _client_for(guest)


def _rotate(client):
    """Refresh once; return the old and new cookie values."""
    old = client.cookies["refresh_token"].value
    res = client.post(REFRESH)
    assert res.status_code == 200
    return old, res.cookies["refresh_token"].value


def test_refresh_for_a_deleted_user_is_session_ended(signed_in_client, user):
    user.delete()
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")
    assert res.cookies["refresh_token"].value == ""


def test_refresh_for_an_inactive_user_is_session_ended(signed_in_client, user):
    user.is_active = False
    user.save(update_fields=["is_active"])
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_refresh_without_a_cookie_is_no_session():
    res = APIClient().post(REFRESH)
    assert res.status_code == 401
    assert res.json() == {"detail": "No refresh token.", "code": "no_session"}


def test_a_garbage_cookie_is_session_ended_and_clears_the_cookie():
    client = APIClient()
    client.cookies["refresh_token"] = "not-a-jwt"
    res = client.post(REFRESH)
    assert res.status_code == 401
    assert res.json() == {"detail": "Your session ended.", "code": "session_ended"}
    assert res.cookies["refresh_token"].value == ""


def test_an_expired_refresh_token_is_session_ended(user):
    token = issue_refresh(user)
    token.set_exp(from_time=timezone.now() - timedelta(days=8))
    client = APIClient()
    client.cookies["refresh_token"] = str(token)
    res = client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")
    assert res.cookies["refresh_token"].value == ""


def test_a_just_rotated_token_still_works_inside_the_grace_window(signed_in_client):
    old, _new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert res.status_code == 200 and "access" in res.json()
    assert "refresh_token" not in res.cookies  # the grace path never hands out a second refresh token


def test_the_grace_access_token_belongs_to_the_same_user(signed_in_client, user):
    old, _new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = old
    access = AccessToken(signed_in_client.post(REFRESH).json()["access"])
    assert access["user_id"] == str(user.pk)


def test_grace_ends_after_the_window(signed_in_client, settings):
    settings.REFRESH_REUSE_GRACE_SECONDS = 0
    old, _new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_a_cache_miss_ends_the_session_rather_than_bypassing(signed_in_client):
    old, _new = _rotate(signed_in_client)
    cache.clear()
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_grace_never_outlives_a_logout(signed_in_client):
    old, new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = new
    assert signed_in_client.post(LOGOUT).status_code == 204
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_grace_needs_a_live_successor(signed_in_client):
    old, new = _rotate(signed_in_client)
    OutstandingToken.objects.filter(token=new).update(expires_at=timezone.now() - timedelta(seconds=1))
    signed_in_client.cookies["refresh_token"] = old
    assert signed_in_client.post(REFRESH).status_code == 401


def test_grace_ends_when_the_user_is_removed(signed_in_client, user):
    old, _new = _rotate(signed_in_client)
    user.delete()
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_grace_follows_a_second_rotation(signed_in_client):
    old, new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = new
    res = signed_in_client.post(REFRESH)
    assert res.status_code == 200
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert res.status_code == 200 and "refresh_token" not in res.cookies


def test_grace_follows_at_most_five_hops(signed_in_client):
    first = signed_in_client.cookies["refresh_token"].value
    for _ in range(6):  # six rotations: the first token is six successors behind
        signed_in_client.post(REFRESH)
    signed_in_client.cookies["refresh_token"] = first
    assert signed_in_client.post(REFRESH).status_code == 401


def test_an_access_token_is_not_a_refresh_token(user):
    client = APIClient()
    client.cookies["refresh_token"] = str(RefreshToken.for_user(user).access_token)
    assert client.post(REFRESH).status_code == 401


def test_a_rotation_blacklists_the_old_token_and_outstands_the_new(signed_in_client):
    old, new = _rotate(signed_in_client)
    assert BlacklistedToken.objects.filter(token__token=old).exists()
    assert OutstandingToken.objects.filter(token=new).exists()


def test_a_guest_rotation_never_outlives_the_guest(guest_cookie_client, guest):
    guest.guest_expires_at = timezone.now() + timedelta(hours=2)
    guest.save(update_fields=["guest_expires_at"])
    res = guest_cookie_client.post(REFRESH)
    assert res.status_code == 200
    cookie = res.cookies["refresh_token"]
    assert 0 < int(cookie["max-age"]) <= 7200
    rotated = OutstandingToken.objects.get(token=cookie.value)
    assert rotated.expires_at <= guest.guest_expires_at
    assert RefreshToken(cookie.value)["exp"] <= int(guest.guest_expires_at.timestamp())


def test_an_expired_guest_is_session_ended_not_a_dead_cookie(guest_cookie_client, guest):
    guest.guest_expires_at = timezone.now() - timedelta(seconds=1)
    guest.save(update_fields=["guest_expires_at"])
    res = guest_cookie_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")
    assert res.cookies["refresh_token"].value == ""


def test_logout_with_a_just_rotated_cookie_ends_the_live_successor(signed_in_client):
    old, new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(LOGOUT)
    assert res.status_code == 204 and res.cookies["refresh_token"].value == ""
    signed_in_client.cookies["refresh_token"] = new
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_grace_needs_the_successor_to_belong_to_the_presented_users_claim(signed_in_client, user, django_user_model):
    old, new = _rotate(signed_in_client)
    other = django_user_model.objects.create_user(email="other@example.com", name="Other", password="sup3rSecret!")
    OutstandingToken.objects.filter(token=new).update(user=other)
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")


def test_no_successor_is_recorded_when_the_grace_is_off(signed_in_client, settings):
    settings.REFRESH_REUSE_GRACE_SECONDS = 0
    old, _new = _rotate(signed_in_client)
    assert cache.get(f"refresh-successor:{RefreshToken(old, verify=False)['jti']}") is None


@pytest.mark.django_db(transaction=True)
def test_a_rotation_is_all_or_nothing(signed_in_client, monkeypatch):
    """The blacklist, the successor, and the cache link commit together, so a second tab never sees the old
    token blacklisted without the link it needs for the grace path. A failure part way leaves the old
    token usable."""
    old = signed_in_client.cookies["refresh_token"].value
    jti = RefreshToken(old)["jti"]

    def fail(*args, **kwargs):
        raise RuntimeError("cache write failed")

    with monkeypatch.context() as patched:
        patched.setattr("apps.accounts.refresh.cache.set", fail)
        with pytest.raises(RuntimeError):
            signed_in_client.post(REFRESH)
    assert not BlacklistedToken.objects.filter(token__jti=jti).exists()
    assert signed_in_client.post(REFRESH).status_code == 200
