# Design — Replace Fraunces with Newsreader as the app display font

**Date:** 2026-06-30
**Status:** Approved (visual pairing validated in brainstorming companion)

## Goal

Swap the app-chrome display typeface from **Fraunces** to **Newsreader**, keeping
**Inter** as the body/UI sans. James disliked Fraunces; Newsreader is a calmer,
editorial serif that pairs more naturally with Inter while preserving the
"serious document" feel of the Editorial Ink system.

Scope is the **app UI only**. The résumé document and exported PDF are out of
scope — they use `font-document` (Georgia) / `font-document-sans` (Arial) and
must remain untouched (ATS-safe, per CLAUDE.md rule 4).

## Background

Fraunces is fully centralized behind the `display` font token, so this is a
small change:

- Defined in two places: the Google Fonts `@import` (`client/src/index.css:1`)
  and the `display` family (`client/tailwind.config.ts:58`).
- Consumed via the `font-display` Tailwind class in 8 component files
  (`AuthShell`, `ResumeCard`, `DashboardPage`, `LandingPage`, `EditorPage`,
  `EditorPlaceholderPage`, `ConfirmDialog`, `Modal`) — these update automatically
  through the token and need no edits.

Both Fraunces and Newsreader are optical-size (`opsz`) fonts, so the variable
`opsz` axis is preserved to keep the face elegant at large headline sizes and
legible at small heading sizes (e.g. dashboard card titles).

## Changes

### 1. `client/src/index.css` (line 1)

Replace the Fraunces segment of the Google Fonts `@import` with Newsreader,
keeping its `opsz` axis and weights 400/500/600. The Inter segment is unchanged.

- New Newsreader segment: `family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600`
- Weight rationale: 400/500/600 matches Inter's loaded set and gives a medium
  serif if needed; the cost over 400/600 is a few KB.

### 2. `client/tailwind.config.ts` (line 58)

```diff
- display: ["Fraunces", "Georgia", "serif"],
+ display: ["Newsreader", "Georgia", "serif"],
```

Fallback chain (Georgia → serif) is retained.

### 3. `client/src/features/templates/ResumeDocument.tsx` (line ~10)

Docstring comment references "Fraunces/Inter" as the app fonts the document
must *not* use. Update to "Newsreader/Inter" so the comment stays accurate.

### 4. Stray references

`grep -rn "Fraunces"` across the repo to catch any remaining mentions
(CHANGELOG, docs, comments) and update them.

## Out of scope (explicitly unchanged)

- `font-sans` (Inter), `font-document` (Georgia), `font-document-sans` (Arial).
- The 8 `font-display` consumer components.
- Résumé templates, preview, and PDF export.

## Verification

1. `npm run build` — green.
2. `npm run typecheck` — clean.
3. `npm run lint` — clean.
4. Run `npm run dev` and visually confirm the landing hero headline and other
   `font-display` headings render in Newsreader; confirm a dashboard card heading
   stays legible at its smaller size.
5. Confirm the résumé preview/PDF is visually unchanged (still Georgia/Arial).
6. Update `CHANGELOG.md` under `[Unreleased]`.

## Notes

- No backend, API, migration, or test-logic changes — purely presentational.
- No new dependency; Newsreader loads from Google Fonts like Fraunces did.
