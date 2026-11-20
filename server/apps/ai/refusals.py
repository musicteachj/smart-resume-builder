"""Plain, friendly refusals for every AI request that cannot be served.

Each one carries a stable `code` for the client and copy that points at what still works without live AI."""

from rest_framework.response import Response

_FREE_PATH = "You can still edit, switch templates, and export your resume as a PDF or Word file."
_DAILY_USED = f"Today's live AI budget for the demo is used up. {_FREE_PATH}"

REFUSALS: dict[str, tuple[int, str]] = {
    "ai_off": (503, f"Live AI is off in this demo right now. {_FREE_PATH}"),
    "ai_daily_used": (503, _DAILY_USED),
    "ai_provider_limit": (503, _DAILY_USED),
    "ai_visitor_used": (429, f"You've used this demo's live AI allowance. {_FREE_PATH}"),
    "ai_rate_limited": (
        429,
        f"That's a lot of AI requests in a short time. Please wait a few minutes. {_FREE_PATH}",
    ),
    "ai_unavailable": (502, f"The AI service isn't available right now. {_FREE_PATH}"),
}


def refusal(code: str, *, headers: dict | None = None, detail: str | None = None) -> Response:
    """`detail` overrides the copy (dev only, under DEBUG); the code and status stay the same."""
    status_code, copy = REFUSALS[code]
    return Response({"detail": detail or copy, "code": code}, status=status_code, headers=headers)
