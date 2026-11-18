"""Per-user AI usage gate (cost protection).

Resets the daily counter on a new day and the monthly counter every 30 days, then
reserves one call against the configured limits before the AI call runs, and gives
the reservation back if the call fails. Admins and DEBUG (local dev) bypass the cap
but are still counted and logged.

The reservation is a single conditional UPDATE, so concurrent requests can't all pass
a stale "under the limit" read and overspend the quota together.
"""

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import F
from django.db.models.functions import Greatest
from django.utils import timezone

from .models import AIUsageLog

_COUNTERS = ["ai_calls_today", "ai_calls_this_month"]


class AIRateLimitError(Exception):
    """Raised when a user is over their AI usage limit (maps to HTTP 429)."""

    def __init__(self, message: str, scope: str):
        super().__init__(message)
        self.message = message
        self.scope = scope  # "daily" | "monthly"


def _rows(user):
    return get_user_model().objects.filter(pk=user.pk)


def reset_if_needed(user) -> None:
    """Zero the daily counter on a new day and the monthly one every 30 days.

    The in-memory user decides whether a reset might be due (so the common case costs
    no query); the UPDATE's own condition decides whether it happens, so a request
    holding a stale copy can't wipe out a call another request already reserved today.
    """
    now = timezone.now()
    today = now.date()
    changed = False
    if user.last_ai_call_date != today and user.ai_calls_today != 0:
        changed |= bool(
            _rows(user)
            .filter(ai_calls_today__gt=0)
            .exclude(last_ai_call_date=today)
            .update(ai_calls_today=0)
        )
    month_start = now - timedelta(days=30)
    if user.last_month_reset <= month_start:
        changed |= bool(
            _rows(user)
            .filter(last_month_reset__lte=month_start)
            .update(ai_calls_this_month=0, last_month_reset=now)
        )
    if changed:
        user.refresh_from_db(fields=[*_COUNTERS, "last_month_reset"])


@dataclass(frozen=True)
class Reservation:
    """One claimed AI call, tied to the daily and 30-day periods it was counted in."""

    day: date
    month_reset: datetime


def reserve(user) -> Reservation:
    """Claim one AI call, or raise AIRateLimitError if the user is at a limit.

    Admins and DEBUG skip the limit check but are still counted. On return the user's
    counters are fresh from the database (the 429 body and responses report them).
    """
    rows = _rows(user)
    if not (user.is_admin or settings.DEBUG):
        rows = rows.filter(
            ai_calls_today__lt=settings.AI_DAILY_LIMIT,
            ai_calls_this_month__lt=settings.AI_MONTHLY_LIMIT,
        )
    claimed = rows.update(
        ai_calls_today=F("ai_calls_today") + 1,
        ai_calls_this_month=F("ai_calls_this_month") + 1,
        last_ai_call_date=timezone.now().date(),
    )
    user.refresh_from_db(fields=[*_COUNTERS, "last_ai_call_date", "last_month_reset"])
    if claimed:
        return Reservation(day=user.last_ai_call_date, month_reset=user.last_month_reset)
    if user.ai_calls_today >= settings.AI_DAILY_LIMIT:
        raise AIRateLimitError(
            f"Daily AI limit reached ({settings.AI_DAILY_LIMIT}/day). Resets tomorrow.",
            "daily",
        )
    raise AIRateLimitError(
        f"Monthly AI limit reached ({settings.AI_MONTHLY_LIMIT}/month).",
        "monthly",
    )


def refund(user, reservation: Reservation) -> None:
    """Give back a reservation whose AI call failed: failed calls don't use quota.

    Each counter is refunded only if it hasn't been reset since the reservation, so a
    call that fails after midnight (or after the 30-day rollover) can't come out of the
    new period's count.
    """
    rows = _rows(user)
    rows.filter(last_ai_call_date=reservation.day).update(
        ai_calls_today=Greatest(F("ai_calls_today") - 1, 0)
    )
    rows.filter(last_month_reset=reservation.month_reset).update(
        ai_calls_this_month=Greatest(F("ai_calls_this_month") - 1, 0)
    )
    user.refresh_from_db(fields=_COUNTERS)


@contextmanager
def refund_on_failure(user, reservation: Reservation):
    """Wrap the AI call: any exception (upstream error, bad model output, a bug in
    normalization) refunds the reservation before it propagates."""
    try:
        yield
    except BaseException:
        refund(user, reservation)
        raise


def record_usage(user, feature: str, *, input_length: int, output_length: int, success: bool) -> None:
    """Log one AI call. The quota itself is counted by reserve() and refund()."""
    AIUsageLog.objects.create(
        user=user,
        feature=feature,
        input_length=input_length,
        output_length=output_length,
        success=success,
    )


def usage_snapshot(user) -> dict:
    """Same shape as accounts.UserSerializer.ai_usage, reused by AI responses."""
    return {
        "calls_today": user.ai_calls_today,
        "calls_this_month": user.ai_calls_this_month,
        "daily_limit": settings.AI_DAILY_LIMIT,
        "monthly_limit": settings.AI_MONTHLY_LIMIT,
        "is_admin": user.is_admin,
    }
