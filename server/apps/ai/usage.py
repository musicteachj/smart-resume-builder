"""Per-user AI usage gate — cost protection.

Resets the daily counter on a new day and the monthly counter every 30 days,
enforces the configured limits, and records each call. Admins and DEBUG (local
dev) bypass the cap but are still logged.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .models import AIUsageLog


class AIRateLimitError(Exception):
    """Raised when a user is over their AI usage limit (maps to HTTP 429)."""

    def __init__(self, message: str, scope: str):
        super().__init__(message)
        self.message = message
        self.scope = scope  # "daily" | "monthly"


def reset_if_needed(user) -> None:
    now = timezone.now()
    today = now.date()
    fields: list[str] = []
    if user.last_ai_call_date != today and user.ai_calls_today != 0:
        user.ai_calls_today = 0
        fields.append("ai_calls_today")
    if now - user.last_month_reset >= timedelta(days=30):
        user.ai_calls_this_month = 0
        user.last_month_reset = now
        fields += ["ai_calls_this_month", "last_month_reset"]
    if fields:
        user.save(update_fields=fields)


def check_limit(user) -> None:
    """Raise AIRateLimitError if the user is over a limit. Admin/DEBUG bypass."""
    if user.is_admin or settings.DEBUG:
        return
    if user.ai_calls_today >= settings.AI_DAILY_LIMIT:
        raise AIRateLimitError(
            f"Daily AI limit reached ({settings.AI_DAILY_LIMIT}/day). Resets tomorrow.",
            "daily",
        )
    if user.ai_calls_this_month >= settings.AI_MONTHLY_LIMIT:
        raise AIRateLimitError(
            f"Monthly AI limit reached ({settings.AI_MONTHLY_LIMIT}/month).",
            "monthly",
        )


def record_usage(user, feature: str, *, input_length: int, output_length: int, success: bool) -> None:
    AIUsageLog.objects.create(
        user=user,
        feature=feature,
        input_length=input_length,
        output_length=output_length,
        success=success,
    )
    if success:
        # F() expressions so concurrent calls increment atomically in the DB
        # instead of racing through a stale read-modify-write.
        user.ai_calls_today = F("ai_calls_today") + 1
        user.ai_calls_this_month = F("ai_calls_this_month") + 1
        user.last_ai_call_date = timezone.now().date()
        user.save(update_fields=["ai_calls_today", "ai_calls_this_month", "last_ai_call_date"])
        # Callers read the counters right after (usage_snapshot in the response).
        user.refresh_from_db(fields=["ai_calls_today", "ai_calls_this_month"])


def usage_snapshot(user) -> dict:
    """Same shape as accounts.UserSerializer.ai_usage — reused by AI responses."""
    return {
        "calls_today": user.ai_calls_today,
        "calls_this_month": user.ai_calls_this_month,
        "daily_limit": settings.AI_DAILY_LIMIT,
        "monthly_limit": settings.AI_MONTHLY_LIMIT,
        "is_admin": user.is_admin,
    }
