from django.contrib import admin

from .models import CoverLetter, Resume, ResumeVersion


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


@admin.register(ResumeVersion)
class ResumeVersionAdmin(admin.ModelAdmin):
    list_display = ("resume", "kind", "label", "user", "created_at")
    list_filter = ("kind",)
    search_fields = ("label", "title", "user__email")
    # Snapshots are immutable apart from their label (see apps.resumes.versions).
    readonly_fields = (
        "id", "resume", "user", "kind", "title", "template", "document_font",
        "section_order", "content", "created_at",
    )
