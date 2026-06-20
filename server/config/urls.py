"""URL configuration for Smart Resume Builder."""

from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse, HttpResponseNotFound, JsonResponse
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    """Health check for the ALB (and local sanity checks)."""
    return JsonResponse({"status": "ok"})


# Built SPA index, read once at startup (present only in the production image).
_SPA_INDEX = settings.SPA_ROOT / "index.html"
_INDEX_HTML = _SPA_INDEX.read_text() if _SPA_INDEX.exists() else None


def spa_index(_request):
    """Serve the SPA shell for any client-side route (deep links / hard reloads)."""
    if _INDEX_HTML is None:
        return HttpResponseNotFound("SPA build not present — use the Vite dev server in development.")
    return HttpResponse(_INDEX_HTML, content_type="text/html")


urlpatterns = [
    path("health", health),
    path("admin/", admin.site.urls),
    # API
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.resumes.urls")),
    path("api/ai/", include("apps.ai.urls")),
    # OpenAPI schema + docs (Orval consumes /api/schema/)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger-ui/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # SPA fallback — anything not handled above (and not a static/asset path) returns
    # index.html so React Router can take over. WhiteNoise serves real asset files first.
    re_path(r"^(?!api/|admin/|static/|assets/|health$).*$", spa_index),
]
