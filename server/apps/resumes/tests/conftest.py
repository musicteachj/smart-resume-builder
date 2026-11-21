import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


def make_content(name="Maya Chen"):
    """A minimal valid resume content payload."""
    return {
        "personalInfo": {"name": name, "email": "maya@example.com"},
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
        "education": [
            {
                "id": "e1",
                "school": "CCA",
                "degree": "BFA",
                "field": "Interaction Design",
                "graduationDate": "2017-05",
            }
        ],
        "skills": ["Figma", "Design Systems"],
        "projects": [],
    }


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        email="rival@example.com", name="Rival", password="sup3rSecret!"
    )


@pytest.fixture
def content():
    return make_content()
