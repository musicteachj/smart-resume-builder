"""Security-hardening tests: auth throttling + Content-Security-Policy header."""

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

LOGIN = "/api/auth/login"
HEALTH = "/health"


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
def test_auth_endpoint_throttles_burst(client, monkeypatch):
    # Re-enable the "auth" scope (the suite disables throttling by default) and reset
    # the throttle cache so the count starts clean.
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {"auth": "3/min", "ai-burst": None})
    cache.clear()

    creds = {"email": "nobody@example.com", "password": "whatever"}
    # First 3 (failed) logins are allowed through (401); the 4th is throttled.
    for _ in range(3):
        assert client.post(LOGIN, creds, format="json").status_code == 401
    assert client.post(LOGIN, creds, format="json").status_code == 429


def test_csp_header_present_in_production(client, settings):
    settings.DEBUG = False
    res = client.get(HEALTH)
    assert res.status_code == 200
    csp = res.headers.get("Content-Security-Policy")
    assert csp is not None
    # Must keep allowing the Google Fonts hosts or Newsreader/Inter break.
    assert "https://fonts.googleapis.com" in csp
    assert "https://fonts.gstatic.com" in csp
    assert "frame-ancestors 'none'" in csp


def test_no_csp_header_in_debug(client, settings):
    settings.DEBUG = True
    res = client.get(HEALTH)
    assert res.status_code == 200
    assert "Content-Security-Policy" not in res.headers
