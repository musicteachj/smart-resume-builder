import pytest
from rest_framework.test import APIClient

from apps.ai.models import AIUsageLog
from apps.ai.service import AIServiceError

IMPROVE = "/api/ai/improve-bullet"
SUMMARY = "/api/ai/generate-summary"
TAILOR = "/api/ai/tailor-jd"
COVER_LETTER = "/api/ai/cover-letter"
ATS_CHECK = "/api/ai/ats-check"


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
def test_cover_letter_happy_path(auth_client, content):
    res = auth_client.post(
        COVER_LETTER, {"content": content, "job_description": "Senior PM role"}, format="json"
    )
    assert res.status_code == 200
    assert "Dear Hiring Manager" in res.json()["cover_letter"]
    assert AIUsageLog.objects.filter(feature="cover-letter", success=True).count() == 1


@pytest.mark.django_db
def test_ats_check_happy_path(auth_client, content):
    res = auth_client.post(ATS_CHECK, {"content": content}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["score"] == 78
    assert len(body["issues"]) == 2
    assert len(body["recommendations"]) == 2
    assert "ai_usage" in body
    assert AIUsageLog.objects.filter(feature="ats-check", success=True).count() == 1


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
def test_ai_error_is_masked_in_production(auth_client, monkeypatch, settings):
    settings.DEBUG = False

    def boom(text, role=""):
        raise AIServiceError("missing ANTHROPIC_API_KEY")

    monkeypatch.setattr("apps.ai.service.improve_bullet", boom)
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 502
    # The raw upstream string must not leak in production.
    assert "ANTHROPIC_API_KEY" not in res.json()["detail"]


@pytest.mark.django_db
def test_ai_error_is_verbose_in_debug(auth_client, monkeypatch, settings):
    settings.DEBUG = True

    def boom(text, role=""):
        raise AIServiceError("missing ANTHROPIC_API_KEY")

    monkeypatch.setattr("apps.ai.service.improve_bullet", boom)
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 502
    assert "ANTHROPIC_API_KEY" in res.json()["detail"]


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


@pytest.mark.django_db
def test_monthly_limit_returns_429_with_usage(auth_client, user, settings):
    settings.DEBUG = False
    settings.AI_MONTHLY_LIMIT = 3
    user.ai_calls_this_month = 3
    user.save(update_fields=["ai_calls_this_month"])
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 429
    body = res.json()
    assert body["scope"] == "monthly"
    assert body["ai_usage"]["calls_this_month"] == 3
    assert body["ai_usage"]["monthly_limit"] == 3
    user.refresh_from_db()
    assert user.ai_calls_this_month == 3  # a rejected call reserves nothing


@pytest.mark.django_db
def test_reserve_is_decided_by_the_database_not_a_stale_read(user, settings):
    # Two requests that both read the user at 1 call under a limit of 2 must not
    # both get through: the conditional UPDATE re-checks the stored count.
    from apps.accounts.models import User
    from apps.ai.usage import AIRateLimitError, reserve

    settings.DEBUG = False
    settings.AI_DAILY_LIMIT = 2
    user.ai_calls_today = 1
    user.save(update_fields=["ai_calls_today"])
    first = User.objects.get(pk=user.pk)
    second = User.objects.get(pk=user.pk)

    reserve(first)
    with pytest.raises(AIRateLimitError) as exc:
        reserve(second)
    assert exc.value.scope == "daily"
    user.refresh_from_db()
    assert user.ai_calls_today == 2
    assert second.ai_calls_today == 2  # refreshed for the 429's usage snapshot


@pytest.mark.django_db
def test_failure_refunds_the_reservation_in_production(auth_client, user, settings, monkeypatch):
    settings.DEBUG = False
    from django.utils import timezone

    user.ai_calls_today = 4
    user.ai_calls_this_month = 7
    user.last_ai_call_date = timezone.now().date()  # same (UTC) day, so no daily reset
    user.save(update_fields=["ai_calls_today", "ai_calls_this_month", "last_ai_call_date"])

    def boom(text, role=""):
        raise AIServiceError("upstream down")

    monkeypatch.setattr("apps.ai.service.improve_bullet", boom)
    assert auth_client.post(IMPROVE, {"text": "x"}, format="json").status_code == 502
    user.refresh_from_db()
    assert (user.ai_calls_today, user.ai_calls_this_month) == (4, 7)


@pytest.mark.django_db
def test_success_counts_once(auth_client, user, settings):
    settings.DEBUG = False
    res = auth_client.post(IMPROVE, {"text": "x"}, format="json")
    assert res.status_code == 200
    assert res.json()["ai_usage"]["calls_today"] == 1
    assert res.json()["ai_usage"]["calls_this_month"] == 1
    user.refresh_from_db()
    assert (user.ai_calls_today, user.ai_calls_this_month) == (1, 1)
    assert AIUsageLog.objects.filter(success=True).count() == 1


@pytest.mark.django_db
def test_unexpected_error_also_refunds_the_reservation(auth_client, user, settings, monkeypatch):
    # Bad model output or a bug in normalization raises something other than
    # AIServiceError; the user still shouldn't be charged for the failed call.
    from django.utils import timezone

    settings.DEBUG = False
    user.ai_calls_today = 4
    user.ai_calls_this_month = 7
    user.last_ai_call_date = timezone.now().date()
    user.save(update_fields=["ai_calls_today", "ai_calls_this_month", "last_ai_call_date"])

    def broken(text, role=""):
        raise TypeError("'int' object is not iterable")

    monkeypatch.setattr("apps.ai.service.improve_bullet", broken)
    no_raise = APIClient(raise_request_exception=False)
    no_raise.force_authenticate(user)
    assert no_raise.post(IMPROVE, {"text": "x"}, format="json").status_code == 500
    user.refresh_from_db()
    assert (user.ai_calls_today, user.ai_calls_this_month) == (4, 7)


@pytest.mark.django_db
def test_refund_skips_a_counter_reset_since_the_reservation(user, settings):
    # A call reserved before midnight that fails after a new day's reservation must
    # not come out of the new day's count.
    from datetime import timedelta

    from django.utils import timezone

    from apps.ai.usage import refund, reserve

    settings.DEBUG = False
    reservation = reserve(user)
    user.ai_calls_today = 1
    user.last_ai_call_date = reservation.day + timedelta(days=1)  # a new day's reservation
    user.save(update_fields=["ai_calls_today", "last_ai_call_date"])

    refund(user, reservation)
    user.refresh_from_db()
    assert user.ai_calls_today == 1  # untouched: it belongs to the new day
    assert user.ai_calls_this_month == 0  # same 30-day period, so refunded
    assert user.last_month_reset == reservation.month_reset
    assert timezone.now().date() <= user.last_ai_call_date


@pytest.mark.django_db
def test_refusal_is_a_clear_422_and_is_not_charged(auth_client, user, settings, monkeypatch, caplog):
    from django.utils import timezone

    from apps.ai.service import AIRefusedError

    settings.DEBUG = False
    user.ai_calls_today = 2
    user.ai_calls_this_month = 3
    user.last_ai_call_date = timezone.now().date()
    user.save(update_fields=["ai_calls_today", "ai_calls_this_month", "last_ai_call_date"])

    def refuse(text, role=""):
        raise AIRefusedError("cyber")

    monkeypatch.setattr("apps.ai.service.improve_bullet", refuse)
    with caplog.at_level("WARNING", logger="apps.ai.views"):
        res = auth_client.post(IMPROVE, {"text": "secret bullet text"}, format="json")

    assert res.status_code == 422
    assert "couldn't help with this" in res.json()["detail"]
    user.refresh_from_db()
    assert (user.ai_calls_today, user.ai_calls_this_month) == (2, 3)
    assert "category=cyber" in caplog.text
    assert "secret bullet text" not in caplog.text
