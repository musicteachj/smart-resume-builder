import pytest
from rest_framework.test import APIClient

from apps.resumes.models import Resume

from .conftest import make_content

LIST = "/api/resumes/"


def detail(rid):
    return f"/api/resumes/{rid}/"


def duplicate_url(rid):
    return f"/api/resumes/{rid}/duplicate/"


@pytest.mark.django_db
def test_requires_auth():
    assert APIClient().get(LIST).status_code == 401


@pytest.mark.django_db
def test_create_and_list(auth_client, content):
    res = auth_client.post(
        LIST, {"title": "PM Resume", "template": "classic", "content": content}, format="json"
    )
    assert res.status_code == 201
    rid = res.json()["id"]
    assert res.json()["title"] == "PM Resume"

    listing = auth_client.get(LIST).json()
    assert len(listing) == 1
    assert listing[0]["id"] == rid


@pytest.mark.django_db
def test_create_assigns_owner(auth_client, user, content):
    res = auth_client.post(
        LIST, {"title": "R", "template": "classic", "content": content}, format="json"
    )
    assert Resume.objects.get(id=res.json()["id"]).user == user


@pytest.mark.django_db
def test_update_and_retrieve(auth_client, content):
    rid = auth_client.post(
        LIST, {"title": "Old", "template": "classic", "content": content}, format="json"
    ).json()["id"]
    res = auth_client.patch(detail(rid), {"title": "New"}, format="json")
    assert res.status_code == 200
    assert auth_client.get(detail(rid)).json()["title"] == "New"


@pytest.mark.django_db
def test_delete(auth_client, content):
    rid = auth_client.post(
        LIST, {"title": "Temp", "template": "classic", "content": content}, format="json"
    ).json()["id"]
    assert auth_client.delete(detail(rid)).status_code == 204
    assert not Resume.objects.filter(id=rid).exists()


@pytest.mark.django_db
def test_duplicate(auth_client, user, content):
    rid = auth_client.post(
        LIST, {"title": "Base", "template": "classic", "content": content}, format="json"
    ).json()["id"]
    res = auth_client.post(duplicate_url(rid), format="json")
    assert res.status_code == 201
    assert res.json()["title"] == "Base (Copy)"
    assert res.json()["id"] != rid
    assert Resume.objects.filter(user=user).count() == 2


@pytest.mark.django_db
def test_ownership_isolation(auth_client, other_user, content):
    """A user cannot see or touch another user's resume (404)."""
    others = Resume.objects.create(
        user=other_user, title="Secret", template="classic", content=content
    )
    assert auth_client.get(LIST).json() == []
    assert auth_client.get(detail(others.id)).status_code == 404
    assert auth_client.patch(detail(others.id), {"title": "Hacked"}, format="json").status_code == 404
    assert auth_client.delete(detail(others.id)).status_code == 404
    assert auth_client.post(duplicate_url(others.id), format="json").status_code == 404


@pytest.mark.django_db
def test_rejects_invalid_content(auth_client):
    bad = make_content()
    bad["personalInfo"]["email"] = "not-an-email"
    bad["workExperience"][0]["startDate"] = "2022"  # not YYYY-MM
    res = auth_client.post(
        LIST, {"title": "Bad", "template": "classic", "content": bad}, format="json"
    )
    assert res.status_code == 400
    assert "content" in res.json()


@pytest.mark.django_db
def test_rejects_missing_required_content(auth_client):
    res = auth_client.post(
        LIST, {"title": "Bad", "template": "classic", "content": {}}, format="json"
    )
    assert res.status_code == 400


@pytest.mark.django_db
def test_rejects_oversized_content_lists(auth_client):
    """Section list caps prevent unbounded content payloads."""
    huge = make_content()
    entry = huge["workExperience"][0]
    huge["workExperience"] = [{**entry, "id": f"w{i}"} for i in range(25)]  # cap 20
    res = auth_client.post(
        LIST, {"title": "Big", "template": "classic", "content": huge}, format="json"
    )
    assert res.status_code == 400
    assert "content" in res.json()
