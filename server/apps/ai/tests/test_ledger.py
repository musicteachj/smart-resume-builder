import threading
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from django.db import connection

from apps.ai import ledger
from apps.ai.ledger import BudgetRefused
from apps.ai.models import AIBudgetDay, AIReservation

pytestmark = pytest.mark.django_db
DAY = dict(feature="ats-check", model="claude-sonnet-5-5", visitor_id=None)


@pytest.mark.parametrize("today, spent_before, expected", [
    (date(2026, 11, 1), 0, 1_000_000),           # 3 x $10 / 30 days
    (date(2026, 11, 20), 9_000_000, 500_000),    # even share below the floor: floor
    (date(2026, 11, 30), 9_800_000, 200_000),    # never more than is left
    (date(2026, 11, 30), 10_500_000, 0),         # already over: nothing
    (date(2026, 12, 1), 0, 967_741),             # 31-day month, rounded down
])
def test_allowance_today_follows_the_pacing_formula(today, spent_before, expected):
    assert ledger.allowance_today_micros(budget=10_000_000, multiplier=Decimal(3), floor=500_000,
                                         spent_before_today=spent_before, today=today) == expected


def test_reserve_admits_up_to_the_allowance_and_no_further(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=999_999, **DAY)
    ledger.reserve(amount_micros=1, **DAY)
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1, **DAY)
    assert refused.value.scope == "daily"
    assert AIBudgetDay.objects.get(day=date(2026, 11, 1)).reserved_micros == 1_000_000


def test_budget_zero_is_off(at, settings):
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    assert ledger.live_ai_off()
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1, **DAY)
    assert refused.value.scope == "off"


def test_open_reservations_from_earlier_days_count_against_the_month(at):
    AIBudgetDay.objects.create(day=date(2026, 11, 19), settled_micros=8_000_000, reserved_micros=1_000_000)
    at(datetime(2026, 11, 20, 9, tzinfo=UTC))   # left $1.00 -> allowance is the $0.50 floor
    ledger.reserve(amount_micros=500_000, **DAY)
    with pytest.raises(BudgetRefused):
        ledger.reserve(amount_micros=1, **DAY)


def test_last_months_spend_does_not_count(at):
    AIBudgetDay.objects.create(day=date(2026, 10, 31), settled_micros=10_000_000)
    at(datetime(2026, 11, 1, 0, 5, tzinfo=UTC))
    ledger.reserve(amount_micros=1_000_000, **DAY)
    assert AIBudgetDay.objects.get(day=date(2026, 11, 1)).reserved_micros == 1_000_000


def test_settle_moves_the_reservation_to_its_actual_cost_once(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    r = ledger.reserve(amount_micros=300_000, **DAY)
    assert ledger.settle(r, 21_000, how="usage") is True
    assert ledger.settle(r, 21_000, how="usage") is False  # a second settle is a no-op
    day = AIBudgetDay.objects.get(day=r.day)
    assert (day.reserved_micros, day.settled_micros) == (0, 21_000)
    row = AIReservation.objects.get(pk=r.id)
    assert (row.actual_micros, row.settled_how) == (21_000, "usage")


def test_a_call_that_crosses_midnight_settles_on_its_reservation_day(at):  # Review Focus 2
    at(datetime(2026, 11, 30, 23, 59, 30, tzinfo=UTC))
    r = ledger.reserve(amount_micros=300_000, **DAY)
    at(datetime(2026, 12, 1, 0, 0, 40, tzinfo=UTC))
    ledger.settle(r, 21_000, how="usage")
    nov30 = AIBudgetDay.objects.get(day=date(2026, 11, 30))
    assert (nov30.reserved_micros, nov30.settled_micros) == (0, 21_000)
    ledger.reserve(amount_micros=967_741, **DAY)  # December's first day has its full allowance
    with pytest.raises(BudgetRefused):
        ledger.reserve(amount_micros=1, **DAY)


def test_visitor_allowance_admits_while_room_is_left(at, guest, settings):
    settings.AI_VISITOR_BUDGET_USD = Decimal("0.15")
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    first = ledger.reserve(amount_micros=345_000, feature="tailor-jd", model="claude-sonnet-5-5", visitor_id=guest.pk)
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1_200, feature="improve-bullet", model="claude-haiku-5-5", visitor_id=guest.pk)
    assert refused.value.scope == "visitor"
    ledger.settle(first, 31_000, how="usage")
    ledger.reserve(amount_micros=1_200, feature="improve-bullet", model="claude-haiku-5-5", visitor_id=guest.pk)
    guest.refresh_from_db()
    assert guest.demo_ai_spent_micros == 32_200


def test_a_daily_refusal_leaves_the_visitor_untouched(at, guest):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1_000_001, feature="tailor-jd", model="claude-sonnet-5-5", visitor_id=guest.pk)
    assert refused.value.scope == "daily"
    guest.refresh_from_db()
    assert guest.demo_ai_spent_micros == 0


def test_sweeper_charges_reservations_older_than_ten_minutes(at):
    at(datetime(2026, 11, 1, 12, 0, tzinfo=UTC)); old = ledger.reserve(amount_micros=300_000, **DAY)
    at(datetime(2026, 11, 1, 12, 5, tzinfo=UTC)); ledger.reserve(amount_micros=100_000, **DAY)
    at(datetime(2026, 11, 1, 12, 11, tzinfo=UTC))
    assert ledger.sweep_stale(older_than=timedelta(minutes=10)) == 1
    assert AIReservation.objects.get(pk=old.id).settled_how == "swept"
    day = AIBudgetDay.objects.get(day=date(2026, 11, 1))
    assert (day.settled_micros, day.reserved_micros) == (300_000, 100_000)


def test_prune_removes_only_old_settled_rows(at):
    at(datetime(2026, 9, 1, tzinfo=UTC)); kept_open = ledger.reserve(amount_micros=1, **DAY)
    settled = ledger.reserve(amount_micros=1, **DAY); ledger.settle(settled, 1, how="usage")
    at(datetime(2026, 11, 1, tzinfo=UTC))
    assert ledger.prune_settled(older_than=timedelta(days=35)) == 1
    assert AIReservation.objects.filter(pk=kept_open.id).exists()
    assert AIBudgetDay.objects.filter(day=date(2026, 9, 1)).exists()


def test_room_today(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=400_000, **DAY)
    assert ledger.room_today_micros() == 600_000


@pytest.mark.django_db(transaction=True)
def test_two_reservations_racing_for_the_last_room_admit_one(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=600_000, **DAY)
    barrier, results = threading.Barrier(2), []

    def worker():
        barrier.wait()
        try:
            ledger.reserve(amount_micros=300_000, **DAY); results.append("ok")
        except BudgetRefused:
            results.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert sorted(results) == ["ok", "refused"]


def test_negative_amounts_are_rejected(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    with pytest.raises(ValueError):
        ledger.reserve(amount_micros=-1, **DAY)
    r = ledger.reserve(amount_micros=1, **DAY)
    with pytest.raises(ValueError):
        ledger.settle(r, -1, how="usage")
