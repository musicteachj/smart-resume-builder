import uuid

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
)
from django.db import transaction
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import versions
from .models import CoverLetter, Resume, ResumeVersion
from .serializers import (
    CoverLetterSerializer,
    ResumeListSerializer,
    ResumeSerializer,
    ResumeVersionCreateSerializer,
    ResumeVersionListSerializer,
    ResumeVersionSerializer,
)
from .throttles import WriteRateThrottle


def filter_by_resume_param(request, qs):
    """Apply the optional `?resume=<uuid>` filter; a malformed id matches nothing."""
    resume_id = request.query_params.get("resume")
    if resume_id:
        try:
            uuid.UUID(str(resume_id))
        except ValueError:
            return qs.none()
        qs = qs.filter(resume_id=resume_id)
    return qs


@extend_schema_view(
    list=extend_schema(operation_id="list_resumes", tags=["resumes"]),
    create=extend_schema(operation_id="create_resume", tags=["resumes"]),
    retrieve=extend_schema(operation_id="get_resume", tags=["resumes"]),
    update=extend_schema(operation_id="update_resume", tags=["resumes"]),
    partial_update=extend_schema(operation_id="patch_resume", tags=["resumes"]),
    destroy=extend_schema(operation_id="delete_resume", tags=["resumes"]),
)
class ResumeViewSet(viewsets.ModelViewSet):
    """CRUD for the authenticated user's resumes, plus a duplicate action.
    All queries are scoped to request.user — a user can never see or touch
    another user's resume (returns 404)."""

    serializer_class = ResumeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WriteRateThrottle]

    def get_serializer_class(self):
        # Dashboard list uses a trimmed serializer (no heavy content blob).
        if self.action == "list":
            return ResumeListSerializer
        return ResumeSerializer

    def get_queryset(self):
        # drf-spectacular introspects with an unauthenticated "fake" view.
        if getattr(self, "swagger_fake_view", False):
            return Resume.objects.none()
        return Resume.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        # Lock the row so concurrent saves (two tabs, a restore) serialize: no
        # duplicate checkpoints, and the checkpoint sees the committed state.
        with transaction.atomic():
            current = versions.lock(serializer.instance.pk)
            # Checkpoint the pre-update state (at most once per editing session).
            versions.maybe_auto_snapshot(current, serializer.validated_data)
            serializer.save()

    @extend_schema(
        operation_id="duplicate_resume",
        request=None,
        responses={201: ResumeSerializer},
        tags=["resumes"],
    )
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        original = self.get_object()
        copy = Resume.objects.create(
            user=request.user,
            title=f"{original.title} (Copy)",
            template=original.template,
            document_font=original.document_font,
            section_order=original.section_order,
            content=original.content,
        )
        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)


@extend_schema_view(
    list=extend_schema(
        operation_id="list_cover_letters",
        parameters=[
            OpenApiParameter(
                "resume",
                OpenApiTypes.UUID,
                description="Filter to one résumé's letters.",
            )
        ],
        tags=["cover-letters"],
    ),
    create=extend_schema(operation_id="create_cover_letter", tags=["cover-letters"]),
    retrieve=extend_schema(operation_id="get_cover_letter", tags=["cover-letters"]),
    partial_update=extend_schema(operation_id="patch_cover_letter", tags=["cover-letters"]),
    destroy=extend_schema(operation_id="delete_cover_letter", tags=["cover-letters"]),
)
class CoverLetterViewSet(viewsets.ModelViewSet):
    """CRUD for the authenticated user's saved cover letters, scoped to
    request.user (cross-user access → 404). Optional ?resume= filter."""

    serializer_class = CoverLetterSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WriteRateThrottle]
    http_method_names = ["get", "post", "patch", "delete"]  # no PUT

    RETENTION = 25

    def get_queryset(self):
        # drf-spectacular introspects with an unauthenticated "fake" view.
        if getattr(self, "swagger_fake_view", False):
            return CoverLetter.objects.none()
        return filter_by_resume_param(self.request, CoverLetter.objects.filter(user=self.request.user))

    def perform_create(self, serializer):
        letter = serializer.save(user=self.request.user)
        # Keep only the newest RETENTION letters for this résumé.
        versions.keep_newest(letter.resume.cover_letters.all(), self.RETENTION, order_by="-updated_at")


@extend_schema_view(
    list=extend_schema(
        operation_id="list_resume_versions",
        parameters=[
            OpenApiParameter(
                "resume",
                OpenApiTypes.UUID,
                description="The résumé whose history to list (required).",
                required=True,
            )
        ],
        responses=ResumeVersionListSerializer(many=True),
        tags=["resume-versions"],
    ),
    create=extend_schema(
        operation_id="create_resume_version",
        request=ResumeVersionCreateSerializer,
        responses={201: ResumeVersionSerializer},
        tags=["resume-versions"],
    ),
    retrieve=extend_schema(operation_id="get_resume_version", tags=["resume-versions"]),
    partial_update=extend_schema(operation_id="patch_resume_version", tags=["resume-versions"]),
    destroy=extend_schema(operation_id="delete_resume_version", tags=["resume-versions"]),
)
class ResumeVersionViewSet(viewsets.ModelViewSet):
    """History for the authenticated user's résumés, scoped to request.user
    (cross-user access → 404). Optional ?resume= filter. Versions are snapshots:
    only `label` is editable; restore puts one back on its résumé."""

    serializer_class = ResumeVersionSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WriteRateThrottle]
    http_method_names = ["get", "post", "patch", "delete"]  # no PUT

    def get_serializer_class(self):
        if self.action == "list":
            return ResumeVersionListSerializer
        if self.action == "create":
            return ResumeVersionCreateSerializer
        return ResumeVersionSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ResumeVersion.objects.none()
        return filter_by_resume_param(self.request, ResumeVersion.objects.filter(user=self.request.user))

    def list(self, request, *args, **kwargs):
        # History is always per résumé; never return every version a user has.
        if not request.query_params.get("resume"):
            return Response({"detail": "The resume query parameter is required."}, status=400)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            version = versions.snapshot(data["resume"], data["kind"], data["label"])
        except versions.ManualLimitReached:
            # Plain-string `detail`, like every other API error the client reads.
            return Response(
                {"detail": f"You can keep up to {versions.MANUAL_LIMIT} saved versions. Delete one first."},
                status=400,
            )
        return Response(ResumeVersionSerializer(version).data, status=201)

    @extend_schema(
        operation_id="restore_resume_version",
        request=None,
        responses={200: ResumeSerializer},
        tags=["resume-versions"],
    )
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        resume = versions.restore(self.get_object())
        return Response(ResumeSerializer(resume).data)

