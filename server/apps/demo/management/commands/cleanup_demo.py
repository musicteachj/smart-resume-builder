"""Hourly housekeeping for demo mode.

Deletes expired guest accounts (their résumés, versions, cover letters, and usage logs cascade),
charges abandoned AI reservations, drops expired refresh tokens, and prunes old settled
reservations. Prints one summary line. Errors propagate so a scheduled task fails loudly.
"""

from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.ai import ledger

SETTLED_RETENTION = timedelta(days=35)


class Command(BaseCommand):
    help = "Delete expired demo guests, sweep stale AI reservations, flush expired tokens, prune old reservations."

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="Expired guests deleted per query (default 100, minimum 1).",
        )

    def handle(self, *args, batch_size: int, **options):
        batch_size = max(1, batch_size)
        guests_deleted = self._delete_expired_guests(batch_size)
        swept = ledger.sweep_stale(older_than=timedelta(minutes=settings.AI_STALE_RESERVATION_MINUTES))
        call_command("flushexpiredtokens", stdout=StringIO(), stderr=StringIO())
        pruned = ledger.prune_settled(older_than=SETTLED_RETENTION)
        self.stdout.write(
            f"cleanup_demo: guests_deleted={guests_deleted} reservations_swept={swept} reservations_pruned={pruned}"
        )

    def _delete_expired_guests(self, batch_size: int) -> int:
        now = timezone.now()
        total = 0
        while True:
            pks = list(
                User.objects.filter(is_guest=True, guest_expires_at__lte=now)
                .order_by("pk")
                .values_list("pk", flat=True)[:batch_size]
            )
            if not pks:
                return total
            User.objects.filter(pk__in=pks, is_guest=True).delete()
            total += len(pks)
