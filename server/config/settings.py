"""
Django settings for Smart Resume Builder.

Environment-driven: values come from a `.env` file at the repo root (local dev)
or real environment variables (Docker / ECS). See ../.env.example.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

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

CLIENT_URL = os.environ.get("CLIENT_URL", "http://localhost:5173")


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
]

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Sets a Content-Security-Policy on every response in production (no-op under
    # DEBUG so Vite's dev server keeps working). Cheap response-header middleware.
    "config.middleware.ContentSecurityPolicyMiddleware",
    # WhiteNoise (serves the built SPA + static) is inserted below for non-DEBUG.
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
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")

    # HTTPS hardening — TLS terminates at the ALB, which forwards plain HTTP with
    # X-Forwarded-Proto. Trusting that header makes request.is_secure() correct.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Env-overridable only so the local prod-container smoke test
    # (docker compose --profile prod) can run over plain-HTTP localhost.
    SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "True").lower() in (
        "true", "1", "yes",
    )
    # ALB health checks arrive over plain HTTP from inside the VPC — a redirect
    # would fail the check and cycle the task.
    SECURE_REDIRECT_EXEMPT = [r"^health$"]
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days; no preload (deliberate)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True  # covers *.resume.…; other apps live on the parent domain
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


# Database — DATABASE_URL, e.g. postgres://user:pass@localhost:5432/resume_builder

DATABASES = {
    "default": dj_database_url.config(
        default="postgres://resume_user:resume_pass@localhost:5432/resume_builder",
        conn_max_age=600,
    )
}


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# REST framework / OpenAPI

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # Scoped throttles applied per-view (not globally): "auth" blunts login/register
    # brute force (keyed by IP); "ai-burst" is a per-user burst guard on the AI
    # endpoints that complements the per-user daily/monthly quota in apps/ai/usage.py.
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        "ai-burst": "20/hour",
    },
    # One trusted proxy hop (the ALB). Without this, DRF keys IP throttles on the
    # whole client-supplied X-Forwarded-For header, which an attacker can rotate
    # to dodge the auth throttle. No effect in dev (no XFF header there).
    "NUM_PROXIES": 1,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Smart Resume Builder API",
    "DESCRIPTION": "AI-powered resume builder — resumes, auth, and Claude-assisted content.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Schema + Swagger UI are open in dev (Orval reads /api/schema/) but
    # login-gated in production — no anonymous API-surface disclosure.
    "SERVE_PERMISSIONS": (
        ["rest_framework.permissions.AllowAny"]
        if DEBUG
        else ["rest_framework.permissions.IsAuthenticated"]
    ),
}

# JWT lifetimes — short access token (kept in JS memory), longer refresh (httpOnly cookie).
# Each refresh rotates the token and blacklists the old one, so logout can revoke
# the cookie's token and a leaked refresh token dies at its next (or the real
# user's next) refresh instead of living out its full 7 days.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}


# CORS — Vite dev server locally; same-origin in production (SPA served by Django)

CORS_ALLOWED_ORIGINS = [CLIENT_URL]
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

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# App constants

ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
]

AI_DAILY_LIMIT = 10
AI_MONTHLY_LIMIT = 50

# AI (Claude) — Opus/Fable are deliberately NOT used. Haiku for the simple
# rewrites, Sonnet for the reasoning-heavy tailor-to-JD. Env-overridable.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_MODEL_SIMPLE = os.environ.get("AI_MODEL_SIMPLE", "claude-haiku-4-5")
AI_MODEL_TAILOR = os.environ.get("AI_MODEL_TAILOR", "claude-sonnet-4-6")
