# Design — Persist cover letters

- **Date:** 2026-07-16
- **Status:** Approved (design); pending spec review
- **Feature:** 1 of 3 in a batch (this → résumé version history → streaming AI). Each ships as its own spec → plan → implementation cycle.

## Context

The AI cover-letter generator (`POST /api/ai/cover-letter`, `CoverLetterModal.tsx`, launched from the editor's `AiMenu`) produces a tailored letter from the open résumé + a pasted/uploaded job description. Today that letter is **ephemeral** — it can only be copied to the clipboard or downloaded as `.txt`. Close the modal and it's gone. Users routinely write several cover letters per résumé (one per application) and want to keep, revisit, and tweak them. This feature makes generated cover letters first-class saved objects, completing a half-built feature.

## Goals

- Save a generated cover letter, attached to the résumé it was generated from.
- List, reopen, edit, re-save, export (copy / `.txt`), and delete saved letters — all from the editor.
- Keep the job description alongside each letter as context ("what job was this for?").

## Non-goals (v1)

- **Regenerate from the stored JD** — deferred to a follow-up (the stored JD sets it up).
- Dashboard "N cover letters" indicator on résumé cards.
- DOCX export of cover letters (copy + `.txt` only, matching today's generator).
- A cross-résumé cover-letter library / application tracker.
- Parsing the company/role out of the JD (the user names each letter instead).

## Design decisions (resolved during brainstorming)

1. **Attached to a résumé** — a cover letter belongs to one `Resume`, is listed in that résumé's context, and is deleted when the résumé is deleted (`CASCADE`). Simplest model; matches the editor-launched flow. Tradeoff accepted: deleting a résumé takes its cover letters with it (cheap to regenerate).
2. **Explicit save, editable, reopenable** — after generating, the user can tweak the text, then clicks Save. Saved letters reopen for editing and re-saving. (Not auto-save — avoids a pile of near-duplicate throwaway drafts.)
3. **Lives in the editor** — managed via the AI menu, where generation and the résumé form context already are.
4. **Stores body + editable title + job description** — title defaults to a sensible value (résumé title + short date), user-renameable; JD stored for context.

## Architecture

Generation stays in `apps/ai` (stateless Claude calls). Persistence is a new user-owned document attached to `Resume`, so the model + CRUD live in **`apps/resumes`**, mirroring `ResumeViewSet`'s user-scoping (`get_queryset` filtered to `request.user`, cross-user access → 404). `apps/ai` is unchanged; the client calls the existing `POST /api/ai/cover-letter` to generate, then the new CRUD to persist.

*(Alternative rejected: co-locate everything in `apps/ai` — would mix a stateful user-content model into the otherwise-stateless AI app.)*

### Data model — `CoverLetter` (new, `apps/resumes/models.py`)

| Field | Type | Notes |
|---|---|---|
| `id` | `UUIDField` pk (`default=uuid4`) | matches `Resume` |
| `resume` | `FK(Resume, on_delete=CASCADE, related_name="cover_letters")` | decision 1 |
| `user` | `FK(AUTH_USER_MODEL, on_delete=CASCADE, related_name="cover_letters")` | set on create; direct ownership scoping like `Resume` |
| `title` | `CharField(max_length=150)` | decision 4; default suggested client-side |
| `body` | `TextField` | the letter; capped 8000 chars in the serializer |
| `job_description` | `TextField(blank=True)` | stored context; capped 8000 (matches `CoverLetterRequestSerializer`) |
| `created_at` / `updated_at` | `DateTimeField(auto_now_add / auto_now)` | list ordered `-updated_at` |

- **Meta:** `ordering = ["-updated_at"]`, explicit index on `resume` (the list filter); the `user` FK is auto-indexed.
- **Retention:** cap **25 per résumé**. On create beyond the cap, prune the oldest (delete lowest `updated_at`) rather than rejecting.
- **Migration:** new `apps/resumes/migrations/000X_coverletter.py`.

### API — flat viewset in `apps/resumes` (mirrors `ResumeViewSet`)

- `GET /api/cover-letters/?resume={id}` — list the caller's letters, filtered by résumé (editor always passes `?resume=`).
- `POST /api/cover-letters/` — create `{resume, title, body, job_description}`; `perform_create` sets `user=request.user` and validates the target résumé is the caller's (else 400/404).
- `GET/PATCH/DELETE /api/cover-letters/{id}/` — retrieve / edit / delete, user-scoped (cross-user → 404).
- Serializer validates `body`/`job_description` length caps; `resume` must resolve to a résumé owned by the caller.
- Register on the existing resumes router; regenerate the Orval client (`npm run gen:api`) after the schema change (writes `client/openapi.yaml` + `client/src/api/generated/`).

## Frontend UX

`AiMenu.tsx`'s cover-letter entry opens a **Cover Letters manager** (replacing today's one-shot modal):

- **List** of this résumé's saved letters — title, `updated_at`, first-line snippet; per-row actions **Open · Copy · Download .txt · Delete** (delete behind a confirm). Empty state: "No saved cover letters yet — generate one."
- **New cover letter** → today's generate flow (paste/upload JD → `useGenerateCoverLetter`) → editable body + title field (smart default) → **Save** creates a row (`applyAiUsage` on the returned usage).
- **Open** a saved letter → editable body + title, with its stored JD shown read-only for context → **Save** updates it via PATCH.
- Reuses: `lib/download.ts` (`downloadBlob` / `safeFileName`), `extractFileText` (JD upload), `aiError` (`aiErrorMessage`), `aiUsage` (`applyAiUsage`). Today's `CoverLetterModal.tsx` is refactored into the "generate/edit one letter" sub-view inside the manager.
- New TanStack Query hooks come from the regenerated Orval client (list/create/patch/delete).

## Testing

- **Backend (pytest):** CRUD happy paths; ownership isolation (another user's letter → 404); create rejects a résumé the caller doesn't own; cascade-delete when the résumé is deleted; retention cap prunes the oldest at 26; `?resume=` filter returns only that résumé's letters; length-cap validation.
- **Frontend (Vitest + RTL, mocked generated hooks):** manager renders saved letters; New → generate → Save creates; Open → edit → Save updates; Delete removes (with confirm); Copy and Download `.txt` work; empty state renders.

## Definition of done (per CLAUDE.md)

`npm run build` green, lint/typecheck clean, client + server tests pass, feature verified running locally (generate → save → reopen → edit → export → delete), matches DESIGN.md tokens/a11y, `CHANGELOG.md` `[Unreleased]` updated. Orval client regenerated. No commit — James reviews and commits.

## Open questions

None — all resolved during brainstorming.
