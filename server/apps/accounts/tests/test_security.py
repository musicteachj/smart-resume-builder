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
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {"auth": "3/min", "ai-burst": None, "writes": None})
    cache.clear()

    creds = {"email": "nobody@example.com", "password": "whatever"}
    # First 3 (failed) logins are allowed through (401); the 4th is throttled.
    for _ in range(3):
        assert client.post(LOGIN, creds, format="json").status_code == 401
    assert client.post(LOGIN, creds, format="json").status_code == 429


def test_csp_header_present_in_production(client, settings):
    settings.DEBUG = False
    # Any non-/health route (health answers before the middleware stack, see below).
    res = client.get(LOGIN)
    assert res.status_code == 405
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


@pytest.mark.parametrize("host", ["10.0.1.23:8000", "resume.jameslittlefield.net"])
def test_health_answers_alb_checks_on_any_host(client, settings, host):
    # ALB health checks send the task's private IP as Host, which ALLOWED_HOSTS
    # rejects (400). /health must answer before host validation and the SSL redirect.
    settings.DEBUG = False
    settings.ALLOWED_HOSTS = ["resume.jameslittlefield.net"]
    res = client.get(HEALTH, HTTP_HOST=host)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_other_routes_still_reject_unknown_hosts(client, settings):
    settings.DEBUG = False
    settings.ALLOWED_HOSTS = ["resume.jameslittlefield.net"]
    assert client.get(LOGIN, HTTP_HOST="10.0.1.23:8000").status_code == 400


@pytest.mark.django_db
def test_throttle_cache_is_shared_across_processes(settings):
    # LocMemCache is per-process: with N gunicorn workers x M tasks the throttle
    # limits were N*M times looser. The database cache is shared by all of them,
    # and its table is created by a migration (so it exists in tests and prod).
    from django.core.cache import caches

    assert settings.CACHES["default"]["BACKEND"] == "django.core.cache.backends.db.DatabaseCache"
    caches["default"].set("probe", "ok", 30)
    assert caches["default"].get("probe") == "ok"


def test_db_connections_are_health_checked(settings):
    # Persistent connections (CONN_MAX_AGE) go stale after an RDS restart or failover;
    # without health checks each worker serves one 500 before reconnecting.
    assert settings.DATABASES["default"]["CONN_HEALTH_CHECKS"] is True
