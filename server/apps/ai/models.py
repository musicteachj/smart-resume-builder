from django.conf import settings
from django.db import models


class AIUsageLog(models.Model):
    """One row per AI call (success or failure) — cost-protection audit trail."""

    FEATURE_CHOICES = [
        ("improve-bullet", "Improve bullet"),
        ("generate-summary", "Generate summary"),
        ("tailor-jd", "Tailor to job description"),
        ("parse-resume", "Parse résumé"),
        ("cover-letter", "Cover letter"),
        ("ats-check", "ATS health check"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_usage_logs",
    )
    feature = models.CharField(max_length=32, choices=FEATURE_CHOICES)
    input_length = models.PositiveIntegerField(default=0)
    output_length = models.PositiveIntegerField(default=0)
    success = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"])]

    def __str__(self):
        return f"{self.feature} by {self.user_id} ({'ok' if self.success else 'fail'})"
