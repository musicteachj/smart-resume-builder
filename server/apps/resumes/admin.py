from django.contrib import admin

from .models import CoverLetter, Resume


@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "template", "updated_at")
    list_filter = ("template",)
    search_fields = ("title", "user__email")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(CoverLetter)
class CoverLetterAdmin(admin.ModelAdmin):
    list_display = ("title", "resume", "user", "updated_at")
    search_fields = ("title", "user__email")
    readonly_fields = ("id", "created_at", "updated_at")
