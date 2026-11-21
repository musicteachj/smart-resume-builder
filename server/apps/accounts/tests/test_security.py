"""Security-hardening tests: auth throttling, Content-Security-Policy, admin mounting."""

import importlib

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.urls import clear_url_caches
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


def test_refresh_has_its_own_throttle_scope():
    # Every page load refreshes, so sharing login's 10/min would sign out an office behind one IP.
    from django.conf import settings

    from apps.accounts.views import CookieTokenRefreshView, LoginView

    assert CookieTokenRefreshView.throttle_scope == "refresh"
    assert LoginView.throttle_scope == "auth"
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["refresh"] == "60/min"


@pytest.mark.django_db
def test_a_throttled_refresh_is_friendly_and_keeps_retry_after(client, monkeypatch):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {"refresh": "1/min"})
    cache.clear()
    assert client.post("/api/auth/refresh").status_code == 401
    res = client.post("/api/auth/refresh")
    assert res.status_code == 429
    assert res.json() == {
        "detail": "Too many requests from your network. Please wait a minute and try again.",
        "code": "refresh_rate_limited",
    }
    assert 1 <= int(res.headers["Retry-After"]) <= 60


@pytest.mark.django_db
def test_refreshes_do_not_spend_the_login_budget(client, monkeypatch):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {"auth": "2/min", "refresh": "3/min"})
    cache.clear()

    # Refreshes (no cookie, so 401) are counted on their own scope...
    for _ in range(3):
        assert client.post("/api/auth/refresh").status_code == 401
    assert client.post("/api/auth/refresh").status_code == 429
    # ...so login still has its whole budget.
    creds = {"email": "nobody@example.com", "password": "whatever"}
    for _ in range(2):
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
    # The Turnstile bot check: its script and its iframe, from that one host only.
    assert "script-src 'self' https://challenges.cloudflare.com;" in csp
    assert "frame-src https://challenges.cloudflare.com;" in csp
    assert csp.count("challenges.cloudflare.com") == 2


def test_no_csp_header_in_debug(client, settings):
    settings.DEBUG = True
    # A route that goes through the middleware stack (/health answers before it, so
    # it would pass whether or not the DEBUG check works).
    res = client.get(LOGIN)
    assert res.status_code == 405
    assert "Content-Security-Policy" not in res.headers


@pytest.mark.parametrize("host", ["10.0.1.23:8000", "resumeiq.jameslittlefield.net"])
def test_health_answers_alb_checks_on_any_host(client, settings, host):
    # ALB health checks send the task's private IP as Host, which ALLOWED_HOSTS
    # rejects (400). /health must answer before host validation and the SSL redirect.
    settings.DEBUG = False
    settings.ALLOWED_HOSTS = ["resumeiq.jameslittlefield.net"]
    res = client.get(HEALTH, HTTP_HOST=host)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_other_routes_still_reject_unknown_hosts(client, settings):
    settings.DEBUG = False
    settings.ALLOWED_HOSTS = ["resumeiq.jameslittlefield.net"]
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


@pytest.fixture
def reload_urls():
    """Re-import config.urls under the current settings (it decides at import time
    whether to mount the admin), then restore the original URLconf afterwards."""
    import config.urls
    from django.conf import settings as live

    original = {"DEBUG": live.DEBUG, "DJANGO_ADMIN_ENABLED": live.DJANGO_ADMIN_ENABLED}

    def _reload():
        importlib.reload(config.urls)
        clear_url_caches()

    yield _reload
    # Fixture teardown order isn't guaranteed relative to pytest-django's `settings`,
    # so rebuild under the original values explicitly.
    with override_settings(**original):
        _reload()


@pytest.mark.django_db
def test_admin_not_mounted_in_production_by_default(client, settings, reload_urls):
    settings.DEBUG = False
    settings.DJANGO_ADMIN_ENABLED = False
    reload_urls()
    # Not mounted, and the SPA catch-all excludes admin/, so it's a plain 404.
    assert client.get("/admin/").status_code == 404
    assert client.get("/admin/login/").status_code == 404


@pytest.mark.django_db
def test_admin_mounted_when_enabled(client, settings, reload_urls):
    settings.DEBUG = False
    settings.DJANGO_ADMIN_ENABLED = True
    reload_urls()
    # Anonymous visitors get redirected to the admin login (not rendered here: the
    # login page needs collectstatic's manifest when DEBUG is off).
    res = client.get("/admin/")
    assert res.status_code == 302
    assert res["Location"].startswith("/admin/login/")


@pytest.mark.django_db
def test_admin_mounted_in_debug(client, settings, reload_urls):
    settings.DEBUG = True
    settings.DJANGO_ADMIN_ENABLED = False
    reload_urls()
    res = client.get("/admin/")
    assert res.status_code == 302
    assert res["Location"].startswith("/admin/login/")
