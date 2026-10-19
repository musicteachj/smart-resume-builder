"""Grant or revoke admin (unlimited AI calls) for an existing account.

Admin is deliberately not granted by email at register/login: emails aren't
verified, so whoever registered the admin's address first would get it.

    python manage.py set_admin you@example.com
    python manage.py set_admin you@example.com --revoke
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Grant (or with --revoke, remove) admin for an existing account."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--revoke", action="store_true", help="Remove admin instead of granting it.")

    def handle(self, *args, email, revoke, **options):
        User = get_user_model()
        try:
            user = User.objects.get(email=email.strip().lower())
        except User.DoesNotExist as exc:
            raise CommandError(f"No account with email {email!r}. Register it first.") from exc
        user.is_admin = not revoke
        user.save(update_fields=["is_admin"])
        self.stdout.write(f"{user.email}: is_admin={user.is_admin}")
