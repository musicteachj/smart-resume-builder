"""Refresh-token rotation with a short reuse grace.

Each refresh rotates the token: the old one is blacklisted and a new one issued. Two browser tabs
restoring a session at the same moment would both present the same cookie, and the loser would be
signed out. So for REFRESH_REUSE_GRACE_SECONDS after a rotation, the old token can still be traded for
an access token (never for another refresh token) as long as its successor is live. The old to new link
lives in the cache; a cache miss just means the session ended, never a bypass.
"""

import logging
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenBackendError, TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .tokens import cap_guest_expiry, refresh_cookie_max_age

logger = logging.getLogger(__name__)
User = get_user_model()

MAX_GRACE_HOPS = 5
SESSION_ENDED_DETAIL = "Your session ended."


class SessionEnded(Exception):
    """The refresh token can't be used: expired, revoked, unknown, or its user is gone or expired."""


@dataclass(frozen=True)
class Refreshed:
    access: str
    refresh: str | None  # None on the grace path: no new cookie
    cookie_max_age: int | None


def _successor_key(jti: str) -> str:
    return f"refresh-successor:{jti}"


def refresh_session(raw: str) -> Refreshed:
    try:
        token = RefreshToken(raw)  # signature, expiry, blacklist
    except TokenError:
        return _grace(raw)
    user = User.objects.filter(pk=token[api_settings.USER_ID_CLAIM], is_active=True).first()
    if user is None:
        raise SessionEnded
    if user.is_guest and user.guest_expires_at is not None and user.guest_expires_at <= timezone.now():
        raise SessionEnded
    old_jti = token[api_settings.JTI_CLAIM]
    # One transaction (the cache is the database cache, on the same connection): a second tab presenting
    # the same cookie sees the old token blacklisted only together with its live successor and the link to
    # it. Between the blacklist and the link it found neither, took the grace path, and was signed out.
    with transaction.atomic():
        token.blacklist()
        token.set_jti()
        token.set_exp()
        token.set_iat()
        token.outstand()
        cap_guest_expiry(user, token)
        if settings.REFRESH_REUSE_GRACE_SECONDS > 0:
            cache.set(
                _successor_key(old_jti), token[api_settings.JTI_CLAIM], settings.REFRESH_REUSE_GRACE_SECONDS
            )
    return Refreshed(str(token.access_token), str(token), refresh_cookie_max_age(user))


def _live_successor(raw: str) -> OutstandingToken:
    """Follow the cache from a recently rotated refresh token to its live successor row (at most
    MAX_GRACE_HOPS rotations). Raises SessionEnded unless that successor is unexpired, not blacklisted,
    and belongs to an active user who is the one named in the presented token."""
    try:
        payload = token_backend.decode(raw, verify=True)  # signature and expiry
    except TokenBackendError:
        raise SessionEnded from None
    if payload.get(api_settings.TOKEN_TYPE_CLAIM) != RefreshToken.token_type:
        raise SessionEnded
    jti = payload.get(api_settings.JTI_CLAIM)
    for _ in range(MAX_GRACE_HOPS):
        jti = cache.get(_successor_key(jti)) if jti else None
        if not jti:
            raise SessionEnded
        live = (
            OutstandingToken.objects.select_related("user")
            .filter(jti=jti, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True)
            .first()
        )
        if live is not None:
            if live.user is None or not live.user.is_active:
                raise SessionEnded
            if str(live.user_id) != str(payload.get(api_settings.USER_ID_CLAIM)):
                raise SessionEnded
            return live
    raise SessionEnded


def _grace(raw: str) -> Refreshed:
    """Trade a recently rotated (so blacklisted) refresh token for an access token only."""
    live = _live_successor(raw)
    return Refreshed(str(AccessToken.for_user(live.user)), None, None)


def end_rotated_session(raw: str) -> None:
    """Logout with a just-rotated cookie: blacklist its live successor too, so a refresh that was in
    flight in another tab can't keep the visitor signed in. Does nothing if there is no live successor."""
    try:
        live = _live_successor(raw)
    except SessionEnded:
        return
    BlacklistedToken.objects.get_or_create(token=live)
