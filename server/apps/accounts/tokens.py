"""Refresh-token issuing. A demo guest's refresh token never outlives the guest, so this is the
one place (`cap_guest_expiry`) that caps a guest's token expiry at `guest_expires_at`."""

from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch

from .cookies import REFRESH_COOKIE_MAX_AGE


def cap_guest_expiry(user, refresh: RefreshToken) -> None:
    """Cap a guest's refresh token at the moment the guest expires, and rewrite the outstanding row to
    match, so sweeping by `expires_at` stays right. A no-op for everyone else and for tokens already
    under the cap. Both issuing and rotating go through here."""
    if not (user.is_guest and user.guest_expires_at is not None):
        return
    cap = int(user.guest_expires_at.timestamp())
    if refresh["exp"] > cap:
        refresh.payload["exp"] = cap
        OutstandingToken.objects.filter(jti=refresh["jti"]).update(
            token=str(refresh), expires_at=datetime_from_epoch(cap)
        )


def issue_refresh(user) -> RefreshToken:
    """A new refresh token (with its outstanding row), capped for a guest."""
    refresh = RefreshToken.for_user(user)
    cap_guest_expiry(user, refresh)
    return refresh


def refresh_cookie_max_age(user) -> int:
    """Seconds the refresh cookie should live: until the guest expires (never past the 7-day refresh
    lifetime), else 7 days."""
    if user.is_guest and user.guest_expires_at is not None:
        remaining = int((user.guest_expires_at - timezone.now()).total_seconds())
        return max(0, min(remaining, REFRESH_COOKIE_MAX_AGE))
    return REFRESH_COOKIE_MAX_AGE
