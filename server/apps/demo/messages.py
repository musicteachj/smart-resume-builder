"""Plain refusal copy for starting a guest demo. Each carries a stable `code` for the client."""

from rest_framework.response import Response

_SCREENSHOTS = "The screenshots on this page show what the app does."

START_REFUSALS: dict[str, tuple[int, str]] = {
    "bot_check_failed": (403, "We couldn't confirm you're a person. Please try the check again."),
    "bot_check_unavailable": (
        503,
        f"The bot check isn't available right now, so new demos can't start. {_SCREENSHOTS}",
    ),
    "demo_full": (
        503,
        f"The demo is full right now. {_SCREENSHOTS} Please check back later.",
    ),
    "demo_rate_limited": (
        429,
        f"A lot of demos have started from your network recently. Please try again later. {_SCREENSHOTS}",
    ),
}


def start_refusal(code: str, *, headers: dict | None = None) -> Response:
    status_code, copy = START_REFUSALS[code]
    return Response({"detail": copy, "code": code}, status=status_code, headers=headers)
