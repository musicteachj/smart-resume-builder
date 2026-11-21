"""Mark a demo guest as expired and run the hourly cleanup, as the scheduled task would.

Usage: python expire_guests.py <resume-id>  (the guest who owns that resume)
       python expire_guests.py              (every guest)
Needs the e2e Django environment (DJANGO_SETTINGS_MODULE=e2e_settings).

Specs run in parallel against one database, so they pass their own résumé id: expiring every
guest would end the demos other specs are in the middle of.
"""

import sys

import django
from django.core.management import call_command
from django.utils import timezone

django.setup()

from apps.accounts.models import User  # noqa: E402

guests = User.objects.filter(is_guest=True)
if len(sys.argv) > 1:
    guests = guests.filter(resumes__id=sys.argv[1])
guests.update(guest_expires_at=timezone.now())
call_command("cleanup_demo")
