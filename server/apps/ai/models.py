import uuid

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


class AIBudgetDay(models.Model):
    """One UTC day of the AI dollar ledger, in micro-dollars."""

    day = models.DateField(primary_key=True)
    settled_micros = models.BigIntegerField(default=0)
    reserved_micros = models.BigIntegerField(default=0)

    def __str__(self):
        return f"{self.day}: {self.settled_micros} settled, {self.reserved_micros} reserved"


class AIReservation(models.Model):
    """The most one model call could cost, held until it settles. Deliberately no foreign key to User."""

    SETTLED_HOW_CHOICES = [
        ("usage", "Billed from usage"),
        ("unbilled", "Never billed"),
        ("kept", "Kept at the reservation"),
        ("swept", "Swept as stale"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    day = models.DateField(db_index=True)
    amount_micros = models.BigIntegerField()
    actual_micros = models.BigIntegerField(null=True)
    visitor_id = models.BigIntegerField(null=True)
    feature = models.CharField(max_length=32)
    model = models.CharField(max_length=64)
    created_at = models.DateTimeField()
    settled_at = models.DateTimeField(null=True)
    settled_how = models.CharField(max_length=10, choices=SETTLED_HOW_CHOICES, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["created_at"],
                name="ai_reservation_open_idx",
                condition=models.Q(settled_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.feature} {self.amount_micros} on {self.day}"
