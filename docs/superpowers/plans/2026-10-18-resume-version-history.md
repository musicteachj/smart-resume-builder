# Résumé version history: implementation plan

Design: `docs/superpowers/specs/2026-10-18-resume-version-history-design.md`.

## PR 1: `feature-resume-history-api`
- [x] `ResumeVersion` model + migration `0005_resumeversion`, admin
- [x] `apps/resumes/versions.py` service (snapshot, automatic checkpoint, restore, prune)
- [x] `ResumeViewSet.perform_update` checkpoint hook; `duplicate` copies `document_font` + `section_order`
- [x] `ResumeVersionViewSet` at `/api/resume-versions/` + serializers + `ENUM_NAME_OVERRIDES`
- [x] `tests/test_versions.py`
- [x] `npm run gen:api` (regenerated client committed)

Details:

- **Model `ResumeVersion`** (migration `0005`): UUID pk; `resume` FK CASCADE (`related_name="versions"`);
  `user` FK CASCADE; `kind` (`auto|manual|restore|ai`); `label` (≤100, blank); snapshot fields `title`,
  `template`, `document_font`, `section_order`, `content`; `created_at`. Ordering `-created_at`, index on
  `(resume, -created_at)`.
- **Service `apps/resumes/versions.py`** (logic out of views, per conventions): `snapshot(resume, kind, label)`,
  `maybe_auto_snapshot(resume, validated_data)` (10-min rule; only if a snapshot field actually changes),
  `restore(version) -> Resume`, `prune(resume)`; constants `AUTO_INTERVAL`, `AUTO_RETENTION=30`, `MANUAL_LIMIT=20`.
- **Hook into `ResumeViewSet.perform_update`** (`views.py`): call `maybe_auto_snapshot` before `serializer.save()`.
- **Fix while here:** `ResumeViewSet.duplicate` drops `document_font` and `section_order`; copy them too
  (tailored copies currently lose the font and section order).
- **`ResumeVersionViewSet`** at `/api/resume-versions/`, mirroring `CoverLetterViewSet` (flat, user-scoped,
  `?resume=` filter, cross-user → 404, `WriteRateThrottle`, no PUT):
  - `GET ?resume=<id>` list (light serializer: no `content`); `GET /{id}/` full snapshot
  - `POST {resume, label?, kind?}` snapshot the résumé's **current DB state** (`kind` limited to `manual|ai`;
    résumé must be the user's, else 400 like cover letters)
  - `PATCH {label}`; `DELETE`
  - `POST /{id}/restore/` → returns the updated `Resume` (`ResumeSerializer`)
  - Explicit `operation_id`s: `list_resume_versions`, `get_resume_version`, `create_resume_version`,
    `patch_resume_version`, `delete_resume_version`, `restore_resume_version`; tag `resume-versions`.
- **Tests** (`apps/resumes/tests/test_versions.py`, fixtures from `tests/conftest.py`): auto snapshot on first
  edit, none within 10 min (backdate `created_at` via `.update()`), none for no-op PATCH; manual create/rename/
  delete; 21st manual → 400; auto pruning at 30; restore applies fields and creates a "restore" version;
  ownership isolation (list/get/restore/create on another user's résumé); duplicate copies font + order and
  no versions; write throttle covers the new endpoints.


## PR 2: `feature-resume-history-ui`
- [ ] `useAutosave` returns `{ status, flush }`
- [ ] `Modal` `size="xl"`; `VersionHistoryModal` + `versionLabel.ts` + tests
- [ ] History button in `EditorTopBar`; restore remount via `EditorPage` revision key
- [ ] Tailor "Apply to this résumé" flushes autosave, then creates an `ai` checkpoint (the server snapshots the
  database row, so unsaved keystrokes must be saved first)
- [ ] CHANGELOG, cut `0.14.0`, CLAUDE.md phase status

Details:

- `npm run gen:api` → hooks in `client/src/api/generated/resume-versions/` (CI's API-schema job enforces this).
- **`useAutosave`** (`features/editor/useAutosave.ts`): return `{ status, flush }`, where `flush()` cancels the
  debounce and awaits `saveNow` if pending (so a restore/snapshot never races unsaved edits). Update callers.
- **Restore flow:** modal calls `flush()` → `restore` mutation → `setQueryData(getGetResumeQueryKey(id), resume)`
  → `onRestored()`. `EditorPage` keys `EditorForm` by `${resume.id}:${revision}` and `onRestored` bumps
  `revision`, remounting the form with the restored values (pending is false after flush, so the unmount save
  doesn't fire). Invalidate the versions list after create/restore/rename/delete.
- **Manual save:** `flush()` first, then `create` with the name.
- **Tailor checkpoint** (`features/ai/TailorModal.tsx` `applyHere`): `await` creating a `kind="ai"` version for
  the résumé before applying; if it fails, still apply (don't block the user) but show nothing extra.
- New files: `features/editor/components/VersionHistoryModal.tsx` (+ `.test.tsx`), small `versionLabel.ts`
  helper (kind → description, day grouping) with unit tests. Reuse: `Modal`, `ConfirmDialog`, `Button`,
  `Input`, `Spinner`, `ResumeDocument`, `toFormValues`, `lib/format.ts` date helper.
- **Tests:** modal renders grouped list, selecting shows preview, Restore confirms then calls flush → restore →
  onRestored; Save version flushes then creates; `useAutosave.flush`; TailorModal apply-here creates the
  checkpoint before setting values.


## Delivery
- Save this design as `docs/superpowers/specs/2026-10-18-resume-version-history-design.md` and the task
  breakdown as `docs/superpowers/plans/2026-10-18-resume-version-history.md` (repo convention).
- Two branches/PRs into `dev`, like cover letters: `feature-resume-history-api` (model, service, viewset,
  duplicate fix, tests, regenerated client) then `feature-resume-history-ui`. CHANGELOG under `[Unreleased]`;
  cut `0.14.0` + CLAUDE.md phase status when the UI PR is done. No commits, pushes, or PRs without James's
  explicit OK each time.

## Verification
- Local CI equivalent per PR: `npm run lint`, `typecheck`, `test` (client + server), `build`, `gen:api` drift,
  `makemigrations --check`, `check --deploy`; then the 6 required GitHub checks on the PR.
- Manual (`npm run dev`): edit a résumé, backdate the latest version in the shell (or wait 10 min) and edit
  again to see an automatic checkpoint; save a named version; Tailor → Apply and see "Before tailoring";
  restore an old version (editor shows it, autosave stays "Saved"), then restore "Before restoring…" to undo;
  delete and rename; reload to confirm persistence; another user can't see the versions.
