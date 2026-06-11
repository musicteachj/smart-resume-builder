from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    AuthResponseSerializer,
    EmailTokenObtainPairSerializer,
    RegisterSerializer,
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
    """Create an account and return the user plus a JWT access/refresh pair."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=201,
        )


@extend_schema_view(
    post=extend_schema(
        operation_id="login",
        request=EmailTokenObtainPairSerializer,
        responses={200: AuthResponseSerializer},
        tags=["auth"],
    )
)
class LoginView(TokenObtainPairView):
    """Obtain a JWT pair via email + password; also returns the user."""

    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]


@extend_schema_view(get=extend_schema(operation_id="get_me", tags=["auth"]))
class MeView(generics.RetrieveAPIView):
    """Return the currently authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
