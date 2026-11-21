from django.conf import settings
from django.http import Http404


class ClosedInDemoModeMixin:
    """Answer 404 in demo mode, before authentication, permissions, and throttles run."""

    def initial(self, request, *args, **kwargs):
        if settings.DEMO_MODE:
            # Rendering the 404 can still read `request.user` (Swagger UI's HTML renderer runs the auth
            # context processor), which would run JWT authentication late and turn a malformed Bearer
            # into a 500. With no authenticators the request is simply anonymous.
            request.authenticators = ()
            raise Http404
        super().initial(request, *args, **kwargs)
