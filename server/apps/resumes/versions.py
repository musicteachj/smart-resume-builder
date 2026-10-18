"""Résumé version history: snapshot, automatic checkpoints, restore, retention.

Kept out of the views so the rules live in one place:
- Automatic checkpoints: before an update that changes the résumé, if the newest
  version is older than AUTO_INTERVAL (or there is none), snapshot the
  pre-update state. One checkpoint per editing session, not one per autosave.
- Retention: the newest AUTO_RETENTION non-manual versions are kept; saved
  (manual) versions are never pruned, but capped at MANUAL_LIMIT.
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Resume, ResumeVersion

AUTO_INTERVAL = timedelta(minutes=10)
AUTO_RETENTION = 30
MANUAL_LIMIT = 20

# The résumé fields a version captures and a restore puts back.
SNAPSHOT_FIELDS = ("title", "template", "document_font", "section_order", "content")


class ManualLimitReached(Exception):
    """Raised when saving another manual version would exceed MANUAL_LIMIT."""


def keep_newest(queryset, n: int, keep=(), order_by: str = "-created_at") -> None:
    """Delete everything in `queryset` past its newest `n` rows, never touching the
    pks in `keep`. Shared retention rule (cover letters use it too)."""
    extra = list(
        queryset.exclude(pk__in=keep).order_by(order_by).values_list("pk", flat=True)[n:]
    )
    if extra:
        queryset.model.objects.filter(pk__in=extra).delete()


def lock(resume_id) -> Resume:
    """Re-read a résumé with a row lock, serializing version writes and updates
    for it until the surrounding transaction ends."""
    return Resume.objects.select_for_update().get(pk=resume_id)


@transaction.atomic
def snapshot(resume: Resume, kind: str, label: str = "", keep=()) -> ResumeVersion:
    """Save the résumé's current (database) state as a version, then prune.
    `keep` protects versions from this prune (e.g. the one being restored)."""
    resume = lock(resume.pk)
    if kind == ResumeVersion.Kind.MANUAL:
        if resume.versions.filter(kind=ResumeVersion.Kind.MANUAL).count() >= MANUAL_LIMIT:
            raise ManualLimitReached
    version = ResumeVersion.objects.create(
        resume=resume,
        user_id=resume.user_id,
        kind=kind,
        label=label,
        **{f: getattr(resume, f) for f in SNAPSHOT_FIELDS},
    )
    if kind != ResumeVersion.Kind.MANUAL:  # manual saves never change what prune counts
        prune(resume, keep=keep)
    return version


def maybe_auto_snapshot(resume: Resume, validated_data: dict) -> ResumeVersion | None:
    """Checkpoint the pre-update state if this update changes the résumé and the
    newest version is older than AUTO_INTERVAL. Call inside the update's
    transaction, with `resume` from lock(), before saving the update."""
    changed = any(
        f in validated_data and validated_data[f] != getattr(resume, f) for f in SNAPSHOT_FIELDS
    )
    if not changed:
        return None
    latest = resume.versions.order_by("-created_at").values_list("created_at", flat=True).first()
    if latest and timezone.now() - latest < AUTO_INTERVAL:
        return None
    return snapshot(resume, ResumeVersion.Kind.AUTO)


@transaction.atomic
def restore(version: ResumeVersion) -> Resume:
    """Put a version's state back on its résumé, snapshotting the current state
    first so the restore itself can be undone."""
    resume = lock(version.resume_id)
    # No timestamp in the label: the client renders times in the user's timezone.
    label = f'Before restoring "{version.label}"' if version.label else "Before restoring an earlier version"
    # Keep the version being restored: the new snapshot may push it past retention.
    snapshot(resume, ResumeVersion.Kind.RESTORE, label=label[:100], keep=[version.pk])
    for f in SNAPSHOT_FIELDS:
        setattr(resume, f, getattr(version, f))
    resume.save()
    return resume


def prune(resume: Resume, keep=()) -> None:
    """Drop the oldest non-manual versions beyond AUTO_RETENTION."""
    keep_newest(resume.versions.exclude(kind=ResumeVersion.Kind.MANUAL), AUTO_RETENTION, keep=keep)
