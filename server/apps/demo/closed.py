from django.conf import settings
from django.http import Http404


class ClosedInDemoModeMixin:
    """Answer 404 in demo mode, before authentication, permissions, and throttles run."""

    def initial(self, request, *args, **kwargs):
        if settings.DEMO_MODE:
            raise Http404
        super().initial(request, *args, **kwargs)
