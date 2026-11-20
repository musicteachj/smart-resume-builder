import copy
import logging
import math
from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle
from rest_framework.views import APIView

from apps.accounts.cookies import set_refresh_cookie
from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer
from apps.accounts.tokens import issue_refresh, refresh_cookie_max_age
from apps.ai import ledger
from apps.resumes.models import Resume

from . import turnstile
from .messages import start_refusal
from .sample import SAMPLE_CONTENT, SAMPLE_TITLE
from .serializers import DemoStatusSerializer, GuestStartRequestSerializer, GuestStartResponseSerializer
from .throttles import DemoStartDayThrottle, DemoStartHourThrottle

logger = logging.getLogger(__name__)

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
    live_guests = _live_guests()
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


def _live_guests() -> int:
    return User.objects.filter(is_guest=True, guest_expires_at__gt=timezone.now()).count()


class DemoStartView(APIView):
    """Start a demo: verify the bot check, then create a throwaway guest with a sample résumé."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DemoStartHourThrottle, DemoStartDayThrottle]

    def initial(self, request, *args, **kwargs):
        if not settings.DEMO_MODE:
            raise Http404
        super().initial(request, *args, **kwargs)

    def handle_exception(self, exc):
        if isinstance(exc, Throttled):
            headers = {"Retry-After": str(max(1, math.ceil(exc.wait)))} if exc.wait else None
            return start_refusal("demo_rate_limited", headers=headers)
        return super().handle_exception(exc)

    @extend_schema(
        operation_id="start_demo",
        request=GuestStartRequestSerializer,
        responses={201: GuestStartResponseSerializer},
        tags=["demo"],
    )
    def post(self, request):
        serializer = GuestStartRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if _live_guests() >= settings.DEMO_MAX_LIVE_GUESTS:
            return start_refusal("demo_full")
        verdict = turnstile.verify(
            serializer.validated_data["turnstile_token"],
            remote_ip=BaseThrottle().get_ident(request),
        )
        if verdict is turnstile.Verdict.UNAVAILABLE:
            return start_refusal("bot_check_unavailable")
        if verdict is not turnstile.Verdict.PASSED:
            return start_refusal("bot_check_failed")

        with transaction.atomic():
            guest = User.objects.create_user(
                email=f"guest-{uuid4().hex}@demo.invalid",
                name="Demo guest",
                password=None,
                is_guest=True,
                guest_expires_at=timezone.now() + timedelta(hours=settings.DEMO_GUEST_TTL_HOURS),
            )
            resume = Resume.objects.create(
                user=guest,
                title=SAMPLE_TITLE,
                template="classic",
                content=copy.deepcopy(SAMPLE_CONTENT),
            )
            refresh = issue_refresh(guest)
        logger.info("Demo guest started: guest=%s", guest.pk)
        response = Response(
            {"user": UserSerializer(guest).data, "access": str(refresh.access_token), "resume_id": resume.pk},
            status=201,
        )
        return set_refresh_cookie(response, str(refresh), max_age=refresh_cookie_max_age(guest))
