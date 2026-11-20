"""Refresh-token cookie helper. The refresh JWT lives in an httpOnly cookie scoped
to /api/auth so it is never exposed to JS and only sent to the auth endpoints."""

from datetime import timedelta

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_MAX_AGE = int(timedelta(days=7).total_seconds())


def set_refresh_cookie(response, token: str, *, max_age: int | None = None):
    """`max_age` defaults to the 7-day refresh lifetime; a guest's is shorter (see tokens.py)."""
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=REFRESH_COOKIE_MAX_AGE if max_age is None else max_age,
        httponly=True,
        secure=not settings.DEBUG,  # http localhost in dev; https in prod
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return response
