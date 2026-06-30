# Feature B — Import an existing résumé — Design

**Date:** 2026-06-30 · **Branch:** `import-resume` (off `dev`) · **Version:** cuts `0.12.0`

## Context

Third and last pre-deploy feature cycle (A polish ✅ → C templates ✅ → **B import**). The app's value is
its AI assistance (improve / tailor / score), but all of it is useless on an empty résumé — and hand-typing
a full résumé into the form is the biggest friction wall. Import removes that wall: bring an existing résumé,
let Claude structure it, and land in the editor ready to use the AI features.

This is the **first cycle that touches the backend and costs money per use** (one Claude call per import).
It reuses the existing AI infrastructure (forced tool-use for structured output, the usage gate, graceful
degradation) so the new surface is small.

## Scope

Pipeline: **file → (client) extract text → (server) AI parse → `ResumeContent` → in-modal review → confirm →
create résumé → editor.**

1. **Client-side text extraction** — PDF via `pdfjs-dist`, DOCX via `mammoth`, both dynamically imported
   (lazy) so they never bloat the main bundle. The file stays in the browser; only extracted text is sent.
2. **AI parse endpoint** (`apps/ai`) — a forced tool-use call (Sonnet) returning a `ResumeContent`-shaped
   object, mirroring `tailor_to_jd`. Counts against the existing usage gate.
3. **Import modal** — dashboard "Import résumé" action → upload/paste → parse → **in-modal review** (live
   `ResumeDocument` preview) → confirm creates the résumé and navigates to the editor.

### Non-goals (YAGNI)
- **No server-side file upload or storage** — extraction is client-side; the backend only ever receives text.
- **No OCR / scanned-image PDFs** — text-based PDFs only. A near-empty extraction is surfaced as an error
  ("couldn't read text from this file — try pasting instead"), not sent to the AI.
- **No separate review route** — the review is a step *inside* the import modal (reusing `ResumeDocument`);
  no new page.
- **No bulk import**, no LinkedIn/URL import, no re-import-into-existing-résumé (import always creates a new one).

## Design

### 1. Client text extraction (`client/src/lib/extractResumeText.ts`, new)
A single async function:

```ts
export async function extractResumeText(file: File): Promise<string>;
```

- `application/pdf` (or `.pdf`) → `const pdfjs = await import("pdfjs-dist")` → read all pages' text items,
  join with newlines. Configure the worker via Vite (`pdfjs-dist/build/pdf.worker.min.mjs?url`).
- `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) →
  `const mammoth = await import("mammoth")` → `extractRawText({ arrayBuffer })`.
- Unsupported type → throws `Error("Unsupported file type — upload a PDF or DOCX, or paste text.")`.
- Result trimmed; if shorter than a small threshold (e.g. 30 chars) → throws
  `Error("Couldn't read text from this file. If it's a scanned image, paste the text instead.")`.

Dynamic `import()` keeps both libraries out of the initial bundle (lint ignores the generated client; these
are normal lazy chunks). A plain-text paste path skips extraction entirely.

### 2. AI parse endpoint (`server/apps/ai/`)
Mirrors the `tailor_to_jd` pattern exactly.

**`service.parse_resume(text: str) -> dict`** — forced tool-use with a `ResumeContent`-shaped schema on
`settings.AI_MODEL_TAILOR` (Sonnet — chosen for parse robustness):

```python
PARSE_TOOL = {
    "name": "submit_resume",
    "description": "Submit the structured résumé extracted from the provided text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "personalInfo": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"}, "headline": {"type": "string"},
                    "email": {"type": "string"}, "phone": {"type": "string"},
                    "location": {"type": "string"}, "linkedin": {"type": "string"},
                    "github": {"type": "string"}, "website": {"type": "string"},
                },
            },
            "summary": {"type": "string"},
            "workExperience": {"type": "array", "items": {"type": "object", "properties": {
                "company": {"type": "string"}, "position": {"type": "string"},
                "location": {"type": "string"}, "startDate": {"type": "string"},
                "endDate": {"type": "string"}, "bullets": {"type": "array", "items": {"type": "string"}},
            }}},
            "education": {"type": "array", "items": {"type": "object", "properties": {
                "school": {"type": "string"}, "degree": {"type": "string"},
                "field": {"type": "string"}, "graduationDate": {"type": "string"}, "gpa": {"type": "string"},
            }}},
            "skills": {"type": "array", "items": {"type": "string"}},
            "projects": {"type": "array", "items": {"type": "object", "properties": {
                "name": {"type": "string"}, "description": {"type": "string"},
                "url": {"type": "string"}, "technologies": {"type": "array", "items": {"type": "string"}},
            }}},
        },
        "required": ["personalInfo", "workExperience", "education", "skills"],
    },
}
```

The `PARSE_RESUME` system prompt (in `prompts.py`) instructs: extract only what's present (leave unknown
fields as empty string / empty array — never invent), normalize dates to `YYYY-MM` (or `""` if unknown,
present/current → leave `endDate` empty), and keep bullet wording verbatim. After the call, the service
**normalizes** the tool input the way `tailor_to_jd` does: coerce missing keys to the schema defaults and
**assign a UUID `id` to every `workExperience` / `education` / `projects` entry** (the model doesn't produce
ids; the editor + content serializer expect them) so the returned content is editor-ready and valid.

**`ParseResumeView`** (`views.py`) — identical control flow to `TailorJDView`: validate request → `_gate(user)`
(429 when over limit) → `service.parse_resume(text)` → on `AIServiceError` record a failed usage row and
return `502` → else `record_usage(user, "parse-resume", input_length=len(text), output_length=…, success=True)`
→ return `{ "content": <ResumeContent>, "ai_usage": usage_snapshot(user) }`.

**Serializers** (`serializers.py`): `ParseResumeRequestSerializer` (`text` CharField, `max_length` ~20000,
non-blank); `ParseResumeResponseSerializer` reuses the existing nested `ResumeContent` serializer for `content`
plus `ai_usage` — so the OpenAPI/Orval output is a correctly typed `ResumeContent`.

**URL:** `path("parse-resume", ParseResumeView.as_view(), name="parse-resume")` in `apps/ai/urls.py`.
After the backend change, **regenerate the Orval client** (`npm run gen:api`) so the typed
`useParseResume` hook + `ResumeContent`-typed response exist.

### 3. Import modal (`client/src/features/dashboard/ImportResumeModal.tsx`, new)
A `Modal` (size `lg`) with three internal steps in local state (`"input" | "parsing" | "review"`):

- **Input:** a drag-or-pick file zone (accept `.pdf,.docx`) and a "paste text instead" `Textarea`. A single
  "Parse résumé" action.
- **Parsing:** on submit → `extractResumeText(file)` (or use the pasted text) → `useParseResume().mutateAsync`
  → on success store the returned `content` and move to **review**. Spinner with a step label
  ("Reading file…" → "Parsing with AI…"). Errors (unsupported/empty file, `502` AI-down, `429` over-limit
  via `aiErrorMessage`) return to **input** with a `role="alert"` message; `applyAiUsage` updates the header pill.
- **Review:** a scaled live `ResumeDocument` preview of the parsed `content` (same scaling approach as
  `TemplateGallery`) with **"Looks good → open in editor"** (calls `createResume` with
  `{ title: "Imported résumé", template: "classic", content }`, then navigates to `/resumes/:id`) and
  **"Start over"** (back to **input**). The résumé is created **only** on confirm — a bad parse never creates
  a dashboard entry.

**Dashboard wiring** (`DashboardPage.tsx`): an **"Import résumé"** secondary button beside the existing
"New résumé", toggling the modal open. Reuses the existing `useCreateResume` mutation (no new resume endpoint).

### 4. Cost & limits
One Sonnet call per *successful parse attempt* (re-parsing on "Start over" is a new call, the user's choice),
gated by the existing 10/day · 50/month limits (admins/DEBUG bypass). No new recurring cost beyond that call;
no file storage. Graceful `502` when `ANTHROPIC_API_KEY` is absent (dev), so the feature degrades like the
others.

## Testing
- **pytest (server):** `parse_resume` with the Anthropic client mocked → returns normalized content with
  generated entry ids and coerced defaults; `ParseResumeView` → 200 happy path records `parse-resume` usage,
  `429` when over limit, `502` on `AIServiceError`; request serializer rejects blank/oversized text.
- **Vitest (client):** `extractResumeText` — mocked dynamic `import()` of pdfjs/mammoth returns text; throws
  on unsupported type and on near-empty extraction. `ImportResumeModal` — mocked `useParseResume` +
  `useCreateResume`: happy path (input → review preview → confirm creates + navigates), "Start over" returns
  to input, and an error response surfaces an alert and stays on input.
- Full suite (`npm run test`) + typecheck/lint/build stay green.

## Files
- `server/apps/ai/service.py` — `parse_resume` + `PARSE_TOOL`
- `server/apps/ai/prompts.py` — `PARSE_RESUME` system prompt
- `server/apps/ai/serializers.py` — `ParseResumeRequest` / `ParseResumeResponse`
- `server/apps/ai/views.py` — `ParseResumeView`
- `server/apps/ai/urls.py` — `parse-resume` route
- `server/apps/ai/tests/` — parse service + view tests
- `client/openapi.yaml` + `client/src/api/generated/` — regenerated via `npm run gen:api`
- `client/src/lib/extractResumeText.ts` *(new)* + test
- `client/src/features/dashboard/ImportResumeModal.tsx` *(new)* + test
- `client/src/features/dashboard/DashboardPage.tsx` — "Import résumé" button + modal
- `client/package.json` — add `pdfjs-dist`, `mammoth`
- `CHANGELOG.md` (cut `0.12.0`), root `package.json` version, `CLAUDE.md` status

## Risks / notes
- **Parse accuracy** is the make-or-break; Sonnet + the in-modal review (with "Start over") is the mitigation —
  the user always sees the result before a résumé is created.
- **pdf.js worker** must be wired through Vite (worker URL import) or extraction silently fails — called out as
  an explicit implementation step in the plan.
- **Bundle:** pdf.js is sizable but lazy-loaded, so it only loads on import; verify it lands in a separate
  chunk in the build.
