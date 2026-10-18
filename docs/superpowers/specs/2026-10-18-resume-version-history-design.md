# Résumé version history: design

## Context
Edits to a résumé are destructive today. Autosave PATCHes the live record every 800ms of idle, and the AI
features overwrite content in place ("Apply to this résumé" in Tailor rewrites bullets and adds skills; "Use
this summary" replaces the summary). There is no undo that survives a reload, and no way to keep a "the
version I sent to Acme" milestone except duplicating the whole résumé. Version history is item 2 of James's
post-audit batch (cover letters done, streaming later). James skipped the brainstorm questions and asked for a
recommendation, so every product decision below is **my call**, stated so he can veto any of it at approval.

**Outcome:** a safety net that captures history automatically without the user thinking about it, named
versions the user saves on purpose, and a one-click restore that is itself undoable.

## Product design (my calls)
- **Three ways a version gets made**
  1. **Automatic checkpoints (server-side):** when an update changes the résumé and the newest version of that
     résumé is more than **10 minutes** old (or none exists), the server first snapshots the **pre-update**
     state (`kind="auto"`). Result: "how it looked before this editing session" is always recoverable, the list
     isn't flooded by autosave, and no client code is involved.
  2. **Saved versions (manual):** "Save version" with an optional name (e.g. "Sent to Acme"), `kind="manual"`.
  3. **Safety checkpoints:** before **Restore** (`kind="restore"`, label "Before restoring …") and before Tailor's
     **Apply to this résumé** (`kind="ai"`, label "Before tailoring to a job description"), since those are the
     big multi-field overwrites.
- **Restore** replaces title/template/font/section order/content with the version's, after snapshotting the
  current state, so a restore can always be undone from the same list.
- **Retention per résumé:** newest **30** automatic/safety versions kept (oldest pruned silently); up to **20**
  saved versions, and saving a 21st returns a clear 400 ("delete one first"). Saved versions are never pruned.
- **Duplicating** a résumé (incl. tailored copies) starts with empty history.
- **Non-goals (v1):** diff/compare view, partial (per-section) restore, branching, cover-letter history,
  history on the dashboard. **Anti-goals:** silently losing a saved version; a restore that loses current work;
  a list so noisy it's useless.

## UI (my calls; matches Editorial Ink + existing modal patterns)
- **"History" button** (lucide `History` icon, secondary style like the Template button) in `EditorTopBar`,
  left of `AiMenu`.
- **`VersionHistoryModal`** (new `size="xl"` on `Modal`, ~`max-w-5xl`): two columns.
  - **Left:** "Save version" (name input + button) at top, then the list grouped Today / Yesterday / date. Each row:
    the label, or a kind description ("Automatic checkpoint", "Before tailoring…", "Before restoring…"), time, and a
    small "Saved" tag for manual versions. Selected row highlighted with the active state (accent reserved for
    actions per DESIGN.md).
  - **Right:** read-only, scaled `ResumeDocument` preview of the selected version (same technique as
    `TemplateGallery.tsx`: 816px width + `transform: scale()`, `pointer-events-none`), normalized through
    `toFormValues` (`features/editor/editorSchema.ts`) so older snapshots missing newer fields still render.
    Actions: **Restore** (the one primary CTA), Rename, Delete. Restore and Delete use `ConfirmDialog`
    ("Your current résumé is saved to history first, so you can undo this.").
  - Empty state: "No history yet. Versions appear as you edit, or save one now."

## Decisions made during the API build
- Restore labels don't embed a timestamp (`Before restoring "<name>"`, or `Before restoring an earlier version`); the client shows times in the user's timezone.
- Updates and version writes lock the résumé row (`select_for_update`), so concurrent saves can't create
  duplicate checkpoints or exceed the saved-version cap, and a restore never prunes the version it restores.
- Listing versions requires `?resume=` (history is always per résumé).
- The `resume` field on version and cover-letter writes is owner-scoped (`OwnedResumeField`): another user's
  résumé and a nonexistent one get the same error.
- The version `kind` enum is named explicitly (`ResumeVersionKindEnum`) via drf-spectacular `ENUM_NAME_OVERRIDES` so the generated TypeScript type is readable.

Implementation tasks: `docs/superpowers/plans/2026-10-18-resume-version-history.md`.
