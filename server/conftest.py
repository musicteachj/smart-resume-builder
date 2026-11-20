"""Project-wide pytest fixtures."""

from datetime import datetime, timedelta
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.fixture(autouse=True)
def _disable_throttling(monkeypatch):
    """Turn off the scoped rate throttles for the whole suite by default.

    DRF throttling is cache-backed, so counters accumulate across tests in a process
    and would cause spurious 429s. DRF binds `THROTTLE_RATES` as a class attribute at
    import time (so mutating settings + reloading api_settings does NOT change it) —
    patch the class attribute directly. Tests that exercise throttling override this
    with a real rate and clear the cache.
    """
    monkeypatch.setattr(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {
            "auth": None,
            "ai-burst": None,
            "writes": None,
            "password-reset": None,
            "demo-start-hour": None,
            "demo-start-day": None,
        },
    )


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        email="maya@example.com", name="Maya Chen", password="sup3rSecret!"
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_guest(email: str, expires: datetime | None):
    guest = get_user_model().objects.create_user(
        email=email, name="Demo guest", password=None
    )
    guest.is_guest = True
    guest.guest_expires_at = expires or timezone.now() + timedelta(hours=24)
    guest.save(update_fields=["is_guest", "guest_expires_at"])
    return guest


@pytest.fixture
def make_guest(db):
    """Factory for demo guests, each with a unique email."""

    def make(*, expires: datetime | None = None) -> "User":
        return _create_guest(f"guest-{uuid4().hex}@demo.invalid", expires)

    return make


@pytest.fixture
def guest(db):
    return _create_guest("guest-test@demo.invalid", None)


@pytest.fixture
def guest_client(guest):
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


@pytest.fixture
def at(monkeypatch):
    """Pin the ledger's clock: `at(moment)` sets what `apps.ai.ledger.utcnow` returns."""

    def set_now(moment: datetime) -> None:
        monkeypatch.setattr("apps.ai.ledger.utcnow", lambda: moment)

    return set_now
