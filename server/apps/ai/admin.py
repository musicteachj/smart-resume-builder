from django.contrib import admin

from .models import AIUsageLog


@admin.register(AIUsageLog)
class AIUsageLogAdmin(admin.ModelAdmin):
    list_display = ("feature", "user", "success", "input_length", "output_length", "created_at")
    list_filter = ("feature", "success")
    search_fields = ("user__email",)
    readonly_fields = ("user", "feature", "input_length", "output_length", "success", "created_at")
