import pytest
from rest_framework.test import APIClient

from apps.ai.models import AIUsageLog
from apps.ai.service import AIServiceError

IMPROVE = "/api/ai/improve-bullet"
SUMMARY = "/api/ai/generate-summary"
TAILOR = "/api/ai/tailor-jd"


@pytest.mark.django_db
def test_requires_auth():
    assert APIClient().post(IMPROVE, {"text": "x"}, format="json").status_code == 401


@pytest.mark.django_db
def test_improve_bullet_happy_path(auth_client, user):
    res = auth_client.post(IMPROVE, {"text": "did some design work"}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["suggestion"].startswith("Improved:")
    assert body["ai_usage"]["calls_today"] == 1
    user.refresh_from_db()
    assert user.ai_calls_today == 1
    log = AIUsageLog.objects.get()
    assert log.feature == "improve-bullet" and log.success is True


@pytest.mark.django_db
def test_generate_summary_happy_path(auth_client, content):
    res = auth_client.post(SUMMARY, {"content": content}, format="json")
    assert res.status_code == 200
    assert res.json()["summary"]
    assert AIUsageLog.objects.filter(feature="generate-summary", success=True).count() == 1


@pytest.mark.django_db
def test_tailor_jd_happy_path(auth_client, content):
    res = auth_client.post(
        TAILOR, {"content": content, "job_description": "Senior PM, A/B testing, roadmapping"}, format="json"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["match_score"] == 82
    assert "A/B testing" in body["missing_keywords"]
    assert body["suggestions"][0]["bullet_id"] == "w1::0"
    assert "ai_usage" in body


@pytest.mark.django_db
def test_rate_limit_blocks_over_daily(auth_client, user, settings):
    settings.DEBUG = False
    settings.AI_DAILY_LIMIT = 2
    for _ in range(2):
        assert auth_client.post(IMPROVE, {"text": "x"}, format="json").status_code == 200
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 429
    assert res.json()["scope"] == "daily"


@pytest.mark.django_db
def test_admin_bypasses_limit(auth_client, user, settings):
    settings.DEBUG = False
    settings.AI_DAILY_LIMIT = 1
    user.is_admin = True
    user.save(update_fields=["is_admin"])
    for _ in range(3):
        assert auth_client.post(IMPROVE, {"text": "x"}, format="json").status_code == 200


@pytest.mark.django_db
def test_debug_bypasses_limit(auth_client, settings):
    settings.DEBUG = True
    settings.AI_DAILY_LIMIT = 1
    for _ in range(3):
        assert auth_client.post(IMPROVE, {"text": "x"}, format="json").status_code == 200


@pytest.mark.django_db
def test_failure_logs_and_does_not_consume(auth_client, user, monkeypatch):
    def boom(text, role=""):
        raise AIServiceError("upstream down")

    monkeypatch.setattr("apps.ai.service.improve_bullet", boom)
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 502
    user.refresh_from_db()
    assert user.ai_calls_today == 0  # failed call doesn't consume quota
    assert AIUsageLog.objects.filter(feature="improve-bullet", success=False).count() == 1


@pytest.mark.django_db
def test_daily_counter_resets_on_new_day(auth_client, user):
    from datetime import date, timedelta

    user.ai_calls_today = 9
    user.last_ai_call_date = date.today() - timedelta(days=1)
    user.save(update_fields=["ai_calls_today", "last_ai_call_date"])
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.ai_calls_today == 1  # reset to 0, then this call incremented to 1
