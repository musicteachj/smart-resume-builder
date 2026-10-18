"""Per-user write throttle on the résumé and cover-letter CRUD endpoints."""

import pytest
from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

from apps.resumes.models import Resume


@pytest.fixture
def writes_limited(monkeypatch):
    # Re-enable the "writes" scope (the suite disables throttling by default) and
    # reset the throttle cache so the count starts clean.
    monkeypatch.setattr(
        SimpleRateThrottle, "THROTTLE_RATES", {"auth": None, "ai-burst": None, "writes": "2/min"}
    )
    cache.clear()


@pytest.mark.django_db
def test_resume_writes_are_throttled_but_reads_are_not(auth_client, content, writes_limited):
    payload = {"title": "R", "template": "classic", "content": content}
    assert auth_client.post("/api/resumes/", payload, format="json").status_code == 201
    assert auth_client.post("/api/resumes/", payload, format="json").status_code == 201
    assert auth_client.post("/api/resumes/", payload, format="json").status_code == 429
    # Reads stay available after the write budget is spent.
    assert auth_client.get("/api/resumes/").status_code == 200


@pytest.mark.django_db
def test_write_budget_is_shared_across_resumes_and_cover_letters(
    auth_client, user, content, writes_limited
):
    resume = Resume.objects.create(user=user, title="PM résumé", content=content)
    assert auth_client.post(f"/api/resumes/{resume.id}/duplicate/").status_code == 201
    letter = {"resume": str(resume.id), "title": "Acme", "body": "Dear team", "job_description": ""}
    assert auth_client.post("/api/cover-letters/", letter, format="json").status_code == 201
    assert auth_client.post("/api/cover-letters/", letter, format="json").status_code == 429
    assert auth_client.get(f"/api/cover-letters/?resume={resume.id}").status_code == 200
