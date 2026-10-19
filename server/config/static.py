"""WhiteNoise helpers for serving the built SPA and Django's static files."""

import re

# Django's ManifestStaticFilesStorage names: base.6b517d0d5813.css (12 hex digits).
_HASHED_STATIC = re.compile(r"^/static/.+\.[0-9a-f]{12}\.[A-Za-z0-9]+$")


def immutable_file_test(path, url):
    """Which files can be cached forever (their name changes when their content does).

    WhiteNoise's default only recognizes hashed files under STATIC_URL, so the Vite
    bundle in /assets/ (all content-hashed) got a 60-second max-age. Root files like
    favicon.svg, og-image.png, and site.webmanifest keep their names, so they stay
    short-lived.
    """
    return url.startswith("/assets/") or bool(_HASHED_STATIC.match(url))
