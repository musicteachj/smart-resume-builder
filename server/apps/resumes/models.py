import uuid

from django.conf import settings
from django.db import models


class Resume(models.Model):
    """A user's resume. `content` holds the structured document (see
    apps.resumes.serializers.ResumeContentSerializer for its shape)."""

    DEFAULT_TEMPLATE = "classic"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="resumes",
    )
    title = models.CharField(max_length=100)
    template = models.SlugField(default=DEFAULT_TEMPLATE)
    # Optional per-resume document typeface override; blank = use the template's default font.
    document_font = models.SlugField(default="", blank=True)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user"])]

    def __str__(self):
        return f"{self.title} ({self.user_id})"
