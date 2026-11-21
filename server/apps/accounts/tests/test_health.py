from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from django.db import InterfaceError, OperationalError
from django.urls import Resolver404, resolve


@pytest.mark.django_db
@pytest.mark.parametrize("host", ["10.0.1.23:8000", "resumeiq.jameslittlefield.net"])
def test_readiness_answers_on_any_host(client, settings, host):
    settings.DEBUG = False
    settings.ALLOWED_HOSTS = ["resumeiq.jameslittlefield.net"]
    res = client.get("/health/ready", HTTP_HOST=host)
    assert (res.status_code, res.json()) == (200, {"status": "ready"})


@pytest.mark.django_db
def test_readiness_is_503_when_the_database_is_down(client, monkeypatch):
    monkeypatch.setattr(
        "config.middleware.connection",
        SimpleNamespace(cursor=Mock(side_effect=OperationalError("down"))),
    )
    res = client.get("/health/ready")
    assert (res.status_code, res.json()) == (503, {"status": "unavailable"})
    assert client.get("/health").status_code == 200  # liveness never touches the database


@pytest.mark.django_db
def test_readiness_is_503_on_an_interface_error_too(client, monkeypatch):
    monkeypatch.setattr(
        "config.middleware.connection",
        SimpleNamespace(cursor=Mock(side_effect=InterfaceError("connection already closed"))),
    )
    assert client.get("/health/ready").status_code == 503


def test_no_health_path_falls_through_to_the_spa():
    with pytest.raises(Resolver404):
        resolve("/health/anything")


def test_database_connections_are_short_lived_and_fail_fast(settings):
    assert settings.DATABASES["default"]["CONN_MAX_AGE"] == 60
    assert settings.DATABASES["default"]["OPTIONS"]["connect_timeout"] == 5
