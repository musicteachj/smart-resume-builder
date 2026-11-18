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
    "middleware": s.MIDDLEWARE,
}))
"""

PROD_ENV = {
    "DEBUG": "False",
    "SECRET_KEY": "test-prod-settings-key-that-is-long-and-random-enough-0123456789",
    "ALLOWED_HOSTS": "resume.example.com",
    "DATABASE_URL": "postgres://u:p@db.example.com:5432/prod_db",
    "CLIENT_URL": "",
    "DJANGO_ADMIN_ENABLED": "",
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
