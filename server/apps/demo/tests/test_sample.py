import json

from apps.demo.sample import SAMPLE_CONTENT, SAMPLE_TITLE
from apps.resumes.serializers import ResumeContentSerializer


def test_the_sample_is_valid_resume_content():
    serializer = ResumeContentSerializer(data=SAMPLE_CONTENT)
    assert serializer.is_valid(), serializer.errors


def test_the_sample_has_no_em_dash():
    assert chr(0x2014) not in json.dumps(SAMPLE_CONTENT, ensure_ascii=False)
    assert chr(0x2014) not in SAMPLE_TITLE


def test_the_sample_uses_reserved_fictional_contact_details():
    info = SAMPLE_CONTENT["personalInfo"]
    assert info["email"].endswith("@example.com")
    assert info["phone"].startswith("555-01")
    assert all(info[key] for key in ("name", "headline", "location", "linkedin", "github", "website"))


def test_the_sample_is_full_enough_to_show_every_section():
    assert SAMPLE_TITLE == "Sample resume: Riley Chen"
    assert SAMPLE_CONTENT["summary"]
    jobs = SAMPLE_CONTENT["workExperience"]
    assert len(jobs) == 3 and all(3 <= len(job["bullets"]) <= 4 for job in jobs)
    assert len(SAMPLE_CONTENT["education"]) == 1
    assert 8 <= len(SAMPLE_CONTENT["skills"]) <= 12
    assert len(SAMPLE_CONTENT["projects"]) == 2
