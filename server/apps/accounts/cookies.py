"""Refresh-token cookie helper. The refresh JWT lives in an httpOnly cookie scoped
to /api/auth so it is never exposed to JS and only sent to the auth endpoints."""

from datetime import timedelta

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_MAX_AGE = int(timedelta(days=7).total_seconds())


def set_refresh_cookie(response, token: str):
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,  # http localhost in dev; https in prod
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return response
