from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import service
from .serializers import (
    GenerateSummaryRequestSerializer,
    GenerateSummaryResponseSerializer,
    ImproveBulletRequestSerializer,
    ImproveBulletResponseSerializer,
    ParseResumeRequestSerializer,
    ParseResumeResponseSerializer,
    TailorJDRequestSerializer,
    TailorJDResponseSerializer,
)
from .service import AIServiceError
from .usage import (
    AIRateLimitError,
    check_limit,
    record_usage,
    reset_if_needed,
    usage_snapshot,
)


def _gate(user):
    """Reset counters and enforce the limit. Returns a 429 Response if over, else None."""
    reset_if_needed(user)
    try:
        check_limit(user)
    except AIRateLimitError as exc:
        return Response(
            {"detail": exc.message, "scope": exc.scope, "ai_usage": usage_snapshot(user)},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return None


class ImproveBulletView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        if (over := _gate(user)) is not None:
            return over

        text = req.validated_data["text"]
        role = req.validated_data.get("role", "")
        try:
            suggestion = service.improve_bullet(text, role)
        except AIServiceError as exc:
            record_usage(user, "improve-bullet", input_length=len(text), output_length=0, success=False)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        record_usage(user, "improve-bullet", input_length=len(text), output_length=len(suggestion), success=True)
        return Response({"suggestion": suggestion, "ai_usage": usage_snapshot(user)})


class GenerateSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        if (over := _gate(user)) is not None:
            return over

        content = req.validated_data["content"]
        try:
            summary = service.generate_summary(content)
        except AIServiceError as exc:
            record_usage(user, "generate-summary", input_length=len(str(content)), output_length=0, success=False)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        record_usage(user, "generate-summary", input_length=len(str(content)), output_length=len(summary), success=True)
        return Response({"summary": summary, "ai_usage": usage_snapshot(user)})


class TailorJDView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        if (over := _gate(user)) is not None:
            return over

        content = req.validated_data["content"]
        jd = req.validated_data["job_description"]
        in_len = len(jd) + len(str(content))
        try:
            result = service.tailor_to_jd(content, jd)
        except AIServiceError as exc:
            record_usage(user, "tailor-jd", input_length=in_len, output_length=0, success=False)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        record_usage(user, "tailor-jd", input_length=in_len, output_length=len(str(result)), success=True)
        return Response({**result, "ai_usage": usage_snapshot(user)})


class ParseResumeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

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
        if (over := _gate(user)) is not None:
            return over

        text = req.validated_data["text"]
        try:
            content = service.parse_resume(text)
        except AIServiceError as exc:
            record_usage(user, "parse-resume", input_length=len(text), output_length=0, success=False)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        record_usage(user, "parse-resume", input_length=len(text), output_length=len(str(content)), success=True)
        return Response({"content": content, "ai_usage": usage_snapshot(user)})
