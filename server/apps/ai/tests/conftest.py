import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


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
def user(db):
    return User.objects.create_user(
        email="maya@example.com", name="Maya Chen", password="sup3rSecret!"
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def content():
    return make_content()


@pytest.fixture(autouse=True)
def mock_claude(monkeypatch):
    """Stub the Claude service so tests never hit the network or need a key."""
    monkeypatch.setattr("apps.ai.service.improve_bullet", lambda text, role="": "Improved: " + text)
    monkeypatch.setattr("apps.ai.service.generate_summary", lambda content: "A crisp professional summary.")
    monkeypatch.setattr(
        "apps.ai.service.tailor_to_jd",
        lambda content, jd: {
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
