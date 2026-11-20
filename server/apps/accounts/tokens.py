"""Refresh-token issuing. A demo guest's refresh token never outlives the guest, so this is the
one place that caps a guest's token expiry at `guest_expires_at`."""

from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch

from .cookies import REFRESH_COOKIE_MAX_AGE


def issue_refresh(user) -> RefreshToken:
    """A new refresh token (with its outstanding row). A guest's expiry is capped at the moment the
    guest expires; the outstanding row is rewritten to match, so sweeping by `expires_at` stays right."""
    refresh = RefreshToken.for_user(user)
    if user.is_guest and user.guest_expires_at is not None:
        cap = int(user.guest_expires_at.timestamp())
        if refresh["exp"] > cap:
            refresh.payload["exp"] = cap
            OutstandingToken.objects.filter(jti=refresh["jti"]).update(
                token=str(refresh), expires_at=datetime_from_epoch(cap)
            )
    return refresh


def refresh_cookie_max_age(user) -> int:
    """Seconds the refresh cookie should live: until the guest expires (never past the 7-day refresh
    lifetime), else 7 days."""
    if user.is_guest and user.guest_expires_at is not None:
        remaining = int((user.guest_expires_at - timezone.now()).total_seconds())
        return max(0, min(remaining, REFRESH_COOKIE_MAX_AGE))
    return REFRESH_COOKIE_MAX_AGE
