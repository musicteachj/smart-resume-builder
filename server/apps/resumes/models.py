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
    # Optional custom order of the content sections (keys like "skills"); empty = canonical order.
    section_order = models.JSONField(default=list, blank=True)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["user"])]

    def __str__(self):
        return f"{self.title} ({self.user_id})"


class CoverLetter(models.Model):
    """A saved cover letter, generated from a résumé + a job description.
    Deleted with its résumé. See apps.resumes.serializers.CoverLetterSerializer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resume = models.ForeignKey(
        Resume, on_delete=models.CASCADE, related_name="cover_letters"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cover_letters"
    )
    title = models.CharField(max_length=150)
    body = models.TextField()
    job_description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["resume"])]

    def __str__(self):
        return f"{self.title} ({self.resume_id})"


class ResumeVersion(models.Model):
    """A point-in-time snapshot of a résumé, for history and restore. Deleted with
    its résumé. Created by apps.resumes.versions (never edited apart from `label`)."""

    class Kind(models.TextChoices):
        AUTO = "auto", "Automatic checkpoint"
        MANUAL = "manual", "Saved version"
        RESTORE = "restore", "Before restore"
        AI = "ai", "Before an AI change"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resume = models.ForeignKey(Resume, on_delete=models.CASCADE, related_name="versions")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resume_versions"
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    label = models.CharField(max_length=100, blank=True)
    # Snapshot of the résumé's document fields (everything ResumeVersionViewSet.restore puts back).
    title = models.CharField(max_length=100)
    template = models.SlugField()
    document_font = models.SlugField(default="", blank=True)
    section_order = models.JSONField(default=list, blank=True)
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["resume", "-created_at"])]

    def __str__(self):
        return f"{self.get_kind_display()} of {self.resume_id} at {self.created_at:%Y-%m-%d %H:%M}"
