"""URL configuration for ResumeIQ."""

from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.demo.closed import ClosedInDemoModeMixin


class DemoClosedSchemaView(ClosedInDemoModeMixin, SpectacularAPIView):
    """The OpenAPI schema, hidden (404) in demo mode."""


class DemoClosedSwaggerView(ClosedInDemoModeMixin, SpectacularSwaggerView):
    """Swagger UI, hidden (404) in demo mode."""


# Built SPA index, read once at startup (present only in the production image).
_SPA_INDEX = settings.SPA_ROOT / "index.html"
_INDEX_HTML = _SPA_INDEX.read_text() if _SPA_INDEX.exists() else None


def spa_index(_request):
    """Serve the SPA shell for any client-side route (deep links / hard reloads)."""
    if _INDEX_HTML is None:
        return HttpResponseNotFound("SPA build not present — use the Vite dev server in development.")
    response = HttpResponse(_INDEX_HTML, content_type="text/html")
    # Always revalidate: the shell names the current hashed bundles, and a stale copy
    # after a deploy would request chunks that no longer exist.
    response["Cache-Control"] = "no-cache"
    return response


urlpatterns = [
    # API
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.resumes.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/demo/", include("apps.demo.urls")),
    # OpenAPI schema + docs (Orval consumes /api/schema/)
    path("api/schema/", DemoClosedSchemaView.as_view(), name="schema"),
    path(
        "api/schema/swagger-ui/",
        DemoClosedSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # SPA fallback — anything not handled above (and not a static/asset path) returns
    # index.html so React Router can take over. WhiteNoise serves real asset files first.
    re_path(r"^(?!api/|admin/|static/|assets/|health$).*$", spa_index),
]

# Django admin: dev, or production only when DJANGO_ADMIN_ENABLED is set. Otherwise
# /admin/ matches nothing (the SPA fallback above excludes it), so it's a 404.
if settings.DEBUG or settings.DJANGO_ADMIN_ENABLED:
    urlpatterns.insert(0, path("admin/", admin.site.urls))
