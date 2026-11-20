from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from drf_spectacular.utils import extend_schema_field
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
            "is_guest",
            "created_at",
            "ai_usage",
        ]
        read_only_fields = fields

    @extend_schema_field(AIUsageSerializer)
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
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["name", "email", "password"]

    def validate_password(self, value):
        # Field-level, so strength errors arrive together with email errors. The candidate
        # user lets the similarity check compare against the submitted email and name.
        candidate = User(
            email=self.initial_data.get("email", ""), name=self.initial_data.get("name", "")
        )
        try:
            password_validation.validate_password(value, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        email = validated_data["email"].lower()
        user = User.objects.create_user(
            email=email,
            name=validated_data["name"],
            password=validated_data["password"],
        )
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """The uid + token from the emailed link, and the new password. The view checks the
    link first, then validates the password against that user (so similarity counts)."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})


def user_from_reset_link(uid: str, token: str, *, for_update: bool = False):
    """The active user a reset link belongs to, or None if the link is bad, used, or expired.
    `for_update` locks the user row (call inside a transaction)."""
    users = User.objects.select_for_update() if for_update else User.objects
    try:
        user = users.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (TypeError, ValueError, OverflowError, DjangoValidationError, User.DoesNotExist):
        return None
    return user if default_token_generator.check_token(user, token) else None


class DeleteAccountSerializer(serializers.Serializer):
    """A real account must confirm with its password; a demo guest has none, so it needs nothing."""

    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        allow_null=True,
        style={"input_type": "password"},
    )

    def validate(self, attrs):
        user = self.context["request"].user
        if user.is_guest:
            return attrs
        password = attrs.get("password")
        if not password:  # Missing, null, or blank all count as missing.
            raise serializers.ValidationError({"password": "This field is required."})
        if not user.check_password(password):
            raise serializers.ValidationError({"password": "Incorrect password."})
        return attrs


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Login via email/password; returns the user alongside the token pair."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


# --- Response shapes (for OpenAPI / Orval; not used for input validation) ---


class AuthResponseSerializer(serializers.Serializer):
    """Returned by register and login: the user plus a short-lived access token.
    The refresh token is set as an httpOnly cookie, not returned in the body."""

    user = UserSerializer(read_only=True)
    access = serializers.CharField(read_only=True)


class TokenRefreshResponseSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)


class DetailResponseSerializer(serializers.Serializer):
    """A plain `{"detail": "..."}` message."""

    detail = serializers.CharField(read_only=True)
