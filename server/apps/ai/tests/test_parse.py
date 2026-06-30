from apps.ai.service import _normalize_parsed
from apps.resumes.serializers import ResumeContentSerializer


def test_normalized_content_always_passes_resume_serializer():
    raw = {
        "personalInfo": {"name": "Maya Chen", "email": "maya@example.com",
                         "linkedin": "linkedin.com/in/maya-chen"},
        "summary": "Designer.",
        "workExperience": [
            {"position": "PM", "company": "Acme", "startDate": "2019", "endDate": "Present",
             "bullets": ["Did things"]},
            {"position": "Eng", "startDate": "2022-1", "endDate": "2023-09"},
        ],
        "education": [{"school": "CCA", "degree": "BFA", "graduationDate": "2017"}],
        "skills": ["Figma"],
        "projects": [{"name": "Site", "url": "maya.dev", "technologies": ["React"]}],
    }
    out = _normalize_parsed(raw)
    serializer = ResumeContentSerializer(data=out)
    assert serializer.is_valid(), serializer.errors
    # year-only / "Present" → dropped; single-digit month → zero-padded; valid → kept
    assert out["workExperience"][0]["startDate"] == ""      # "2019" year-only dropped
    assert out["workExperience"][0]["endDate"] == ""        # "Present" dropped
    assert out["workExperience"][1]["startDate"] == "2022-01"  # zero-padded
    assert out["workExperience"][1]["endDate"] == "2023-09"    # already valid
    assert out["education"][0]["graduationDate"] == ""      # "2017" year-only dropped


def test_normalize_assigns_entry_ids_and_defaults():
    out = _normalize_parsed({
        "personalInfo": {"name": "Maya Chen"},
        "workExperience": [{"position": "PM", "bullets": ["Did things"]}],
    })
    assert out["personalInfo"]["name"] == "Maya Chen"
    assert out["summary"] == ""
    assert out["education"] == [] and out["projects"] == []
    assert out["skills"] == []
    w = out["workExperience"][0]
    assert w["id"] and len(w["id"]) >= 8          # uuid assigned
    assert w["position"] == "PM" and w["company"] == ""
    assert w["bullets"] == ["Did things"]


def test_normalize_cleans_email_and_urls():
    out = _normalize_parsed({
        "personalInfo": {
            "email": "not-an-email",
            "linkedin": "linkedin.com/in/maya",   # missing scheme
            "github": "garbage no-dot",            # not a url
            "website": "https://maya.dev",
        },
    })
    pi = out["personalInfo"]
    assert pi["email"] == ""                        # invalid dropped
    assert pi["linkedin"] == "https://linkedin.com/in/maya"   # scheme added
    assert pi["github"] == ""                       # unrecoverable dropped
    assert pi["website"] == "https://maya.dev"


import pytest
from rest_framework.test import APIClient

from apps.ai.models import AIUsageLog
from apps.ai import service

PARSE = "/api/ai/parse-resume"


@pytest.mark.django_db
def test_parse_requires_auth():
    assert APIClient().post(PARSE, {"text": "x"}, format="json").status_code == 401


@pytest.mark.django_db
def test_parse_happy_path(auth_client):
    res = auth_client.post(PARSE, {"text": "Maya Chen\nSenior Product Designer"}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["content"]["personalInfo"]["name"] == "Maya Chen"
    assert body["content"]["workExperience"][0]["id"]
    assert body["ai_usage"]["calls_today"] == 1
    assert AIUsageLog.objects.filter(feature="parse-resume", success=True).count() == 1


@pytest.mark.django_db
def test_parse_blank_text_rejected(auth_client):
    assert auth_client.post(PARSE, {"text": ""}, format="json").status_code == 400


@pytest.mark.django_db
def test_parse_ai_down_returns_502(auth_client, monkeypatch):
    def boom(text):
        raise service.AIServiceError("AI is not configured (missing ANTHROPIC_API_KEY).")
    monkeypatch.setattr("apps.ai.service.parse_resume", boom)
    res = auth_client.post(PARSE, {"text": "some resume text"}, format="json")
    assert res.status_code == 502
    assert AIUsageLog.objects.filter(feature="parse-resume", success=False).count() == 1
