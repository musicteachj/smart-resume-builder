"""Project-wide pytest fixtures."""

import pytest
from rest_framework.throttling import SimpleRateThrottle


@pytest.fixture(autouse=True)
def _disable_throttling(monkeypatch):
    """Turn off the scoped rate throttles for the whole suite by default.

    DRF throttling is cache-backed, so counters accumulate across tests in a process
    and would cause spurious 429s. DRF binds `THROTTLE_RATES` as a class attribute at
    import time (so mutating settings + reloading api_settings does NOT change it) —
    patch the class attribute directly. Tests that exercise throttling override this
    with a real rate and clear the cache.
    """
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {"auth": None, "ai-burst": None})
