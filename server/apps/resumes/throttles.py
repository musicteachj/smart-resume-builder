from rest_framework.permissions import SAFE_METHODS
from rest_framework.throttling import UserRateThrottle


class WriteRateThrottle(UserRateThrottle):
    """Per-user cap on create/update/delete (incl. duplicate). Reads are never
    throttled, so loading the dashboard or editor can't trip it."""

    scope = "writes"

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)
