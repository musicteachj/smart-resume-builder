from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class AIUsageSerializer(serializers.Serializer):
    """Per-user AI usage snapshot (limits enforced in Phase 7)."""

    calls_today = serializers.IntegerField()
    calls_this_month = serializers.IntegerField()
    daily_limit = serializers.IntegerField()
    monthly_limit = serializers.IntegerField()
    is_admin = serializers.BooleanField()


class UserSerializer(serializers.ModelSerializer):
    ai_usage = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "is_admin",
            "created_at",
            "ai_usage",
        ]
        read_only_fields = fields

    def get_ai_usage(self, obj) -> dict:
        return {
            "calls_today": obj.ai_calls_today,
            "calls_this_month": obj.ai_calls_this_month,
            "daily_limit": settings.AI_DAILY_LIMIT,
            "monthly_limit": settings.AI_MONTHLY_LIMIT,
            "is_admin": obj.is_admin,
        }


class RegisterSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                lookup="iexact",
                message="A user with this email already exists.",
            )
        ]
    )
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = ["name", "email", "password"]

    def create(self, validated_data):
        email = validated_data["email"].lower()
        user = User.objects.create_user(
            email=email,
            name=validated_data["name"],
            password=validated_data["password"],
            is_admin=email in settings.ADMIN_EMAILS,
        )
        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login via email/password; returns the user alongside the token pair and
    keeps the admin flag in sync with ADMIN_EMAILS."""

    def validate(self, attrs):
        data = super().validate(attrs)
        should_be_admin = self.user.email.lower() in settings.ADMIN_EMAILS
        if should_be_admin != self.user.is_admin:
            self.user.is_admin = should_be_admin
            self.user.save(update_fields=["is_admin"])
        data["user"] = UserSerializer(self.user).data
        return data
