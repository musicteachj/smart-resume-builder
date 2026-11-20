"""Cloudflare Turnstile verification for the guest start.

Fail closed on every path: anything that is not a clean, matching success from Cloudflare is
FAILED (the visitor can retry) or UNAVAILABLE (our side or Cloudflare's is broken, nobody can
start). Neither the token, the secret, nor the visitor's IP is ever logged.

Modeled on open-door's sandbox/turnstile.py, with stdlib `urllib` instead of httpx.
"""

import http.client
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from enum import StrEnum
from typing import Final
from uuid import uuid4

from django.conf import settings

logger = logging.getLogger(__name__)

ACTION: Final = "start-demo"
SITEVERIFY_URL: Final = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_SECONDS: Final = 5
_MAX_REPLY_BYTES: Final = 64 * 1024

# Cloudflare's published test keys, re-read 2026-11-20 at
# https://developers.cloudflare.com/turnstile/troubleshooting/testing/ (page modified 2026-11-05).
# Site keys: 1x...AA always passes (visible), 2x...AB always fails, 1x...BB and 2x...BB are the
# invisible pass and fail, 3x...FF forces an interactive challenge. Secrets: 1x...AA passes only
# the dummy token below, 2x...AA always fails, 3x...AA answers `timeout-or-duplicate`.
DUMMY_TOKEN: Final = "XXXX.DUMMY.TOKEN.XXXX"  # noqa: S105  # A public test value.
TEST_SITE_KEYS: Final = frozenset(
    {
        "1x00000000000000000000AA",
        "2x00000000000000000000AB",
        "1x00000000000000000000BB",
        "2x00000000000000000000BB",
        "3x00000000000000000000FF",
    }
)
PASS_SECRET: Final = "1x0000000000000000000000000000000AA"  # noqa: S105
TEST_SECRETS: Final = frozenset(
    {PASS_SECRET, "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"}
)

# Codes that say our own secret or request is wrong, not that the visitor is a bot.
_MISCONFIGURED_CODES: Final = frozenset({"invalid-input-secret", "missing-input-secret", "bad-request"})
_INTERNAL_ERROR: Final = "internal-error"


class Verdict(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    UNAVAILABLE = "unavailable"


def _expected_hostnames() -> set[str]:
    """The concrete hosts this site answers to; a wildcard says nothing about which one was used."""
    return {host for host in settings.ALLOWED_HOSTS if host != "*" and not host.startswith(".")}


def verify(token: str, remote_ip: str | None) -> Verdict:
    secret = settings.TURNSTILE_SECRET_KEY
    if not secret:
        logger.error("Turnstile secret is not configured; guest demos cannot start.")
        return Verdict.UNAVAILABLE
    if not token:
        return Verdict.FAILED
    if secret in TEST_SECRETS:
        # A test secret reports hostname example.com and no action, so it cannot pass the checks
        # below; answer it locally. Only the pass secret accepts anything, and only the dummy token.
        return Verdict.PASSED if secret == PASS_SECRET and token == DUMMY_TOKEN else Verdict.FAILED

    form = {"secret": secret, "response": token, "idempotency_key": str(uuid4())}
    if remote_ip:
        form["remoteip"] = remote_ip
    request = urllib.request.Request(  # noqa: S310  # A fixed https URL.
        SITEVERIFY_URL,
        data=urllib.parse.urlencode(form).encode(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:  # noqa: S310
            body = json.loads(reply.read(_MAX_REPLY_BYTES))
    except (OSError, ValueError, http.client.HTTPException) as error:
        # OSError covers timeouts, refused connections, and HTTP errors; ValueError, unreadable JSON;
        # HTTPException, a truncated or garbled reply.
        logger.warning("Turnstile siteverify failed: %s", type(error).__name__)
        return Verdict.UNAVAILABLE
    if not isinstance(body, dict):
        return Verdict.UNAVAILABLE

    raw_codes = body.get("error-codes")
    if isinstance(raw_codes, list):
        codes = [code for code in raw_codes if isinstance(code, str)]  # Unhashable items would raise.
        if _INTERNAL_ERROR in codes:
            return Verdict.UNAVAILABLE
        misconfigured = sorted(_MISCONFIGURED_CODES.intersection(codes))
        if misconfigured:
            logger.error(
                "Turnstile siteverify refused our request (%s): check TURNSTILE_SECRET_KEY",
                ", ".join(misconfigured),
            )
            return Verdict.UNAVAILABLE
    hostname = body.get("hostname")
    if (
        body.get("success") is True
        and isinstance(hostname, str)
        and hostname in _expected_hostnames()
        and body.get("action") == ACTION
    ):
        return Verdict.PASSED
    return Verdict.FAILED
