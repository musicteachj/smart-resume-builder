from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """Email-as-login user with AI-usage tracking for cost protection."""

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)
    google_id = models.CharField(max_length=255, unique=True, null=True, blank=True)

    # App-level admin (unlimited AI calls). Distinct from is_staff/is_superuser,
    # which govern Django-admin access.
    is_admin = models.BooleanField(
        default=False, help_text="App-level admin: bypasses AI usage limits."
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # AI usage tracking (enforced in Phase 7)
    ai_calls_today = models.PositiveIntegerField(default=0)
    ai_calls_this_month = models.PositiveIntegerField(default=0)
    last_ai_call_date = models.DateField(null=True, blank=True)
    last_month_reset = models.DateTimeField(default=timezone.now)

    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["google_id"]),
        ]

    def __str__(self):
        return self.email
