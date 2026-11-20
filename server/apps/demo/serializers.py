from rest_framework import serializers


class DemoStatusSerializer(serializers.Serializer):
    demo_mode = serializers.BooleanField()
    turnstile_site_key = serializers.CharField(allow_blank=True)
    ai_available = serializers.BooleanField()
    ai_reason = serializers.ChoiceField(choices=["ok", "off", "daily_used"])
    guest_start_available = serializers.BooleanField()
