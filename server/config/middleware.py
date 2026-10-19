"""Custom HTTP middleware for config-level concerns (security headers)."""

from django.conf import settings
from django.http import JsonResponse

# Content-Security-Policy for the SPA + API served from one origin.
#
# - script-src 'self': the React bundle is same-origin; no inline/external scripts.
# - style-src allows 'unsafe-inline' (components use inline style= for things like the
#   scaled template previews) and the Google Fonts stylesheet host.
# - font-src allows the Google Fonts file host (Newsreader/Inter are loaded via the
#   @import in client/src/index.css). If those fonts are ever self-hosted, drop the
#   two fonts.* hosts and tighten to 'self'.
# - img-src allows data: for inline SVG/data-URI icons.
# - connect-src 'self': the API is same-origin in production.
CSP_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
)


class HealthCheckMiddleware:
    """Answer GET /health before anything else runs.

    ALB health checks send the task's private IP as the Host header, which
    ALLOWED_HOSTS (rightly) rejects with a 400, and they arrive over plain HTTP,
    which the SSL redirect would bounce. Answering here, first in the stack,
    skips both. It never touches the database: a DB blip shouldn't make ECS
    replace healthy tasks.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/health":
            return JsonResponse({"status": "ok"})
        return self.get_response(request)


class ContentSecurityPolicyMiddleware:
    """Attach a CSP header to every response in production.

    No-op under DEBUG: the Vite dev server relies on inline scripts and websocket
    HMR that a strict policy would block, and dev traffic never leaves localhost.
    The DEBUG check is evaluated per-request so tests can toggle it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not settings.DEBUG:
            response.setdefault("Content-Security-Policy", CSP_POLICY)
        return response
