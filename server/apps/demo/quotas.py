"""Per-guest storage caps, so one guest can't fill the disk.

Guests only: accounts are never capped. The three limits are settings
(`DEMO_GUEST_MAX_RESUMES`, `DEMO_GUEST_MAX_CONTENT_BYTES`, `DEMO_GUEST_MAX_STORAGE_BYTES`).
"""

import json

from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.exceptions import APIException

STORAGE_COPY = (
    "This demo has reached its storage limit. Delete a resume or some saved versions to keep editing."
)
CONTENT_COPY = "This resume is larger than the demo allows. Remove some text to keep saving."


def resume_count_copy() -> str:
    return f"This demo can hold up to {settings.DEMO_GUEST_MAX_RESUMES} resumes. Delete one to make room."


class DemoLimitReached(APIException):
    """A guest hit one of the demo's caps. Body: `{"detail": <copy>, "code": "demo_limit"}`."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "demo_limit"

    def __init__(self, detail: str):
        self.detail = {"detail": detail, "code": "demo_limit"}


def guest_storage_bytes(user_id: int) -> int:
    """Bytes of résumé and version `content` plus cover letter text one user stores."""
    sql = """
        SELECT
          COALESCE((SELECT SUM(pg_column_size(content)) FROM resumes_resume WHERE user_id = %(u)s), 0)
        + COALESCE((SELECT SUM(pg_column_size(content)) FROM resumes_resumeversion WHERE user_id = %(u)s), 0)
        + COALESCE((SELECT SUM(pg_column_size(body) + pg_column_size(job_description))
                    FROM resumes_coverletter WHERE user_id = %(u)s), 0)
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, {"u": user_id})
        return int(cursor.fetchone()[0])


def check_guest_write(user, *, adding_resume: bool = False) -> None:
    """Refuse a write that a guest's caps don't allow. A no-op for accounts."""
    if not getattr(user, "is_guest", False):
        return
    if adding_resume:
        from apps.resumes.models import Resume

        if Resume.objects.filter(user=user).count() >= settings.DEMO_GUEST_MAX_RESUMES:
            raise DemoLimitReached(resume_count_copy())
    if guest_storage_bytes(user.pk) >= settings.DEMO_GUEST_MAX_STORAGE_BYTES:
        raise DemoLimitReached(STORAGE_COPY)


def content_too_large(value) -> bool:
    size = len(json.dumps(value, ensure_ascii=False, default=str).encode())
    return size > settings.DEMO_GUEST_MAX_CONTENT_BYTES
