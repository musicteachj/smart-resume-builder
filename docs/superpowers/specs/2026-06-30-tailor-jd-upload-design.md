# Design — Upload a file for "Tailor to job description"

**Date:** 2026-06-30
**Status:** Approved (brainstorming)

## Goal

Let users provide the job description to the Tailor-to-JD feature by **uploading a
PDF or DOCX**, in addition to the current paste-into-textarea flow — mirroring the
file-or-paste convenience already shipped in the import-résumé feature.

## Scope

Frontend-only. No backend, API, serializer, or AI changes: `POST /api/ai/tailor-jd`
continues to receive the job description as `job_description` text. Extraction happens
client-side; the file never leaves the browser.

## Background

- The Tailor modal (`client/src/features/ai/TailorModal.tsx`) currently has a single
  JD `<Textarea>` → **Analyze match** → results (`ScoreMeter`, missing keywords,
  suggested rewrites).
- The import feature already built generic, lazy-loaded, browser-side text extraction
  (`client/src/lib/extractResumeText.ts`: PDF via `pdfjs-dist`, DOCX via `mammoth`).
  Despite its name, the function is not résumé-specific — it extracts plain text from
  any PDF/DOCX `File`.

Key UX difference from the import modal: import uses an *either/or* input (file **or**
paste) and sends extracted text straight to AI. Tailor keeps the **textarea as the
primary, editable surface** — so upload should *fill the textarea* (editable), not
bypass it. JDs are noisy (nav/footer/boilerplate), and letting the user trim before
spending an AI credit yields a better match.

## Changes

### 1. Rename the shared extractor (generalize)

- Rename `client/src/lib/extractResumeText.ts` → `client/src/lib/extractFileText.ts`;
  export `extractFileText` (logic unchanged — already generic).
- Generalize the two internal error strings that say "résumé" to read as "file"/
  "document" so they make sense for a JD as well.
- Update the existing caller `client/src/features/dashboard/ImportResumeModal.tsx`
  (import + call site).
- Rename test `client/src/lib/extractResumeText.test.ts` →
  `client/src/lib/extractFileText.test.ts` (contents unchanged apart from the
  import/symbol name).

### 2. `TailorModal` — add upload above the textarea

In the input view (`!result` branch) only:

- Add a styled file input (`accept=".pdf,.docx"`, accessible label) above the JD
  `<Textarea>`, matching the import modal's file-input styling.
- On file pick: set a local `reading` boolean, `await extractFileText(file)`, and
  **replace** the `jd` state with the extracted text (the textarea stays editable).
- While `reading`: show an inline "Reading file…" indicator (reuse
  `components/ui/Spinner`) and disable **Analyze match**.
- Extraction errors surface in the **existing** `error` slot (`role="alert"`); the
  textarea is left unchanged on error so the paste fallback is available.

No change to the results view, `analyze()`, usage gating, or the AI credit copy.

### Data flow

```
file → extractFileText() → jd textarea (editable) → analyze() → POST /api/ai/tailor-jd
```

Extraction is client-side and spends **no** AI credit; the credit is still only used
by Analyze.

## Testing

- **`extractFileText.test.ts`** — existing cases carry over unchanged (PDF extract,
  DOCX extract, empty/too-short throws, unsupported-type throws); rename only.
- **`TailorModal.test.tsx`** (new — none exists today). Mock `extractFileText` and the
  generated `useTailorJd` hook, assert:
  1. picking a file populates the textarea with extracted text;
  2. an extraction error renders in the `role="alert"` slot and leaves the textarea
     unchanged;
  3. **Analyze match** is disabled while reading and enabled afterward.

## Edge cases

- **Scanned/image PDF** → `extractFileText` throws its "couldn't read text / paste
  instead" message; paste box is the fallback.
- **Replace semantics** → uploading overwrites existing textarea content by design
  (the file is the JD source of truth); the result is editable so nothing is silently
  lost.
- **Unsupported type** → `accept` filters the picker; the function re-checks and throws
  a clear message otherwise.
- **Privacy** → unchanged from import: only extracted text is sent upstream.

## Verification

1. `npm run build` — green.
2. `npm run lint` / `npm run typecheck` — clean.
3. `npm run test` — client (Vitest) + server (pytest) green.
4. `npm run dev`: upload a real JD PDF, confirm it fills the textarea and Analyze
   produces a score.
5. Add an `### Added` line under `[Unreleased]` in `CHANGELOG.md` (additive; no
   version bump).

## Out of scope

- Any backend / `tailor-jd` endpoint change.
- The results UI, scoring logic, or AI prompt.
- New extraction formats (only PDF/DOCX, as today).
