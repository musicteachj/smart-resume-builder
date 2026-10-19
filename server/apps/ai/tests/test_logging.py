"""AI failures and server errors must reach the logs (CloudWatch reads stdout)."""

import logging

import pytest
from django.conf import settings

from apps.ai import service
from apps.ai.service import AIServiceError

IMPROVE = "/api/ai/improve-bullet"
SECRET_TEXT = "Led the confidential Project Falcon migration"


class FakeUpstreamError(Exception):
    status_code = 529
    request_id = "req_123"


def test_ai_failure_is_logged_without_user_content(auth_client, monkeypatch, caplog):
    def boom(text, role=""):
        try:
            raise FakeUpstreamError(f"overloaded while processing: {text}")
        except FakeUpstreamError as exc:
            raise AIServiceError(str(exc)) from exc

    monkeypatch.setattr(service, "improve_bullet", boom)
    with caplog.at_level(logging.WARNING, logger="apps.ai"):
        res = auth_client.post(IMPROVE, {"text": SECRET_TEXT}, format="json")

    assert res.status_code == 502
    logged = "\n".join(r.getMessage() for r in caplog.records if r.name.startswith("apps.ai"))
    assert "improve-bullet" in logged
    assert "FakeUpstreamError" in logged
    assert "529" in logged and "req_123" in logged
    assert "Project Falcon" not in logged  # never log résumé text or prompts


def test_logging_sends_errors_to_the_console():
    handlers = settings.LOGGING["handlers"]
    assert handlers["console"]["class"] == "logging.StreamHandler"
    assert "console" in settings.LOGGING["loggers"]["django"]["handlers"]
    assert settings.LOGGING["loggers"]["django.request"]["level"] == "ERROR"
