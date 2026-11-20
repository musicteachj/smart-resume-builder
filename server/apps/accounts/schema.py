"""OpenAPI extensions for the accounts app (imported in AccountsConfig.ready)."""

from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class GuestExpiryJWTScheme(SimpleJWTScheme):
    """Document GuestExpiryJWTAuthentication exactly like SimpleJWT's bearer scheme (`jwtAuth`)."""

    target_class = "apps.accounts.authentication.GuestExpiryJWTAuthentication"
