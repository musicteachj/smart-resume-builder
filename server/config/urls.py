"""URL configuration for Smart Resume Builder."""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    """Health check for the ALB (and local sanity checks)."""
    return JsonResponse({"status": "ok"})


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
]
