from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AuthResponseSerializer,
    EmailTokenObtainPairSerializer,
    RegisterSerializer,
    TokenRefreshResponseSerializer,
    UserSerializer,
)


@extend_schema_view(
    post=extend_schema(
        operation_id="register",
        request=RegisterSerializer,
        responses={201: AuthResponseSerializer},
        tags=["auth"],
    )
)
class RegisterView(generics.CreateAPIView):
    """Create an account; return the user + access token, set the refresh cookie."""

    serializer_class = RegisterSerializer
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
class LoginView(TokenObtainPairView):
    """Obtain an access token via email + password; set the refresh cookie."""

    serializer_class = EmailTokenObtainPairSerializer
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
