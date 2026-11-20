from rest_framework import serializers

from apps.accounts.serializers import UserSerializer


class DemoStatusSerializer(serializers.Serializer):
    demo_mode = serializers.BooleanField()
    turnstile_site_key = serializers.CharField(allow_blank=True)
    ai_available = serializers.BooleanField()
    ai_reason = serializers.ChoiceField(choices=["ok", "off", "daily_used"])
    guest_start_available = serializers.BooleanField()


class GuestStartRequestSerializer(serializers.Serializer):
    turnstile_token = serializers.CharField(max_length=2048)


class GuestStartResponseSerializer(serializers.Serializer):
    user = UserSerializer()
    access = serializers.CharField()
    resume_id = serializers.UUIDField()
