"""Résumé version history: automatic checkpoints, saved versions, restore, retention."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.resumes import versions
from apps.resumes.models import Resume, ResumeVersion

from .conftest import make_content

LIST = "/api/resume-versions/"


@pytest.fixture
def resume(user, content):
    return Resume.objects.create(user=user, title="PM résumé", content=content)


def _resume_url(resume):
    return f"/api/resumes/{resume.id}/"


def _age_all_versions(resume, minutes=11):
    resume.versions.update(created_at=timezone.now() - timedelta(minutes=minutes))


def _content_with_summary(text):
    c = make_content()
    c["summary"] = text
    return c


# --- Automatic checkpoints -------------------------------------------------


@pytest.mark.django_db
def test_first_edit_checkpoints_the_pre_update_state(auth_client, resume):
    res = auth_client.patch(_resume_url(resume), {"content": _content_with_summary("New.")}, format="json")
    assert res.status_code == 200
    (version,) = resume.versions.all()
    assert version.kind == ResumeVersion.Kind.AUTO
    assert version.content["summary"] == "Senior product designer."  # the state before the edit


@pytest.mark.django_db
def test_no_second_checkpoint_within_the_interval(auth_client, resume):
    auth_client.patch(_resume_url(resume), {"content": _content_with_summary("One.")}, format="json")
    auth_client.patch(_resume_url(resume), {"content": _content_with_summary("Two.")}, format="json")
    assert resume.versions.count() == 1


@pytest.mark.django_db
def test_new_checkpoint_after_the_interval(auth_client, resume):
    auth_client.patch(_resume_url(resume), {"content": _content_with_summary("One.")}, format="json")
    _age_all_versions(resume)
    auth_client.patch(_resume_url(resume), {"content": _content_with_summary("Two.")}, format="json")
    assert resume.versions.count() == 2
    assert resume.versions.first().content["summary"] == "One."


@pytest.mark.django_db
def test_no_checkpoint_when_nothing_changes(auth_client, resume):
    res = auth_client.patch(_resume_url(resume), {"title": resume.title}, format="json")
    assert res.status_code == 200
    assert resume.versions.count() == 0


@pytest.mark.django_db
def test_automatic_versions_are_pruned_but_saved_ones_are_kept(resume):
    versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "Keep me")
    for _ in range(versions.AUTO_RETENTION + 5):
        versions.snapshot(resume, ResumeVersion.Kind.AUTO)
    assert resume.versions.exclude(kind="manual").count() == versions.AUTO_RETENTION
    assert resume.versions.filter(kind="manual", label="Keep me").exists()


# --- Saved versions (API) --------------------------------------------------


@pytest.mark.django_db
def test_requires_auth():
    assert APIClient().get(LIST).status_code == 401


@pytest.mark.django_db
def test_save_list_rename_delete(auth_client, resume):
    res = auth_client.post(LIST, {"resume": str(resume.id), "label": "Sent to Acme"}, format="json")
    assert res.status_code == 201
    vid = res.json()["id"]
    assert res.json()["kind"] == "manual"
    assert res.json()["content"]["personalInfo"]["name"] == "Maya Chen"

    listed = auth_client.get(f"{LIST}?resume={resume.id}").json()
    assert [v["label"] for v in listed] == ["Sent to Acme"]
    assert "content" not in listed[0]  # list stays light

    assert auth_client.patch(f"{LIST}{vid}/", {"label": "Acme v2"}, format="json").status_code == 200
    assert ResumeVersion.objects.get(id=vid).label == "Acme v2"
    assert auth_client.delete(f"{LIST}{vid}/").status_code == 204
    assert not ResumeVersion.objects.filter(id=vid).exists()


@pytest.mark.django_db
def test_patch_only_changes_the_label(auth_client, resume):
    v = versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "Before")
    auth_client.patch(f"{LIST}{v.id}/", {"label": "After", "title": "Hacked", "kind": "auto"}, format="json")
    v.refresh_from_db()
    assert (v.label, v.title, v.kind) == ("After", "PM résumé", "manual")


@pytest.mark.django_db
def test_ai_checkpoint_kind_is_allowed_but_server_kinds_are_not(auth_client, resume):
    ok = auth_client.post(LIST, {"resume": str(resume.id), "kind": "ai"}, format="json")
    assert ok.status_code == 201 and ok.json()["kind"] == "ai"
    for kind in ("auto", "restore"):
        assert auth_client.post(LIST, {"resume": str(resume.id), "kind": kind}, format="json").status_code == 400


@pytest.mark.django_db
def test_saved_version_limit(auth_client, resume):
    for i in range(versions.MANUAL_LIMIT):
        versions.snapshot(resume, ResumeVersion.Kind.MANUAL, f"v{i}")
    res = auth_client.post(LIST, {"resume": str(resume.id), "label": "One too many"}, format="json")
    assert res.status_code == 400
    assert "Delete one first" in str(res.json())


# --- Restore ---------------------------------------------------------------


@pytest.mark.django_db
def test_restore_puts_the_version_back_and_is_undoable(auth_client, resume):
    old = versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "Original")
    resume.title = "Edited title"
    resume.template = "modern"
    resume.content = _content_with_summary("Edited.")
    resume.save()

    res = auth_client.post(f"{LIST}{old.id}/restore/")
    assert res.status_code == 200
    assert res.json()["title"] == "PM résumé"
    assert res.json()["content"]["summary"] == "Senior product designer."
    resume.refresh_from_db()
    assert (resume.title, resume.template) == ("PM résumé", "classic")

    undo = resume.versions.get(kind="restore")
    assert undo.label == 'Before restoring "Original"'
    assert undo.content["summary"] == "Edited."


# --- Ownership isolation ---------------------------------------------------


@pytest.mark.django_db
def test_other_users_versions_are_invisible(auth_client, other_user):
    foreign = Resume.objects.create(user=other_user, title="Rob", content=make_content("Rob"))
    v = versions.snapshot(foreign, ResumeVersion.Kind.MANUAL, "secret")

    assert auth_client.get(f"{LIST}?resume={foreign.id}").json() == []
    assert auth_client.get(f"{LIST}{v.id}/").status_code == 404
    assert auth_client.patch(f"{LIST}{v.id}/", {"label": "hacked"}, format="json").status_code == 404
    assert auth_client.delete(f"{LIST}{v.id}/").status_code == 404
    assert auth_client.post(f"{LIST}{v.id}/restore/").status_code == 404
    assert auth_client.post(LIST, {"resume": str(foreign.id)}, format="json").status_code == 400


@pytest.mark.django_db
def test_versions_are_deleted_with_the_resume(resume):
    versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "x")
    resume.delete()
    assert ResumeVersion.objects.count() == 0


# --- Duplicate -------------------------------------------------------------


@pytest.mark.django_db
def test_duplicate_copies_font_and_order_but_not_history(auth_client, resume):
    resume.document_font = "garamond"
    resume.section_order = ["skills", "summary"]
    resume.save()
    versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "x")

    copy = auth_client.post(f"/api/resumes/{resume.id}/duplicate/").json()
    assert copy["document_font"] == "garamond"
    assert copy["section_order"] == ["skills", "summary"]
    assert ResumeVersion.objects.filter(resume_id=copy["id"]).count() == 0


# --- Throttle --------------------------------------------------------------


@pytest.mark.django_db
def test_version_writes_share_the_write_throttle(auth_client, resume, monkeypatch):
    monkeypatch.setattr(
        SimpleRateThrottle, "THROTTLE_RATES", {"auth": None, "ai-burst": None, "writes": "1/min"}
    )
    cache.clear()
    body = {"resume": str(resume.id)}
    assert auth_client.post(LIST, body, format="json").status_code == 201
    assert auth_client.post(LIST, body, format="json").status_code == 429
    assert auth_client.get(f"{LIST}?resume={resume.id}").status_code == 200


@pytest.mark.django_db
def test_no_checkpoint_for_an_unchanged_full_autosave_payload(auth_client, resume):
    # Autosave always sends every field; an unchanged résumé must not checkpoint.
    current = auth_client.get(_resume_url(resume)).json()
    payload = {k: current[k] for k in ("title", "template", "document_font", "section_order", "content")}
    assert auth_client.patch(_resume_url(resume), payload, format="json").status_code == 200
    assert resume.versions.count() == 0


# --- Review regressions ----------------------------------------------------


@pytest.mark.django_db
def test_restoring_the_oldest_version_at_the_retention_cap_keeps_it(auth_client, resume):
    for _ in range(versions.AUTO_RETENTION):
        versions.snapshot(resume, ResumeVersion.Kind.AUTO)
    oldest = resume.versions.order_by("created_at").first()
    assert auth_client.post(f"{LIST}{oldest.id}/restore/").status_code == 200
    assert ResumeVersion.objects.filter(pk=oldest.pk).exists()


@pytest.mark.django_db
def test_listing_requires_a_resume(auth_client, resume):
    versions.snapshot(resume, ResumeVersion.Kind.MANUAL, "x")
    res = auth_client.get(LIST)
    assert res.status_code == 400
    assert isinstance(res.json()["detail"], str)


@pytest.mark.django_db
def test_saved_version_limit_error_is_a_plain_detail_string(auth_client, resume):
    for i in range(versions.MANUAL_LIMIT):
        versions.snapshot(resume, ResumeVersion.Kind.MANUAL, f"v{i}")
    res = auth_client.post(LIST, {"resume": str(resume.id)}, format="json")
    assert res.json()["detail"].endswith("Delete one first.")


@pytest.mark.django_db
def test_foreign_and_missing_resumes_get_the_same_error(auth_client, other_user):
    foreign = Resume.objects.create(user=other_user, title="Rob", content=make_content("Rob"))
    missing = "00000000-0000-4000-8000-000000000000"
    a = auth_client.post(LIST, {"resume": str(foreign.id)}, format="json")
    b = auth_client.post(LIST, {"resume": missing}, format="json")
    assert a.status_code == b.status_code == 400
    assert a.json()["resume"][0].replace(str(foreign.id), "ID") == b.json()["resume"][0].replace(missing, "ID")
