import pytest
from rest_framework.test import APIClient

from apps.resumes.models import CoverLetter, Resume
from apps.resumes.serializers import CoverLetterSerializer

LIST = "/api/cover-letters/"


def _payload(resume):
    return {
        "resume": str(resume.id),
        "title": "Acme — PM",
        "body": "Dear team…",
        "job_description": "JD",
    }


@pytest.fixture
def resume(user):
    return Resume.objects.create(user=user, title="PM résumé", content={})


class _Req:
    def __init__(self, user):
        self.user = user


@pytest.mark.django_db
def test_cover_letter_belongs_to_resume_and_cascades(user, resume):
    cl = CoverLetter.objects.create(
        user=user, resume=resume, title="Acme — PM", body="Dear team…", job_description="JD"
    )
    assert cl.id is not None
    assert resume.cover_letters.count() == 1
    resume.delete()
    assert CoverLetter.objects.count() == 0  # cascade


@pytest.mark.django_db
def test_serializer_rejects_another_users_resume(other_user, resume):
    ser = CoverLetterSerializer(
        data={"resume": str(resume.id), "title": "X", "body": "hi", "job_description": ""},
        context={"request": _Req(other_user)},
    )
    assert not ser.is_valid()
    assert "resume" in ser.errors


@pytest.mark.django_db
def test_serializer_caps_body_length(user, resume):
    ser = CoverLetterSerializer(
        data={"resume": str(resume.id), "title": "X", "body": "a" * 8001, "job_description": ""},
        context={"request": _Req(user)},
    )
    assert not ser.is_valid()
    assert "body" in ser.errors


@pytest.mark.django_db
def test_requires_auth():
    assert APIClient().get(LIST).status_code == 401


@pytest.mark.django_db
def test_create_and_list_scoped_to_resume(auth_client, resume, user):
    other_resume = Resume.objects.create(user=user, title="Other", content={})
    assert auth_client.post(LIST, _payload(resume), format="json").status_code == 201
    assert auth_client.post(LIST, _payload(other_resume), format="json").status_code == 201
    res = auth_client.get(f"{LIST}?resume={resume.id}")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1 and body[0]["title"] == "Acme — PM"


@pytest.mark.django_db
def test_cannot_attach_to_foreign_resume(auth_client, other_user):
    foreign = Resume.objects.create(user=other_user, title="Rob", content={})
    assert auth_client.post(LIST, _payload(foreign), format="json").status_code == 400


@pytest.mark.django_db
def test_ownership_isolation_on_detail(auth_client, other_user):
    foreign = Resume.objects.create(user=other_user, title="Rob", content={})
    cl = CoverLetter.objects.create(
        user=other_user, resume=foreign, title="secret", body="x", job_description=""
    )
    assert auth_client.get(f"{LIST}{cl.id}/").status_code == 404
    assert auth_client.patch(f"{LIST}{cl.id}/", {"title": "hacked"}, format="json").status_code == 404
    assert auth_client.delete(f"{LIST}{cl.id}/").status_code == 404


@pytest.mark.django_db
def test_patch_and_delete(auth_client, resume):
    cid = auth_client.post(LIST, _payload(resume), format="json").json()["id"]
    assert auth_client.patch(f"{LIST}{cid}/", {"body": "Revised."}, format="json").status_code == 200
    assert CoverLetter.objects.get(id=cid).body == "Revised."
    assert auth_client.delete(f"{LIST}{cid}/").status_code == 204
    assert CoverLetter.objects.filter(id=cid).count() == 0


@pytest.mark.django_db
def test_retention_cap_prunes_oldest(auth_client, resume):
    for _ in range(26):
        auth_client.post(LIST, _payload(resume), format="json")
    assert resume.cover_letters.count() == 25
