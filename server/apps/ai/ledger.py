"""The AI dollar ledger: reserve before each model call, settle after it.

Pattern: open-door/apps/api/app/ai/budget.py. Money is integer micro-dollars in two tables of its
own (`AIBudgetDay`, `AIReservation`): no foreign key to `User`, nothing in the cache.

A monthly budget is paced by day. Today's allowance is
`min(left, max(multiplier * left / days_left_including_today, floor))`, where `left` is the budget
minus what earlier days of this UTC month settled or still hold open. A reservation is admitted only
if today's settled + open + the reservation stays within that allowance.

Rules:
- Reserve and settle are a few short statements in one `transaction.atomic()` that holds nothing
  else. No transaction, row lock, or `select_for_update` is ever open while a model call runs.
- Lock order is always: the reservation row, then the visitor's `User` row, then the `AIBudgetDay`
  row (`reserve` has no reservation row yet, so it takes the User row, then the day row).
- A reservation records its UTC day and settles against that day, even past midnight.
- Never refund on an exception: a call that failed after sending may have been billed, so its
  reservation stays counted until the caller settles it or the sweeper charges it in full.
- The dollar ledger applies to admins and `DEBUG` too.
"""

import calendar
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_FLOOR, Decimal
from typing import Literal
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import F, Sum

from apps.accounts.models import User
from apps.ai.models import AIBudgetDay, AIReservation
from apps.ai.pricing import usd_to_micros

SettledHow = Literal["usage", "unbilled", "kept", "swept"]


def utcnow() -> datetime:
    """The ledger's clock. Tests patch this."""
    return datetime.now(UTC)


class BudgetRefused(Exception):
    """A reservation was refused: live AI is off, today is full, or the visitor spent their share."""

    def __init__(self, scope: Literal["off", "daily", "visitor"]) -> None:
        super().__init__(f"the {scope} AI budget does not allow this call")
        self.scope = scope


@dataclass(frozen=True)
class Reservation:
    id: UUID
    day: date
    amount_micros: int
    visitor_id: int | None


def allowance_today_micros(
    *, budget: int, multiplier: Decimal, floor: int, spent_before_today: int, today: date
) -> int:
    left = max(0, budget - spent_before_today)
    days_left = calendar.monthrange(today.year, today.month)[1] - today.day + 1
    even_share = int((multiplier * left / days_left).to_integral_value(rounding=ROUND_FLOOR))
    return min(left, max(even_share, floor))


def _budget_micros() -> int:
    return usd_to_micros(settings.AI_MONTHLY_BUDGET_USD)


def live_ai_off() -> bool:
    return _budget_micros() == 0


def _allowance_today(today: date) -> int:
    first = today.replace(day=1)
    before = AIBudgetDay.objects.filter(day__gte=first, day__lt=today).aggregate(
        total=Sum(F("settled_micros") + F("reserved_micros"))
    )["total"]
    return allowance_today_micros(
        budget=_budget_micros(),
        multiplier=settings.AI_PACING_MULTIPLIER,
        floor=usd_to_micros(settings.AI_DAILY_FLOOR_USD),
        spent_before_today=before or 0,
        today=today,
    )


def room_today_micros() -> int:
    today = utcnow().date()
    row = AIBudgetDay.objects.filter(day=today).first()
    used = (row.settled_micros + row.reserved_micros) if row else 0
    return max(0, _allowance_today(today) - used)


def reserve(*, amount_micros: int, feature: str, model: str, visitor_id: int | None) -> Reservation:
    """Hold `amount_micros` against today and (for a guest) the visitor's allowance, or refuse.

    Statement order inside the transaction: the day-row upsert (INSERT ... ON CONFLICT DO NOTHING)
    first, then the visitor's User row, then the day-row UPDATE, then the reservation insert. The
    upsert can wait on, or newly hold, the day row, so a competing reserve waits there before it
    holds any User row. That keeps this deadlock-free against the lock order in the module
    docstring: `settle` only touches day rows that already exist and are committed, and takes its
    reservation and User rows before the day row, so no one holds a day row while waiting for a User.
    """
    if amount_micros < 0:
        raise ValueError("amount_micros must not be negative")
    if live_ai_off():
        raise BudgetRefused("off")
    now = utcnow()
    today = now.date()
    allowance = _allowance_today(today)
    visitor_cap = usd_to_micros(settings.AI_VISITOR_BUDGET_USD)
    with transaction.atomic(durable=True):  # an outer atomic block would hold these locks across a call
        AIBudgetDay.objects.bulk_create([AIBudgetDay(day=today)], ignore_conflicts=True)
        if visitor_id is not None:
            updated = User.objects.filter(
                pk=visitor_id, demo_ai_spent_micros__lt=visitor_cap
            ).update(demo_ai_spent_micros=F("demo_ai_spent_micros") + amount_micros)
            if updated == 0:
                raise BudgetRefused("visitor")
        updated = (
            AIBudgetDay.objects.filter(day=today)
            .filter(settled_micros__lte=allowance - amount_micros - F("reserved_micros"))
            .update(reserved_micros=F("reserved_micros") + amount_micros)
        )
        if updated == 0:
            raise BudgetRefused("daily")  # rolls back the visitor increment
        row = AIReservation.objects.create(
            day=today,
            amount_micros=amount_micros,
            visitor_id=visitor_id,
            feature=feature,
            model=model,
            created_at=now,
        )
    return Reservation(row.id, today, amount_micros, visitor_id)


def settle(reservation: Reservation, actual_micros: int, *, how: SettledHow) -> bool:
    """Replace the reservation with what the call cost. True if this call settled it, False if it
    was already settled (a second settle does nothing)."""
    if actual_micros < 0:
        raise ValueError("actual_micros must not be negative")
    with transaction.atomic(durable=True):
        updated = AIReservation.objects.filter(pk=reservation.id, settled_at__isnull=True).update(
            settled_at=utcnow(), actual_micros=actual_micros, settled_how=how
        )
        if updated == 0:
            return False
        if reservation.visitor_id is not None:
            User.objects.filter(pk=reservation.visitor_id).update(
                demo_ai_spent_micros=F("demo_ai_spent_micros") + (actual_micros - reservation.amount_micros)
            )
        AIBudgetDay.objects.filter(day=reservation.day).update(
            reserved_micros=F("reserved_micros") - reservation.amount_micros,
            settled_micros=F("settled_micros") + actual_micros,
        )
    return True


def sweep_stale(*, older_than: timedelta) -> int:
    """Charge every reservation still open after `older_than` at its full amount."""
    cutoff = utcnow() - older_than
    stale = AIReservation.objects.filter(settled_at__isnull=True, created_at__lt=cutoff)
    swept = 0
    for row in stale:
        if settle(
            Reservation(row.id, row.day, row.amount_micros, row.visitor_id),
            row.amount_micros,
            how="swept",
        ):
            swept += 1
    return swept


def prune_settled(*, older_than: timedelta) -> int:
    """Delete old settled reservations. The per-day totals are never touched."""
    cutoff = utcnow() - older_than
    deleted, _ = AIReservation.objects.filter(settled_at__isnull=False, created_at__lt=cutoff).delete()
    return deleted
