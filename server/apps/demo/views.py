from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.ai import ledger

from .serializers import DemoStatusSerializer

# Below this much room left today, a call is likely to be refused, so the UI says so up front.
STATUS_MIN_ROOM_MICROS = 250_000
STATUS_CACHE_KEY = "demo-status"
STATUS_CACHE_SECONDS = 60


def _ai_reason() -> str:
    if ledger.live_ai_off():
        return "off"
    if ledger.room_today_micros() < STATUS_MIN_ROOM_MICROS:
        return "daily_used"
    return "ok"


def _status() -> dict:
    ai_reason = _ai_reason()
    live_guests = User.objects.filter(is_guest=True, guest_expires_at__gt=timezone.now()).count()
    return {
        "demo_mode": settings.DEMO_MODE,
        "turnstile_site_key": settings.TURNSTILE_SITE_KEY,
        "ai_available": ai_reason == "ok",
        "ai_reason": ai_reason,
        "guest_start_available": (
            settings.DEMO_MODE
            and settings.TURNSTILE_SITE_KEY != ""
            and live_guests < settings.DEMO_MAX_LIVE_GUESTS
        ),
    }


class DemoStatusView(APIView):
    """Public facts the SPA needs before anyone signs in. Cached for a minute."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @extend_schema(operation_id="get_demo_status", responses=DemoStatusSerializer, tags=["demo"])
    def get(self, request):
        body = cache.get(STATUS_CACHE_KEY)
        if body is None:
            body = _status()
            cache.set(STATUS_CACHE_KEY, body, STATUS_CACHE_SECONDS)
        response = Response(body)
        response["Cache-Control"] = "public, max-age=60"
        return response
