from django.contrib import admin

from .models import Resume


@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "template", "updated_at")
    list_filter = ("template",)
    search_fields = ("title", "user__email")
    readonly_fields = ("id", "created_at", "updated_at")
