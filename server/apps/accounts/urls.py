from django.urls import path
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import TokenRefreshResponseSerializer
from .views import LoginView, MeView, RegisterView

# Give the refresh endpoint a clean operation_id + typed response for the client.
RefreshView = extend_schema_view(
    post=extend_schema(
        operation_id="refresh_token",
        responses={200: TokenRefreshResponseSerializer},
        tags=["auth"],
    )
)(TokenRefreshView)

urlpatterns = [
    path("register", RegisterView.as_view(), name="register"),
    path("login", LoginView.as_view(), name="login"),
    path("refresh", RefreshView.as_view(), name="token_refresh"),
    path("me", MeView.as_view(), name="me"),
]
