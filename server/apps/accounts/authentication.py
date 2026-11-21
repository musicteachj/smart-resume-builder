"""The API's default authentication: SimpleJWT, plus a demo guest's expiry.

A guest's refresh token is capped at `guest_expires_at`, but an access token (15 minutes) is not, and
cleanup runs on a schedule. Without this check an expired guest could keep editing and using AI until
both ran out. The 401 sends the client through a refresh, which refuses the expired guest
(`session_ended`), so the visitor lands on "Your demo ended".
"""

from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .refresh import SESSION_ENDED_DETAIL


def guest_expired(user) -> bool:
    return bool(user.is_guest and user.guest_expires_at is not None and user.guest_expires_at <= timezone.now())


class GuestExpiryJWTAuthentication(JWTAuthentication):
    """JWTAuthentication that also refuses a demo guest past `guest_expires_at` (401 `session_ended`)."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if guest_expired(user):
            raise AuthenticationFailed({"detail": SESSION_ENDED_DETAIL, "code": "session_ended"})
        return user
