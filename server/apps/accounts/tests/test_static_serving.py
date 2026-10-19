"""Static/SPA serving: long caching for hashed files only, correct types, fresh HTML."""

import pytest
from django.conf import settings

from config.static import immutable_file_test


@pytest.mark.parametrize(
    "url",
    [
        "/assets/index-BAbc123x.js",  # Vite: every file in /assets/ is content-hashed
        "/assets/pdf.worker.min-DeF456.mjs",
        "/static/admin/css/base.6b517d0d5813.css",  # Django ManifestStaticFilesStorage
    ],
)
def test_hashed_files_are_immutable(url):
    assert immutable_file_test("/unused", url)


@pytest.mark.parametrize(
    "url",
    ["/favicon.svg", "/og-image.png", "/site.webmanifest", "/index.html", "/static/admin/css/base.css"],
)
def test_unhashed_files_are_not_immutable(url):
    assert not immutable_file_test("/unused", url)


def test_whitenoise_gets_the_function_not_a_string():
    # WhiteNoise treats a string WHITENOISE_IMMUTABLE_FILE_TEST as a regex.
    assert settings.WHITENOISE_IMMUTABLE_FILE_TEST is immutable_file_test


def test_webmanifest_is_served_as_a_manifest():
    assert settings.WHITENOISE_MIMETYPES[".webmanifest"] == "application/manifest+json"


def test_spa_shell_is_never_cached(client, monkeypatch):
    # index.html points at the current hashed bundles; a cached copy after a deploy
    # would load stale (deleted) chunks.
    import config.urls

    monkeypatch.setattr(config.urls, "_INDEX_HTML", "<!doctype html><title>ResumeIQ</title>")
    res = client.get("/dashboard")
    assert res.status_code == 200
    assert res["Cache-Control"] == "no-cache"
