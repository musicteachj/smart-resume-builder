from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "name", "is_admin", "is_staff", "created_at")
    list_filter = ("is_admin", "is_staff", "is_superuser", "is_active")
    search_fields = ("email", "name")
    readonly_fields = ("created_at", "updated_at", "last_login", "date_joined")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "google_id")}),
        ("AI usage", {"fields": (
            "ai_calls_today", "ai_calls_this_month",
            "last_ai_call_date", "last_month_reset",
        )}),
        ("Permissions", {"fields": (
            "is_admin", "is_active", "is_staff", "is_superuser",
            "groups", "user_permissions",
        )}),
        ("Timestamps", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "name", "password1", "password2"),
        }),
    )
