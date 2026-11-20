import pytest
from django.core.cache import cache
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import SimpleRateThrottle

from apps.demo.throttles import DemoStartHourThrottle
from apps.demo.turnstile import Verdict

START = "/api/demo/start"


def _key(xff):
    req = Request(APIRequestFactory().post(START, HTTP_X_FORWARDED_FOR=xff, REMOTE_ADDR="10.0.0.5"))
    return DemoStartHourThrottle().get_cache_key(req, None)


def test_a_forged_leftmost_forwarded_for_does_not_change_the_rate_limit_key():
    assert _key("6.6.6.6, 203.0.113.7") == _key("7.7.7.7, 8.8.8.8, 203.0.113.7") != _key("6.6.6.6, 203.0.113.8")


@pytest.mark.django_db
def test_rotating_the_forged_entry_does_not_dodge_the_start_limit(settings, monkeypatch):
    settings.DEMO_MODE = True
    settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    settings.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA"
    monkeypatch.setattr("apps.demo.views.turnstile.verify", lambda token, remote_ip: Verdict.PASSED)
    monkeypatch.setattr(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {"demo-start-hour": "3/hour", "demo-start-day": None, "auth": None, "ai-burst": None, "writes": None},
    )
    cache.clear()
    client = APIClient()
    statuses = [
        client.post(
            START,
            {"turnstile_token": "t"},
            format="json",
            HTTP_X_FORWARDED_FOR=f"{n}.{n}.{n}.{n}, 203.0.113.7",
        ).status_code
        for n in (1, 2, 3, 4)
    ]
    cache.clear()
    assert statuses == [201, 201, 201, 429]
