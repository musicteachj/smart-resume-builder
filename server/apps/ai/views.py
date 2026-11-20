import logging

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import Throttled
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import ledger, service
from .serializers import (
    AtsCheckRequestSerializer,
    AtsCheckResponseSerializer,
    CoverLetterRequestSerializer,
    CoverLetterResponseSerializer,
    GenerateSummaryRequestSerializer,
    GenerateSummaryResponseSerializer,
    ImproveBulletRequestSerializer,
    ImproveBulletResponseSerializer,
    ParseResumeRequestSerializer,
    ParseResumeResponseSerializer,
    TailorJDRequestSerializer,
    TailorJDResponseSerializer,
)
from .refusals import refusal
from .service import AIBudgetRefusedError, AIProviderLimitError, AIRefusedError, AIServiceError
from .usage import (
    AIRateLimitError,
    record_usage,
    refund_on_failure,
    reserve,
    reset_if_needed,
    usage_snapshot,
)

logger = logging.getLogger(__name__)


def _visitor_id(user) -> int | None:
    """Demo guests spend from their own allowance; everyone else only from the shared budget."""
    return user.pk if user.is_guest else None


def _gate(user):
    """Reset counters and reserve one call. Returns (refusal Response, None) if live AI is off or the user is
    over, else (None, reservation). Run the AI call inside refund_on_failure(user, reservation)."""
    if ledger.live_ai_off():
        return refusal("ai_off"), None
    reset_if_needed(user)
    try:
        return None, reserve(user)
    except AIRateLimitError as exc:
        if exc.scope == "guest":
            return refusal("ai_visitor_used"), None
        return Response(
            {"detail": exc.message, "scope": exc.scope, "ai_usage": usage_snapshot(user)},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        ), None


_BUDGET_CODES = {"off": "ai_off", "daily": "ai_daily_used", "visitor": "ai_visitor_used"}


def _ai_error(exc, feature):
    """A friendly refusal with a `code` for an AI failure (422 for a model refusal, below). The raw message is handy
    in dev but may expose internals, so it only replaces the copy under DEBUG; production always gets the table copy.

    Logs the failure for CloudWatch: the upstream error type, HTTP status, and
    Anthropic request id, never the message text (it can echo the prompt) or any
    résumé content. Our own errors (e.g. missing API key) have no upstream cause and
    their message is safe to log.

    A refusal is not an outage: it returns 422 with a message the user can act on
    (reword the request), and logs only the refusal category."""
    if isinstance(exc, AIRefusedError):
        logger.warning("AI call refused: feature=%s category=%s", feature, exc.category)
        return Response({"detail": exc.message}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    if isinstance(exc, AIBudgetRefusedError):
        logger.warning("AI call refused by the budget: feature=%s scope=%s", feature, exc.scope)
        return refusal(_BUDGET_CODES.get(exc.scope, "ai_unavailable"))
    cause = exc.__cause__
    if cause is None:
        logger.warning("AI call failed: feature=%s error=%s", feature, exc)
    else:
        logger.warning(
            "AI call failed: feature=%s error=%s status=%s request_id=%s",
            feature,
            type(cause).__name__,
            getattr(cause, "status_code", None),
            getattr(cause, "request_id", None),
        )
    detail = str(exc) if settings.DEBUG else None
    if isinstance(exc, AIProviderLimitError):
        logger.error("Anthropic spend limit reached: feature=%s", feature)
        return refusal("ai_provider_limit", detail=detail)
    return refusal("ai_unavailable", detail=detail)


class _AIView(APIView):
    """Base for AI endpoints: auth required + a per-user burst throttle (complements
    the per-user daily/monthly quota in usage.py)."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai-burst"

    def handle_exception(self, exc):
        if isinstance(exc, Throttled):
            return refusal("ai_rate_limited", headers={"Retry-After": str(int(exc.wait or 60))})
        return super().handle_exception(exc)


class ImproveBulletView(_AIView):
    @extend_schema(
        operation_id="improve_bullet",
        request=ImproveBulletRequestSerializer,
        responses=ImproveBulletResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = ImproveBulletRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        text = req.validated_data["text"]
        role = req.validated_data.get("role", "")
        try:
            with refund_on_failure(user, reservation):
                suggestion = service.improve_bullet(text, role, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "improve-bullet", input_length=len(text), output_length=0, success=False)
            return _ai_error(exc, "improve-bullet")

        record_usage(user, "improve-bullet", input_length=len(text), output_length=len(suggestion), success=True)
        return Response({"suggestion": suggestion, "ai_usage": usage_snapshot(user)})


class GenerateSummaryView(_AIView):
    @extend_schema(
        operation_id="generate_summary",
        request=GenerateSummaryRequestSerializer,
        responses=GenerateSummaryResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = GenerateSummaryRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        content = req.validated_data["content"]
        try:
            with refund_on_failure(user, reservation):
                summary = service.generate_summary(content, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "generate-summary", input_length=len(str(content)), output_length=0, success=False)
            return _ai_error(exc, "generate-summary")

        record_usage(user, "generate-summary", input_length=len(str(content)), output_length=len(summary), success=True)
        return Response({"summary": summary, "ai_usage": usage_snapshot(user)})


class TailorJDView(_AIView):
    @extend_schema(
        operation_id="tailor_jd",
        request=TailorJDRequestSerializer,
        responses=TailorJDResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = TailorJDRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        content = req.validated_data["content"]
        jd = req.validated_data["job_description"]
        in_len = len(jd) + len(str(content))
        try:
            with refund_on_failure(user, reservation):
                result = service.tailor_to_jd(content, jd, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "tailor-jd", input_length=in_len, output_length=0, success=False)
            return _ai_error(exc, "tailor-jd")

        record_usage(user, "tailor-jd", input_length=in_len, output_length=len(str(result)), success=True)
        return Response({**result, "ai_usage": usage_snapshot(user)})


class ParseResumeView(_AIView):
    @extend_schema(
        operation_id="parse_resume",
        request=ParseResumeRequestSerializer,
        responses=ParseResumeResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = ParseResumeRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        text = req.validated_data["text"]
        try:
            with refund_on_failure(user, reservation):
                content = service.parse_resume(text, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "parse-resume", input_length=len(text), output_length=0, success=False)
            return _ai_error(exc, "parse-resume")

        record_usage(user, "parse-resume", input_length=len(text), output_length=len(str(content)), success=True)
        return Response({"content": content, "ai_usage": usage_snapshot(user)})


class CoverLetterView(_AIView):
    @extend_schema(
        operation_id="generate_cover_letter",
        request=CoverLetterRequestSerializer,
        responses=CoverLetterResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = CoverLetterRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        content = req.validated_data["content"]
        jd = req.validated_data["job_description"]
        in_len = len(jd) + len(str(content))
        try:
            with refund_on_failure(user, reservation):
                letter = service.generate_cover_letter(content, jd, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "cover-letter", input_length=in_len, output_length=0, success=False)
            return _ai_error(exc, "cover-letter")

        record_usage(user, "cover-letter", input_length=in_len, output_length=len(letter), success=True)
        return Response({"cover_letter": letter, "ai_usage": usage_snapshot(user)})


class AtsCheckView(_AIView):
    @extend_schema(
        operation_id="ats_health_check",
        request=AtsCheckRequestSerializer,
        responses=AtsCheckResponseSerializer,
        tags=["ai"],
    )
    def post(self, request):
        req = AtsCheckRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        user = request.user
        over, reservation = _gate(user)
        if over is not None:
            return over

        content = req.validated_data["content"]
        in_len = len(str(content))
        try:
            with refund_on_failure(user, reservation):
                result = service.ats_health_check(content, visitor_id=_visitor_id(user))
        except AIServiceError as exc:
            record_usage(user, "ats-check", input_length=in_len, output_length=0, success=False)
            return _ai_error(exc, "ats-check")

        record_usage(user, "ats-check", input_length=in_len, output_length=len(str(result)), success=True)
        return Response({**result, "ai_usage": usage_snapshot(user)})
