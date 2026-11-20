from datetime import UTC, datetime, timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from apps.accounts.models import User
from apps.ai import ledger
from apps.ai.models import AIBudgetDay, AIReservation
from apps.demo.sample import SAMPLE_CONTENT
from apps.resumes.models import Resume

DAY = {"feature": "improve-bullet", "model": "claude-haiku-5-5", "visitor_id": None}


def run(*args) -> str:
    out = StringIO()
    call_command("cleanup_demo", *args, stdout=out)
    return out.getvalue()


def expired(make_guest):
    return make_guest(expires=timezone.now() - timedelta(minutes=1))


def test_cleanup_removes_expired_guests_and_their_data(guest, user, make_guest):
    stale = expired(make_guest)
    Resume.objects.create(user=stale, title="x", content=SAMPLE_CONTENT)
    output = run()
    assert not User.objects.filter(pk=stale.pk).exists()
    assert not Resume.objects.filter(user_id=stale.pk).exists()
    assert User.objects.filter(pk__in=[guest.pk, user.pk]).count() == 2
    assert output.strip() == "cleanup_demo: guests_deleted=1 reservations_swept=0 reservations_pruned=0"


def test_cleanup_sweeps_stale_reservations(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=1000, **DAY)
    at(datetime(2026, 11, 1, 12, 11, tzinfo=UTC))
    assert run().strip() == "cleanup_demo: guests_deleted=0 reservations_swept=1 reservations_pruned=0"
    row = AIReservation.objects.get()
    assert row.settled_at is not None and row.settled_how == "swept"
    assert AIBudgetDay.objects.get().settled_micros == 1000


def test_cleanup_leaves_fresh_reservations_open(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=1000, **DAY)
    at(datetime(2026, 11, 1, 12, 9, tzinfo=UTC))
    assert "reservations_swept=0" in run()
    assert AIReservation.objects.get().settled_at is None


def test_cleanup_flushes_expired_refresh_tokens(user):
    now = timezone.now()
    old = OutstandingToken.objects.create(
        user=user, jti="old", token="t-old", created_at=now - timedelta(days=9), expires_at=now - timedelta(days=1)
    )
    live = OutstandingToken.objects.create(
        user=user, jti="live", token="t-live", created_at=now, expires_at=now + timedelta(days=1)
    )
    output = run()
    assert not OutstandingToken.objects.filter(pk=old.pk).exists()
    assert OutstandingToken.objects.filter(pk=live.pk).exists()
    assert len(output.strip().splitlines()) == 1


def test_cleanup_prunes_settled_reservations_after_35_days(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    r = ledger.reserve(amount_micros=1000, **DAY)
    ledger.settle(r, 400, how="completed")
    at(datetime(2026, 11, 1, 12, tzinfo=UTC) + timedelta(days=34))
    assert "reservations_pruned=0" in run()
    assert AIReservation.objects.count() == 1
    at(datetime(2026, 11, 1, 12, tzinfo=UTC) + timedelta(days=36))
    assert "reservations_pruned=1" in run()
    assert AIReservation.objects.count() == 0
    assert AIBudgetDay.objects.get().settled_micros == 400


def test_cleanup_works_in_batches(make_guest):
    for _ in range(5):
        expired(make_guest)
    assert "guests_deleted=5" in run("--batch-size", "2")
    assert not User.objects.filter(is_guest=True).exists()


def test_a_second_run_finds_nothing(make_guest):
    expired(make_guest)
    assert "guests_deleted=1" in run()
    assert run().strip() == "cleanup_demo: guests_deleted=0 reservations_swept=0 reservations_pruned=0"
