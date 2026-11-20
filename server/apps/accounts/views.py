import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlencode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.demo.closed import ClosedInDemoModeMixin

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AuthResponseSerializer,
    DeleteAccountSerializer,
    DetailResponseSerializer,
    EmailTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    TokenRefreshResponseSerializer,
    UserSerializer,
    user_from_reset_link,
)

logger = logging.getLogger(__name__)
User = get_user_model()

DUMMY_EMAIL_BACKEND = "django.core.mail.backends.dummy.EmailBackend"
RESET_REQUESTED = "If an account exists for that email, we sent a reset link."
INVALID_RESET_LINK = "This reset link is invalid or has expired."


def revoke_refresh_tokens(user):
    """Blacklist every unexpired refresh token issued to `user`, so none of their sessions
    can be refreshed. (Access tokens already issued live out their 15 minutes.)"""
    live = OutstandingToken.objects.filter(
        user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True
    )
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in live], ignore_conflicts=True
    )


@extend_schema_view(
    post=extend_schema(
        operation_id="register",
        request=RegisterSerializer,
        responses={201: AuthResponseSerializer},
        tags=["auth"],
    )
)
class RegisterView(ClosedInDemoModeMixin, generics.CreateAPIView):
    """Create an account; return the user + access token, set the refresh cookie."""

    serializer_class = RegisterSerializer
    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        response = Response(
            {"user": UserSerializer(user).data, "access": str(refresh.access_token)},
            status=201,
        )
        return set_refresh_cookie(response, str(refresh))


@extend_schema_view(
    post=extend_schema(
        operation_id="login",
        request=EmailTokenObtainPairSerializer,
        responses={200: AuthResponseSerializer},
        tags=["auth"],
    )
)
class LoginView(ClosedInDemoModeMixin, TokenObtainPairView):
    """Obtain an access token via email + password; set the refresh cookie."""

    serializer_class = EmailTokenObtainPairSerializer
    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)  # move out of body → cookie
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


@extend_schema_view(
    post=extend_schema(
        operation_id="refresh_token",
        request=None,
        responses=TokenRefreshResponseSerializer,
        tags=["auth"],
    )
)
class CookieTokenRefreshView(APIView):
    """Issue a new access token from the refresh cookie, rotating the cookie."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not token:
            return Response({"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        response = Response({"access": serializer.validated_data["access"]})
        # ROTATE_REFRESH_TOKENS puts the replacement token in validated_data;
        # the old one is already blacklisted (BLACKLIST_AFTER_ROTATION).
        rotated = serializer.validated_data.get("refresh")
        if rotated:
            set_refresh_cookie(response, rotated)
        return response


@extend_schema_view(
    post=extend_schema(operation_id="logout", request=None, responses={204: None}, tags=["auth"])
)
class LogoutView(APIView):
    """Blacklist the refresh token from the cookie, then clear the cookie."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass  # expired/garbage cookie — clearing it is all that's left to do
        return clear_refresh_cookie(Response(status=status.HTTP_204_NO_CONTENT))


@extend_schema_view(get=extend_schema(operation_id="get_me", tags=["auth"]))
class MeView(generics.RetrieveAPIView):
    """Return the currently authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


def _reset_link(user) -> str:
    """The SPA's reset page, carrying the base64 user id and a one-time token. They go in
    the URL fragment, which browsers never send to a server, so the token can't end up in
    access logs (gunicorn logs the request line) or in a Referer header. The host comes
    only from CLIENT_URL, never the request, so a forged Host header can't redirect it."""
    base = settings.CLIENT_URL.rstrip("/")
    query = urlencode(
        {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": default_token_generator.make_token(user),
        }
    )
    return f"{base}/reset-password#{query}"


def _reset_email_body(user, link: str) -> str:
    minutes = settings.PASSWORD_RESET_TIMEOUT // 60
    return (
        f"Hi {user.name},\n\n"
        "Someone asked to reset the password for your ResumeIQ account. To choose a new "
        f"password, open this link within {minutes} minutes:\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email. Your password won't change.\n\n"
        "ResumeIQ\n"
    )


def _send_reset_email(user):
    # Log without the link (a credential) or the address. Failures are swallowed so a
    # provider outage can't turn into a 500 that only known emails would get.
    if not settings.CLIENT_URL:
        logger.error("CLIENT_URL is not set; password reset email not sent.")
        return
    try:
        send_mail(
            subject="Reset your ResumeIQ password",
            message=_reset_email_body(user, _reset_link(user)),
            from_email=None,  # DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
        )
    except Exception:
        logger.warning("Password reset email could not be sent.", exc_info=True)


@extend_schema_view(
    post=extend_schema(
        operation_id="request_password_reset",
        request=PasswordResetRequestSerializer,
        responses={202: DetailResponseSerializer},
        tags=["auth"],
    )
)
class PasswordResetRequestView(ClosedInDemoModeMixin, APIView):
    """Email a password-reset link. Always answers the same way, so it can't reveal
    whether an email has an account."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password-reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if settings.EMAIL_BACKEND == DUMMY_EMAIL_BACKEND:
            # Never log the link itself: it is a credential.
            logger.warning(
                "Password reset requested, but EMAIL_BACKEND is the dummy backend: no email sent."
            )
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"], is_active=True
        ).first()
        if user is not None and user.has_usable_password():
            _send_reset_email(user)
        # Same answer whatever happened above, so the response never reveals an account.
        return Response({"detail": RESET_REQUESTED}, status=status.HTTP_202_ACCEPTED)


@extend_schema_view(
    post=extend_schema(
        operation_id="confirm_password_reset",
        request=PasswordResetConfirmSerializer,
        responses={204: None},
        tags=["auth"],
    )
)
class PasswordResetConfirmView(ClosedInDemoModeMixin, APIView):
    """Set a new password from an emailed reset link, then revoke every refresh token
    (other devices are signed out once their 15-minute access token expires)."""

    # Never authenticate: a stale Bearer would otherwise 401 before the view runs.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    # Its own bucket ("auth", 10/min): weak-password retries mustn't use up the
    # 5/hour reset-email budget.
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            # Lock the user row: two concurrent confirms with the same link can't both
            # pass check_token, since the second waits and then sees the new password hash
            # (the token is derived from it), so the link is single-use.
            user = user_from_reset_link(data["uid"], data["token"], for_update=True)
            if user is None:
                return Response(
                    {"detail": INVALID_RESET_LINK}, status=status.HTTP_400_BAD_REQUEST
                )
            try:
                validate_password(data["new_password"], user=user)
            except DjangoValidationError as exc:
                return Response(
                    {"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
                )
            user.set_password(data["new_password"])
            user.save(update_fields=["password", "updated_at"])
            revoke_refresh_tokens(user)
        return clear_refresh_cookie(Response(status=status.HTTP_204_NO_CONTENT))


@extend_schema_view(
    post=extend_schema(
        operation_id="delete_account",
        request=DeleteAccountSerializer,
        responses={204: None},
        tags=["auth"],
    )
)
class DeleteAccountView(APIView):
    """Permanently delete the signed-in user and everything they own (résumés, versions,
    cover letters, and AI usage logs all cascade). Requires the current password; a demo guest has none and needs nothing."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = DeleteAccountSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        with transaction.atomic():
            # Revoke before deleting: OutstandingToken.user is SET_NULL, so afterward
            # these rows could no longer be found by user.
            cookie_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
            if cookie_token:
                try:
                    RefreshToken(cookie_token).blacklist()
                except TokenError:
                    pass  # expired or garbage cookie: nothing to revoke
            revoke_refresh_tokens(user)
            user.delete()
        return clear_refresh_cookie(Response(status=status.HTTP_204_NO_CONTENT))
