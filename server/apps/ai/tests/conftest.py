import pytest

from .fakes import fake  # noqa: F401  (re-exported so every AI test module can use it)


def make_content():
    return {
        "personalInfo": {"name": "Maya Chen", "email": "maya@example.com"},
        "summary": "Senior product designer.",
        "workExperience": [
            {
                "id": "w1",
                "company": "Meridian",
                "position": "Senior Product Designer",
                "startDate": "2022-01",
                "endDate": None,
                "bullets": ["Led redesign of analytics workspace."],
            }
        ],
        "education": [],
        "skills": ["Figma"],
    }


@pytest.fixture
def content():
    return make_content()


@pytest.fixture(autouse=True)
def mock_claude(monkeypatch):
    """Stub the Claude service so tests never hit the network or need a key."""
    monkeypatch.setattr("apps.ai.service.improve_bullet", lambda text, role="", **_kw: "Improved: " + text)
    monkeypatch.setattr("apps.ai.service.generate_summary", lambda content, **_kw: "A crisp professional summary.")
    monkeypatch.setattr(
        "apps.ai.service.tailor_to_jd",
        lambda content, jd, **_kw: {
            "match_score": 82,
            "missing_keywords": ["Roadmapping", "A/B testing"],
            "suggestions": [
                {
                    "bullet_id": "w1::0",
                    "current": "Led redesign of analytics workspace.",
                    "suggested": "Led A/B-tested redesign of the analytics workspace, lifting engagement 34%.",
                    "adds": ["A/B testing"],
                }
            ],
        },
    )
    monkeypatch.setattr(
        "apps.ai.service.parse_resume",
        lambda text, **_kw: {
            "personalInfo": {"name": "Maya Chen", "email": "maya@example.com",
                             "headline": "", "phone": "", "location": "",
                             "linkedin": "", "github": "", "website": ""},
            "summary": "Senior product designer.",
            "workExperience": [{"id": "w-imported", "company": "Meridian", "position": "Senior Product Designer",
                                "location": "", "startDate": "2022-01", "endDate": "", "bullets": ["Led redesign."]}],
            "education": [],
            "skills": ["Figma"],
            "projects": [],
        },
    )
    monkeypatch.setattr(
        "apps.ai.service.generate_cover_letter",
        lambda content, jd, **_kw: "Dear Hiring Manager,\n\nI am excited about this role.\n\nSincerely,\nMaya",
    )
    monkeypatch.setattr(
        "apps.ai.service.ats_health_check",
        lambda content, **_kw: {
            "score": 78,
            "issues": ["Summary is generic.", "Few quantified results."],
            "recommendations": ["Add metrics to bullets.", "Sharpen the summary."],
        },
    )
