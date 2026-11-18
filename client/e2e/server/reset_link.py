"""Print the password-reset link fragment (uid=...&token=...) for an email, built the same
way the reset email builds it. Lets the e2e suite follow a real reset link without scraping
the console email backend's output.

Usage: python reset_link.py <email>   (run with DJANGO_SETTINGS_MODULE=e2e_settings)
"""

import sys

import django

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.tokens import default_token_generator  # noqa: E402
from django.utils.encoding import force_bytes  # noqa: E402
from django.utils.http import urlsafe_base64_encode  # noqa: E402

user = get_user_model().objects.get(email=sys.argv[1].lower())
uid = urlsafe_base64_encode(force_bytes(user.pk))
print(f"uid={uid}&token={default_token_generator.make_token(user)}")
