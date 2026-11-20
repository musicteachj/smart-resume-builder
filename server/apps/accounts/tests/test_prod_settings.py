"""Production-only settings, checked by importing config.settings in a subprocess.

Pytest imports settings once with DEBUG=True, so the `if not DEBUG` branches never run
in-process. Each case here imports a fresh copy under an explicit environment. Empty
strings count as unset (an empty value in the environment also blocks the .env files
from filling it in, which keeps these tests independent of a developer's local .env).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[3]

_PROBE = """
import json
import config.settings as s
print(json.dumps({
    "cors": s.CORS_ALLOWED_ORIGINS,
    "client_url": s.CLIENT_URL,
    "db_name": s.DATABASES["default"]["NAME"],
    "renderers": s.REST_FRAMEWORK.get("DEFAULT_RENDERER_CLASSES"),
    "admin_enabled": s.DJANGO_ADMIN_ENABLED,
    "demo_mode": s.DEMO_MODE,
    "middleware": s.MIDDLEWARE,
    "ai_daily_limit": s.AI_DAILY_LIMIT,
    "ai_monthly_limit": s.AI_MONTHLY_LIMIT,
    "ai_fallback": s.AI_SERVER_SIDE_FALLBACK,
    "turnstile": [s.TURNSTILE_SITE_KEY, s.TURNSTILE_SECRET_KEY],
    "ai_guest_call_limit": s.AI_GUEST_CALL_LIMIT,
    "ai_monthly_budget": [type(s.AI_MONTHLY_BUDGET_USD).__name__, str(s.AI_MONTHLY_BUDGET_USD)],
}))
"""

PROD_ENV = {
    "DEBUG": "False",
    "SECRET_KEY": "test-prod-settings-key-that-is-long-and-random-enough-0123456789",
    "ALLOWED_HOSTS": "resume.example.com",
    "DATABASE_URL": "postgres://u:p@db.example.com:5432/prod_db",
    "CLIENT_URL": "",
    "DJANGO_ADMIN_ENABLED": "",
    "DEMO_MODE": "",
    "TURNSTILE_SITE_KEY": "",
    "TURNSTILE_SECRET_KEY": "",
}


def _import_settings(**overrides):
    env = {**os.environ, **PROD_ENV, **overrides}
    return subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=SERVER_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def _settings(**overrides) -> dict:
    result = _import_settings(**overrides)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def prod():
    return _settings()


def test_cors_fails_closed_without_client_url(prod):
    # Same-origin in production: no CLIENT_URL means no cross-origin access at all,
    # not the localhost dev origin.
    assert prod["cors"] == []
    assert prod["client_url"] == ""


def test_cors_allows_the_configured_client_url():
    s = _settings(CLIENT_URL="https://resume.example.com")
    assert s["cors"] == ["https://resume.example.com"]


def test_cors_defaults_to_the_vite_dev_server_in_debug():
    s = _settings(DEBUG="True")
    assert s["cors"] == ["http://localhost:5173"]


def test_database_url_is_required_in_production():
    result = _import_settings(DATABASE_URL="")
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "DATABASE_URL" in result.stderr


def test_production_uses_database_url(prod):
    assert prod["db_name"] == "prod_db"


def test_debug_falls_back_to_the_local_database():
    s = _settings(DEBUG="True", DATABASE_URL="")
    assert s["db_name"] == "resume_builder"


def test_no_browsable_api_in_production(prod):
    assert prod["renderers"] == ["rest_framework.renderers.JSONRenderer"]


def test_browsable_api_stays_in_debug():
    s = _settings(DEBUG="True")
    assert "rest_framework.renderers.BrowsableAPIRenderer" in s["renderers"]


def test_admin_is_off_by_default(prod):
    assert prod["admin_enabled"] is False


def test_admin_can_be_enabled():
    assert _settings(DJANGO_ADMIN_ENABLED="True")["admin_enabled"] is True


def test_whitenoise_sits_inside_the_csp_middleware(prod):
    # WhiteNoise answers /index.html and SPA assets itself; only middleware listed before
    # it adds headers to those responses, so CSP must come first.
    mw = prod["middleware"]
    csp = mw.index("config.middleware.ContentSecurityPolicyMiddleware")
    assert mw.index("whitenoise.middleware.WhiteNoiseMiddleware") == csp + 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"AI_MONTHLY_BUDGET_USD": "-1"},
        {"AI_PACING_MULTIPLIER": "0.5"},
        {"AI_DAILY_FLOOR_USD": "-0.01"},
        {"AI_VISITOR_BUDGET_USD": "-1"},
        {"AI_MONTHLY_BUDGET_USD": "ten"},
        {"AI_STALE_RESERVATION_MINUTES": "soon"},
    ],
)
def test_bad_ai_budget_settings_fail_to_import(overrides):
    result = _import_settings(**overrides)
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr


def test_ai_monthly_budget_reads_back_as_a_decimal():
    assert _settings(AI_MONTHLY_BUDGET_USD="25")["ai_monthly_budget"] == ["Decimal", "25"]


def test_ai_call_limits_and_fallback_come_from_the_environment():
    read = _settings(AI_DAILY_LIMIT="3", AI_MONTHLY_LIMIT="7", AI_SERVER_SIDE_FALLBACK="False")
    assert (read["ai_daily_limit"], read["ai_monthly_limit"], read["ai_fallback"]) == (3, 7, False)
    default = _settings()
    assert (default["ai_daily_limit"], default["ai_monthly_limit"], default["ai_fallback"]) == (10, 50, True)


def test_demo_mode_and_the_admin_cannot_both_be_on_in_production():
    result = _import_settings(DEMO_MODE="true", DJANGO_ADMIN_ENABLED="true")
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "DEMO_MODE" in result.stderr


def test_demo_mode_is_off_by_default(prod):
    assert prod["demo_mode"] is False


@pytest.mark.parametrize("flag", ["DEMO_MODE", "AI_SERVER_SIDE_FALLBACK"])
@pytest.mark.parametrize("value", ["on", "ture"])
def test_an_unrecognized_flag_value_fails_to_import(flag, value):
    # A typo must not silently mean accounts mode (reopening register, login, and reset in production).
    result = _import_settings(**{flag: value})
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert flag in result.stderr


def test_flags_are_read_case_insensitively_and_stripped():
    read = _settings(
        DEMO_MODE=" True ", TURNSTILE_SITE_KEY="0xREALSITE", TURNSTILE_SECRET_KEY="0xREALSECRET",
        AI_SERVER_SIDE_FALLBACK=" NO ",
    )
    assert (read["demo_mode"], read["ai_fallback"]) == (True, False)
    other = _settings(DEMO_MODE="0", AI_SERVER_SIDE_FALLBACK="YES")
    assert (other["demo_mode"], other["ai_fallback"]) == (False, True)


def test_an_empty_flag_means_its_default():
    read = _settings(DEMO_MODE="", AI_SERVER_SIDE_FALLBACK="  ")
    assert (read["demo_mode"], read["ai_fallback"]) == (False, True)


TEST_SITE = "1x00000000000000000000AA"
TEST_SECRET = "1x0000000000000000000000000000000AA"


def test_production_demo_mode_requires_both_turnstile_keys():
    result = _import_settings(DEMO_MODE="true")
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "TURNSTILE" in result.stderr
    only_site = _import_settings(DEMO_MODE="true", TURNSTILE_SITE_KEY="0xREALSITE")
    assert only_site.returncode != 0 and "TURNSTILE_SECRET_KEY" in only_site.stderr
    only_secret = _import_settings(DEMO_MODE="true", TURNSTILE_SECRET_KEY="0xREALSECRET")
    assert only_secret.returncode != 0 and "TURNSTILE_SITE_KEY" in only_secret.stderr


def test_production_demo_mode_accepts_real_turnstile_keys():
    read = _settings(DEMO_MODE="true", TURNSTILE_SITE_KEY="0xREALSITE", TURNSTILE_SECRET_KEY="0xREALSECRET")
    assert read["turnstile"] == ["0xREALSITE", "0xREALSECRET"]


@pytest.mark.parametrize(
    "site, secret",
    [
        (TEST_SITE, TEST_SECRET),
        ("2x00000000000000000000AB", "2x0000000000000000000000000000000AA"),
        ("3x00000000000000000000FF", "3x0000000000000000000000000000000AA"),
        ("1x00000000000000000000BB", "0xREALSECRET"),
        ("0xREALSITE", TEST_SECRET),
    ],
)
def test_production_refuses_cloudflare_test_keys_on_a_real_host(site, secret):
    result = _import_settings(
        DEMO_MODE="true",
        TURNSTILE_SITE_KEY=site,
        TURNSTILE_SECRET_KEY=secret,
        ALLOWED_HOSTS="resumeiq.jameslittlefield.net",
    )
    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "test key" in result.stderr


def test_production_refuses_test_keys_when_any_host_is_not_local():
    result = _import_settings(
        DEMO_MODE="true",
        TURNSTILE_SITE_KEY=TEST_SITE,
        TURNSTILE_SECRET_KEY=TEST_SECRET,
        ALLOWED_HOSTS="localhost,resumeiq.jameslittlefield.net",
    )
    assert result.returncode != 0


def test_production_allows_test_keys_on_localhost_only():
    read = _settings(
        DEMO_MODE="true",
        TURNSTILE_SITE_KEY=TEST_SITE,
        TURNSTILE_SECRET_KEY=TEST_SECRET,
        ALLOWED_HOSTS="localhost,127.0.0.1",
    )
    assert read["turnstile"] == [TEST_SITE, TEST_SECRET]


def test_turnstile_keys_are_not_checked_outside_demo_mode(prod):
    assert prod["turnstile"] == ["", ""]


def test_ai_guest_call_limit_comes_from_the_environment():
    assert _settings(AI_GUEST_CALL_LIMIT="3")["ai_guest_call_limit"] == 3
    assert _settings()["ai_guest_call_limit"] == 30
    assert _import_settings(AI_GUEST_CALL_LIMIT="0").returncode != 0
