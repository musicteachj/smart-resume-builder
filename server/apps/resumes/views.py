from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Resume
from .serializers import ResumeSerializer


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

    def get_queryset(self):
        # drf-spectacular introspects with an unauthenticated "fake" view.
        if getattr(self, "swagger_fake_view", False):
            return Resume.objects.none()
        return Resume.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

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
            content=original.content,
        )
        serializer = self.get_serializer(copy)
        return Response(serializer.data, status=201)
