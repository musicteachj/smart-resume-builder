from apps.demo.quotas import guest_storage_bytes
from apps.demo.sample import SAMPLE_CONTENT
from apps.resumes.models import CoverLetter, Resume, ResumeVersion

RESUME_BODY = {"title": "one more", "template": "classic", "content": SAMPLE_CONTENT}


def test_a_guest_can_hold_twenty_resumes(guest_client, guest, settings):
    for i in range(20):
        Resume.objects.create(user=guest, title=f"r{i}", content=SAMPLE_CONTENT)
    res = guest_client.post("/api/resumes/", RESUME_BODY, format="json")
    assert (res.status_code, res.json()["code"]) == (400, "demo_limit")
    assert res.json() == {
        "detail": "This demo can hold up to 20 resumes. Delete one to make room.",
        "code": "demo_limit",
    }
    first = Resume.objects.filter(user=guest).first()
    assert guest_client.post(f"/api/resumes/{first.pk}/duplicate/").status_code == 400
    assert Resume.objects.filter(user=guest).count() == 20


def test_the_resume_count_message_follows_the_setting(guest_client, guest, settings):
    settings.DEMO_GUEST_MAX_RESUMES = 2
    for i in range(2):
        Resume.objects.create(user=guest, title=f"r{i}", content=SAMPLE_CONTENT)
    res = guest_client.post("/api/resumes/", RESUME_BODY, format="json")
    assert res.json()["detail"] == "This demo can hold up to 2 resumes. Delete one to make room."


def test_accounts_have_no_guest_caps(auth_client, user, settings):
    settings.DEMO_GUEST_MAX_STORAGE_BYTES = 1
    settings.DEMO_GUEST_MAX_CONTENT_BYTES = 10
    for i in range(20):
        Resume.objects.create(user=user, title=f"r{i}", content=SAMPLE_CONTENT)
    res = auth_client.post("/api/resumes/", RESUME_BODY, format="json")
    assert res.status_code == 201


def test_oversized_content_is_refused_for_guests(guest_client, guest, settings):
    settings.DEMO_GUEST_MAX_CONTENT_BYTES = 1000
    # Valid per field, but together far past the 1000-byte cap.
    big = {**SAMPLE_CONTENT, "skills": [f"skill number {i}" for i in range(60)]}
    res = guest_client.post("/api/resumes/", {**RESUME_BODY, "content": big}, format="json")
    assert res.status_code == 400
    assert res.json() == {
        "content": ["This resume is larger than the demo allows. Remove some text to keep saving."]
    }
    assert not Resume.objects.filter(user=guest).exists()


def test_the_storage_budget_stops_updates_versions_and_letters(guest_client, guest, settings):
    resume = Resume.objects.create(user=guest, title="r", content=SAMPLE_CONTENT)
    settings.DEMO_GUEST_MAX_STORAGE_BYTES = 1
    expected = {
        "detail": "This demo has reached its storage limit. Delete a resume or some saved versions to keep editing.",
        "code": "demo_limit",
    }

    res = guest_client.patch(f"/api/resumes/{resume.pk}/", {"title": "new"}, format="json")
    assert (res.status_code, res.json()) == (400, expected)

    res = guest_client.post(
        "/api/resume-versions/", {"resume": str(resume.pk), "kind": "manual", "label": "v"}, format="json"
    )
    assert (res.status_code, res.json()) == (400, expected)

    res = guest_client.post(
        "/api/cover-letters/", {"resume": str(resume.pk), "title": "Letter", "body": "Dear team"}, format="json"
    )
    assert (res.status_code, res.json()) == (400, expected)

    resume.refresh_from_db()
    assert resume.title == "r"
    assert not ResumeVersion.objects.filter(resume=resume).exists()
    assert not CoverLetter.objects.filter(resume=resume).exists()


def test_storage_counts_resumes_versions_and_letters(guest):
    assert guest_storage_bytes(guest.pk) == 0
    resume = Resume.objects.create(user=guest, title="r", content=SAMPLE_CONTENT)
    after_resume = guest_storage_bytes(guest.pk)
    assert after_resume > 0
    ResumeVersion.objects.create(resume=resume, user=guest, kind="manual", content=SAMPLE_CONTENT)
    after_version = guest_storage_bytes(guest.pk)
    assert after_version > after_resume
    CoverLetter.objects.create(resume=resume, user=guest, title="L", body="Dear team " * 50, job_description="jd")
    assert guest_storage_bytes(guest.pk) > after_version


def test_restore_is_refused_for_a_guest_at_the_cap_but_not_an_account(guest_client, guest, auth_client, user, settings):
    resume = Resume.objects.create(user=guest, title="r", content=SAMPLE_CONTENT)
    version = ResumeVersion.objects.create(resume=resume, user=guest, kind="manual", title="r", template="classic", content=SAMPLE_CONTENT)
    settings.DEMO_GUEST_MAX_STORAGE_BYTES = 1
    res = guest_client.post(f"/api/resume-versions/{version.pk}/restore/")
    assert (res.status_code, res.json()["code"]) == (400, "demo_limit")
    assert ResumeVersion.objects.filter(resume=resume).count() == 1

    mine = Resume.objects.create(user=user, title="a", content=SAMPLE_CONTENT)
    saved = ResumeVersion.objects.create(resume=mine, user=user, kind="manual", title="a", template="classic", content=SAMPLE_CONTENT)
    assert auth_client.post(f"/api/resume-versions/{saved.pk}/restore/").status_code == 200


def test_cover_letter_edits_are_refused_at_the_storage_cap(guest_client, guest, settings):
    resume = Resume.objects.create(user=guest, title="r", content=SAMPLE_CONTENT)
    letter = CoverLetter.objects.create(resume=resume, user=guest, title="L", body="Dear team")
    settings.DEMO_GUEST_MAX_STORAGE_BYTES = 1
    res = guest_client.patch(f"/api/cover-letters/{letter.pk}/", {"body": "Changed"}, format="json")
    assert (res.status_code, res.json()["code"]) == (400, "demo_limit")
    letter.refresh_from_db()
    assert letter.body == "Dear team"
