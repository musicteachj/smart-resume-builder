"""
Django settings for ResumeIQ.

Environment-driven: values come from a `.env` file at the repo root (local dev)
or real environment variables (Docker / ECS). See ../.env.example.
"""

import os
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

from config.static import immutable_file_test

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

# Local dev env files (no-op if absent; real environment variables always win, so
# production secrets from Secrets Manager are never overridden). Repo-root .env holds
# shared defaults; server/.env holds server-local secrets (e.g. ANTHROPIC_API_KEY).
load_dotenv(REPO_ROOT / ".env")
# override=True so a real value in server/.env wins over an empty/stale shell var
# (common: an exported but blank ANTHROPIC_API_KEY). No-op in prod — there's no
# .env file in the image, so Secrets Manager env vars are never overridden.
load_dotenv(BASE_DIR / ".env", override=True)

_TRUE_VALUES = ("true", "1", "yes")
_FALSE_VALUES = ("false", "0", "no")


def _env_bool(name: str, default: bool) -> bool:
    """A strict on/off flag: true/1/yes or false/0/no (any case, surrounding spaces ignored); unset or
    empty means `default`. Anything else (a typo, "on") fails to start instead of silently picking a side."""
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    if raw in _TRUE_VALUES:
        return True
    if raw in _FALSE_VALUES:
        return False
    raise ImproperlyConfigured(f"{name} must be one of true/1/yes or false/0/no, got {os.environ[name]!r}")


# Fail-closed: an unset DEBUG means production behavior (CSP on, Secure cookies,
# AI limits enforced, real SECRET_KEY required). Local dev sets DEBUG=True in the
# repo-root .env (see .env.example).
DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")

# Require a real SECRET_KEY in production; only fall back to a placeholder in DEBUG.
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-not-for-production-use-0123456789"
    else:
        raise ImproperlyConfigured(
            "SECRET_KEY environment variable is required when DEBUG=False"
        )
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

# The SPA's origin, for CORS. Production serves the SPA from the API's own origin, so
# there's no cross-origin client: an unset CLIENT_URL there means no CORS origins at all
# (fail closed) instead of the Vite dev server. An empty value counts as unset.
CLIENT_URL = os.environ.get("CLIENT_URL") or ("http://localhost:5173" if DEBUG else "")

# The Django admin is mounted only under DEBUG or when explicitly enabled, so in
# production /admin/ is a 404 instead of a login page to brute-force.
DJANGO_ADMIN_ENABLED = os.environ.get("DJANGO_ADMIN_ENABLED", "False").lower() in (
    "true", "1", "yes",
)

# Demo mode (apps/demo): visitors get a throwaway guest account, so the account routes and the
# API docs answer 404. The SPA learns this from GET /api/demo/status, never from a Vite variable.
# Parsed strictly: a typo here must not quietly reopen the account routes in production.
DEMO_MODE = _env_bool("DEMO_MODE", False)
if DEMO_MODE and DJANGO_ADMIN_ENABLED and not DEBUG:
    raise ImproperlyConfigured("DEMO_MODE cannot be combined with DJANGO_ADMIN_ENABLED in production")
# Cloudflare Turnstile keys for the guest start (verified in apps/demo/turnstile.py).
TURNSTILE_SITE_KEY = os.environ.get("TURNSTILE_SITE_KEY", "")
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")
# Cloudflare's published Turnstile test keys (a test asserts this matches apps/demo/turnstile.py).
TURNSTILE_TEST_KEYS = {
    "1x00000000000000000000AA",
    "2x00000000000000000000AB",
    "1x00000000000000000000BB",
    "2x00000000000000000000BB",
    "3x00000000000000000000FF",
    "1x0000000000000000000000000000000AA",
    "2x0000000000000000000000000000000AA",
    "3x0000000000000000000000000000000AA",
}
if DEMO_MODE and not DEBUG:
    # Fail closed: a production demo without real bot-check keys would let anyone mint guests.
    for _name, _value in (
        ("TURNSTILE_SITE_KEY", TURNSTILE_SITE_KEY),
        ("TURNSTILE_SECRET_KEY", TURNSTILE_SECRET_KEY),
    ):
        if not _value:
            raise ImproperlyConfigured(f"{_name} is required when DEMO_MODE is on and DEBUG is off")
    # Cloudflare's published test keys always pass or always fail, so a deployed site must never
    # use them (re-read 2026-11-20 at developers.cloudflare.com/turnstile/troubleshooting/testing/).
    # They are fine for a container reached only as localhost, such as the local prod-image check.
    if {TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY} & TURNSTILE_TEST_KEYS and not all(
        _host in ("localhost", "127.0.0.1") for _host in ALLOWED_HOSTS
    ):
        raise ImproperlyConfigured(
            "A Cloudflare Turnstile test key is set while ALLOWED_HOSTS includes a host other than "
            "localhost or 127.0.0.1; use real keys for a deployed demo"
        )


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "corsheaders",
    # Local apps (live under apps/)
    "apps.accounts",
    "apps.resumes",
    "apps.ai",
    "apps.demo",
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    # /health for ALB checks: answered before host validation and the SSL redirect.
    "config.middleware.HealthCheckMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Sets a Content-Security-Policy on every response in production (no-op under
    # DEBUG so Vite's dev server keeps working). Cheap response-header middleware.
    "config.middleware.ContentSecurityPolicyMiddleware",
    # WhiteNoise (serves the built SPA + static) is inserted right after CSP below for
    # non-DEBUG, so the files it answers itself (index.html, assets) still get the CSP.
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

if not DEBUG:
    # In dev, Django's runserver serves static; WhiteNoise is only needed in
    # the production container (after collectstatic).
    # After the CSP middleware: WhiteNoise answers file requests itself, and only the
    # middleware above it sees (and adds headers to) those responses.
    MIDDLEWARE.insert(
        MIDDLEWARE.index("config.middleware.ContentSecurityPolicyMiddleware") + 1,
        "whitenoise.middleware.WhiteNoiseMiddleware",
    )

    # HTTPS hardening — TLS terminates at the ALB, which forwards plain HTTP with
    # X-Forwarded-Proto. Trusting that header makes request.is_secure() correct.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Env-overridable only so the local prod-container smoke test
    # (docker compose --profile prod) can run over plain-HTTP localhost.
    SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "True").lower() in (
        "true", "1", "yes",
    )
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days; no preload (deliberate)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # covers *.resume.…; other apps live on the parent domain
    # Preload is off on purpose (see above), so silence its warning; CI runs
    # `check --deploy --fail-level WARNING` and should fail only on new issues.
    SILENCED_SYSTEM_CHECKS = ["security.W021"]
    # Sessions/CSRF cookies only exist for the Django admin, but the site is
    # HTTPS-only so they should never travel in the clear.
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database: DATABASE_URL, e.g. postgres://user:pass@localhost:5432/resume_builder.
# Required in production, so a missing secret fails at startup instead of quietly
# pointing at localhost. DEBUG falls back to the docker-compose database. An empty
# value counts as unset.

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    if DEBUG:
        DATABASE_URL = "postgres://resume_user:resume_pass@localhost:5432/resume_builder"
    else:
        raise ImproperlyConfigured(
            "DATABASE_URL environment variable is required when DEBUG=False"
        )

DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=60,
        # Re-check a persistent connection before reuse, so an RDS restart or failover
        # doesn't cost each worker one 500. (TLS to RDS: `sslmode=require` in the
        # DATABASE_URL secret plus `rds.force_ssl=1` on the instance.)
        conn_health_checks=True,
    )
}
# Fail fast when the database is unreachable instead of hanging a worker thread.
DATABASES["default"].setdefault("OPTIONS", {})["connect_timeout"] = 5


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {
        # Our User has `name`, not first_name/last_name, so list the attributes to compare.
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "name")},
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Email + password reset. Dev prints mail (reset links) to the runserver console.
# Production defaults to the dummy backend (nothing is sent, and the reset view logs a
# warning) until a real provider is configured through EMAIL_BACKEND and its settings.

EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.dummy.EmailBackend",
)
DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", "ResumeIQ <no-reply@resumeiq.jameslittlefield.net>"
)
PASSWORD_RESET_TIMEOUT = 3600  # seconds; reset links expire after 1 hour


# REST framework / OpenAPI

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # SimpleJWT, plus a 401 for a demo guest past its expiry (apps/accounts/authentication.py).
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.accounts.authentication.GuestExpiryJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # Scoped throttles applied per-view (not globally): "auth" blunts login/register
    # brute force (keyed by IP); "ai-burst" is a per-user burst guard on the AI
    # endpoints that complements the per-user daily/monthly quota in apps/ai/usage.py;
    # "writes" caps résumé/cover-letter writes per user (autosave debounces at 800ms,
    # so continuous typing stays well under it).
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        # Session refresh, keyed by IP: every page load refreshes, so it gets more room than login.
        "refresh": "60/min",
        "ai-burst": "20/hour",
        "writes": "120/min",
        # Password-reset email requests, keyed by IP: limits reset-email spam.
        "password-reset": "5/hour",
        # "demo-start-hour" and "demo-start-day" (guest starts, keyed by IP) are added below,
        # once the DEMO_STARTS_PER_* settings have been read.
    },
    # One trusted proxy hop (the ALB). Without this, DRF keys IP throttles on the
    # whole client-supplied X-Forwarded-For header, which an attacker can rotate
    # to dodge the auth throttle. No effect in dev (no XFF header there).
    "NUM_PROXIES": 1,
    # JSON only in production: the browsable API (an HTML page per endpoint) isn't
    # part of the product. Swagger UI has its own renderers, so it's unaffected.
    "DEFAULT_RENDERER_CLASSES": (
        [
            "rest_framework.renderers.JSONRenderer",
            "rest_framework.renderers.BrowsableAPIRenderer",
        ]
        if DEBUG
        else ["rest_framework.renderers.JSONRenderer"]
    ),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ResumeIQ API",
    "DESCRIPTION": "AI resume builder: resumes, auth, and Claude-assisted content.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Schema + Swagger UI are open in dev (Orval reads /api/schema/) but
    # login-gated in production — no anonymous API-surface disclosure.
    "SERVE_PERMISSIONS": (
        ["rest_framework.permissions.AllowAny"]
        if DEBUG
        else ["rest_framework.permissions.IsAuthenticated"]
    ),
    # Two "kind" choice sets (all version kinds vs. the ones a client may create)
    # need explicit names, or the generated TS enum gets a hash suffix.
    "ENUM_NAME_OVERRIDES": {
        "ResumeVersionKindEnum": "apps.resumes.models.ResumeVersion.Kind",
    },
}

# JWT lifetimes — short access token (kept in JS memory), longer refresh (httpOnly cookie).
# Each refresh rotates the token and blacklists the old one, so logout can revoke
# the cookie's token and a leaked refresh token dies at its next (or the real
# user's next) refresh instead of living out its full 7 days.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Rotation itself is done by apps.accounts.refresh.refresh_session (it also adds a short reuse grace);
    # these flags only document the intent and apply to any stock SimpleJWT view.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}


# CORS — Vite dev server locally; same-origin in production (SPA served by Django)

CORS_ALLOWED_ORIGINS = [CLIENT_URL] if CLIENT_URL else []
# Allow credentials so the refresh cookie rides along (flows are same-origin in dev-via-proxy and prod).
CORS_ALLOW_CREDENTIALS = True


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files — WhiteNoise serves Django/admin/DRF static (collectstatic → STATIC_ROOT).

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Single-container SPA serving (production image only): the built React app is copied
# to server/spa. WhiteNoise serves its hashed assets at the root; a catch-all view in
# config.urls returns index.html for client-side routes. Absent in dev — Vite serves
# the SPA and proxies /api to Django.
SPA_ROOT = BASE_DIR / "spa"
if SPA_ROOT.exists():
    WHITENOISE_ROOT = str(SPA_ROOT)
    WHITENOISE_INDEX_FILE = False  # Django's catch-all owns HTML routing
# Cache Vite's content-hashed /assets/ for a year (WhiteNoise only knows STATIC_URL's).
# Must be the function itself: WhiteNoise reads a string here as a regex.
WHITENOISE_IMMUTABLE_FILE_TEST = immutable_file_test
# Not in Python's mimetypes; with nosniff, octet-stream would make browsers ignore it.
WHITENOISE_MIMETYPES = {".webmanifest": "application/manifest+json"}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Cache: backs the DRF throttles (auth, ai-burst, writes). The database cache is shared
# by every gunicorn worker and ECS task; the default LocMemCache is per-process, which
# made the real limits workers x tasks times looser and reset them on every deploy.
# The table is created by accounts migration 0002, so no extra deploy step is needed.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
        "OPTIONS": {"MAX_ENTRIES": 10000},
    }
}

# Logging: everything to stdout (CloudWatch reads the container's stdout). Without
# this, Django sends 500 tracebacks only to mail_admins (unconfigured) under
# DEBUG=False, so production errors would be invisible.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # 4xx (401s, 404s) are routine; log only 5xx tracebacks.
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        # Scanners probing with bogus Host headers; not actionable.
        "django.security.DisallowedHost": {"handlers": [], "propagate": False},
    },
}


# App constants

# AI (Claude): Haiku 5.5 for the short rewrites, Sonnet 5.5 for tailoring, cover letters,
# the ATS check, and import (Opus/Fable aren't needed). Env-overridable, but the service sends
# `effort` and structured outputs, so an override must be a model that supports both.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_MODEL_SIMPLE = os.environ.get("AI_MODEL_SIMPLE", "claude-haiku-5-5")
AI_MODEL_TAILOR = os.environ.get("AI_MODEL_TAILOR", "claude-sonnet-5-5")
# Timeout chain: Anthropic (100s, no retry) < ALB idle (120s) < client axios (125s).
AI_TIMEOUT_SECONDS = 100
AI_SIMPLE_TIMEOUT_SECONDS = 30  # Haiku, one attempt (no retries)
# Résumé text sent to the model is capped to bound per-call cost.
AI_MAX_PROMPT_CHARS = 20000


# AI dollar budget (apps/ai/ledger.py). Whole-account money, in USD here and micro-dollars in the ledger.
def _env_decimal(name: str, default: str, *, minimum: str) -> Decimal:
    raw = os.environ.get(name) or default
    try:
        value = Decimal(raw)
    except InvalidOperation:
        raise ImproperlyConfigured(f"{name} must be a number, got {raw!r}") from None
    if not value.is_finite() or value < Decimal(minimum):
        raise ImproperlyConfigured(f"{name} must be at least {minimum}, got {raw!r}")
    return value


def _env_int(name: str, default: str, *, minimum: int) -> int:
    raw = os.environ.get(name) or default
    try:
        value = int(raw)
    except ValueError:
        raise ImproperlyConfigured(f"{name} must be a whole number, got {raw!r}") from None
    if value < minimum:
        raise ImproperlyConfigured(f"{name} must be at least {minimum}, got {raw!r}")
    return value


# Seconds a just-rotated refresh token keeps working (access token only, no new cookie), so two tabs
# restoring a session at the same moment don't sign the visitor out. 0 turns the grace off.
REFRESH_REUSE_GRACE_SECONDS = _env_int("REFRESH_REUSE_GRACE_SECONDS", "30", minimum=0)

# Per-user AI call limits (admins and DEBUG bypass them).
AI_DAILY_LIMIT = _env_int("AI_DAILY_LIMIT", "10", minimum=0)
AI_MONTHLY_LIMIT = _env_int("AI_MONTHLY_LIMIT", "50", minimum=0)
# A demo guest's lifetime cap on live AI calls (no daily or 30-day reset, no admin or DEBUG bypass).
AI_GUEST_CALL_LIMIT = _env_int("AI_GUEST_CALL_LIMIT", "30", minimum=1)
# Let the API re-run a request Sonnet 5.5 declines on Sonnet 5 inside the same call. A declined
# attempt is billed, so the ledger reserves for both passes while this is on.
AI_SERVER_SIDE_FALLBACK = _env_bool("AI_SERVER_SIDE_FALLBACK", True)
# The month's live-AI budget; 0 turns live AI off.
AI_MONTHLY_BUDGET_USD = _env_decimal("AI_MONTHLY_BUDGET_USD", "10", minimum="0")
# One day may spend up to this multiple of an even share of what the month has left.
AI_PACING_MULTIPLIER = _env_decimal("AI_PACING_MULTIPLIER", "3", minimum="1")
# A day's allowance is never below this (capped by what the month has left).
AI_DAILY_FLOOR_USD = _env_decimal("AI_DAILY_FLOOR_USD", "0.50", minimum="0")
# What one demo guest may spend in all.
AI_VISITOR_BUDGET_USD = _env_decimal("AI_VISITOR_BUDGET_USD", "0.15", minimum="0")
# An unsettled reservation older than this is charged in full by the sweeper.
AI_STALE_RESERVATION_MINUTES = _env_int("AI_STALE_RESERVATION_MINUTES", "10", minimum=1)

# Demo guests: how long one lasts, how many may be live at once, and the per-IP start limits.
DEMO_GUEST_TTL_HOURS = _env_int("DEMO_GUEST_TTL_HOURS", "24", minimum=1)
DEMO_MAX_LIVE_GUESTS = _env_int("DEMO_MAX_LIVE_GUESTS", "300", minimum=1)
DEMO_STARTS_PER_HOUR = _env_int("DEMO_STARTS_PER_HOUR", "15", minimum=1)
DEMO_STARTS_PER_DAY = _env_int("DEMO_STARTS_PER_DAY", "50", minimum=1)
# Per-guest storage caps (guests only; accounts are never capped).
DEMO_GUEST_MAX_RESUMES = _env_int("DEMO_GUEST_MAX_RESUMES", "20", minimum=1)
# One résumé's `content` as UTF-8 JSON.
DEMO_GUEST_MAX_CONTENT_BYTES = _env_int("DEMO_GUEST_MAX_CONTENT_BYTES", "65536", minimum=1)
# Everything one guest stores (pg_column_size across résumés, versions, cover letters).
DEMO_GUEST_MAX_STORAGE_BYTES = _env_int("DEMO_GUEST_MAX_STORAGE_BYTES", "5242880", minimum=1)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].update(
    {
        "demo-start-hour": f"{DEMO_STARTS_PER_HOUR}/hour",
        "demo-start-day": f"{DEMO_STARTS_PER_DAY}/day",
    }
)
