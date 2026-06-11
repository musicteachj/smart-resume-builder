"""URL configuration for Smart Resume Builder."""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import path


def health(_request):
    """Health check for the ALB (and local sanity checks)."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health", health),
    path("admin/", admin.site.urls),
    # API routes (auth, resumes, ai) land in Phase 2+ under /api/
]
