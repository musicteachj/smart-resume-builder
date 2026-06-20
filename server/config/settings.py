"""
Django settings for Smart Resume Builder.

Environment-driven: values come from a `.env` file at the repo root (local dev)
or real environment variables (Docker / ECS). See ../.env.example.
"""

import os
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

DEBUG = os.environ.get("DEBUG", "True").lower() in ("true", "1", "yes")

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
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Smart Resume Builder API",
    "DESCRIPTION": "AI-powered resume builder — resumes, auth, and Claude-assisted content.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}


# CORS — Vite dev server locally; same-origin in production (SPA served by Django)

CORS_ALLOWED_ORIGINS = [CLIENT_URL]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files — WhiteNoise serves the built SPA in production

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

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
