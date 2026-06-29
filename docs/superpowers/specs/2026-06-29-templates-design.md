# Feature C — Templates (gallery picker + Banner template) — Design

**Date:** 2026-06-29 · **Branch:** `templates` (off `dev`) · **Version:** cuts `0.11.0`

## Context

Second of the pre-deploy feature cycles (A polish ✅ → **C templates** → B import). The app ships two
single-column, ATS-safe templates today — **Classic** (Georgia, centered header) and **Modern** (Arial,
left header) — both rendered by one `ResumeDocument` via an `isModern` boolean, and chosen via a small
"Template:" dropdown in the editor top bar. This cycle makes templates feel like a real feature:
a **visual gallery picker** plus a **third template**. Client-only — no backend or schema changes
(the `template` field is already a free-form `SlugField`; new resumes still default to `classic`).

## Scope (three items)

1. **Template registry** — replace the `isModern` boolean with a small style-config registry so templates
   are data, not branches. One source of truth for ids/labels/descriptions + per-template style.
2. **Third template: "Banner"** — a filled navy header band with the name/headline/contacts reversed out
   in white; the body reuses Modern's proven ATS layout unchanged. Single-column, ATS-safe.
3. **Visual gallery picker** — replace the dropdown with a modal that shows each template as a live,
   scaled-down preview of the *user's current resume*, click-to-select.

### Non-goals (YAGNI)
- No two-column / multi-column template (real ATS-parsing risk — out of scope deliberately).
- No template *customization* (accent/font/density knobs) — fixed designs only this cycle.
- No create-time template picker on the dashboard — new resumes default to `classic`; the user switches
  in the editor via the gallery. (The dashboard create flow is untouched beyond a label nicety.)
- No backend, schema, migration, AI, or PDF-pipeline changes. Zero added runtime cost.

## Design

### 1. Template registry (`features/templates/templates.ts`, new)
A single module owns the template list and each template's render style:

```ts
export type TemplateId = "classic" | "modern" | "banner";

export interface TemplateStyle {
  id: TemplateId;
  label: string;          // gallery + switcher display
  description: string;    // gallery card subtitle
  font: "serif" | "sans"; // document font family class
  headerAlign: "center" | "left";
  header: "plain" | "banner";
}

export const TEMPLATES: TemplateStyle[] = [ /* classic, modern, banner */ ];
export const DEFAULT_TEMPLATE: TemplateId = "classic";
export function getTemplate(id: string): TemplateStyle; // falls back to classic for unknown slugs
```

`ResumeDocument` consumes the resolved `TemplateStyle` instead of computing `isModern`. The dashboard
`ResumeCard` uses `getTemplate(slug).label` for a nicer "Banner template" label (currently prints the raw
slug). Both the gallery and any text display read from this one list.

### 2. "Banner" template (`ResumeDocument.tsx`)
`ResumeDocument` keeps **one** implementation, now style-config-driven:
- `font` → `font-document` (serif) or `font-document-sans` (sans) as today.
- `header: "plain"` → current header (name + headline + contacts, aligned per `headerAlign`).
- `header: "banner"` → a full-width navy block (`#2B3A55`, a local document constant) with the name,
  headline, and contact/links lines reversed out in white/near-white; sits flush to the document top.
  The **body below the header is identical** to the plain layout (same sections, same ATS-safe single
  column, same `#1a1a1a` ink) — Banner reuses Modern's body, so it inherits known-good ATS behavior and
  only the header differs. Lower risk, still visually distinct at thumbnail size.

ATS note: the banner is real selectable text on a colored background (not an image), so parsers extract it
normally; the background color is irrelevant to extraction. The document stays light in dark mode (Feature
A established the document uses explicit paper/ink colors, not theme tokens) — Banner's navy is likewise an
explicit document color, unaffected by the chrome theme and unchanged in the PDF.

The document is exempt from the app's "no raw hex" rule by existing convention (it already uses explicit
hex like `#1a1a1a` / `#d9d6d0`); `#2B3A55` follows that pattern and is **not** the reserved forest-green
accent and uses no app fonts.

### 3. Gallery picker (`features/editor/components/TemplateGallery.tsx`, new)
A modal (reusing the existing `@/components/ui/Modal`) opened from the editor top bar:
- Renders one card per `TEMPLATES` entry. Each card shows a **live `ResumeDocument`** of the current form
  content, scaled into a fixed thumbnail box via CSS `transform: scale(...)` + `transform-origin: top left`,
  with `pointer-events: none` on the preview so the card itself handles the click. DRY — reuses the real
  document, so previews are always accurate (incl. the user's actual content).
- The current template's card shows a selected state (accent ring + check, paired with a text label per the
  score-band/"never color alone" convention). Selecting a card calls back with the id and closes the modal.
- Accessible: dialog semantics from `Modal` (Esc + explicit close), cards are buttons with
  `aria-pressed`/labelled by template name, keyboard-selectable.

**Top bar wiring (`EditorTopBar.tsx`):** the `TemplateSwitcher` dropdown is replaced by a button showing
`Template: <label>` that opens `TemplateGallery`. On select, it writes the RHF `template` field
(`setValue("template", id, { shouldDirty: true })`) exactly as the dropdown did, so autosave persists it
with no new wiring. `TemplateSwitcher.tsx` is removed (superseded).

## Testing
- **Vitest:**
  - `templates.ts` — `getTemplate` returns the right style and falls back to `classic` for an unknown slug;
    `TEMPLATES` contains all three ids.
  - `ResumeDocument` — renders the banner header (name present, header carries the banner treatment) when
    `template="banner"`, and the plain header otherwise; existing headline tests stay green.
  - `TemplateGallery` — renders a card per template, marks the active one selected, and calls `onChange`
    with the chosen id on click (mocked content; previews need not be pixel-measured).
- **Manual:** open the gallery → see three live previews of the real resume → pick Banner → top bar + preview
  update, navy header renders, body matches Modern, autosave persists across reload; Export PDF shows the
  banner; chrome dark mode leaves the document light.
- Full suite (`npm run test`) + typecheck/lint/build stay green.

## Files
- `client/src/features/templates/templates.ts` *(new)* — registry + `getTemplate` + `DEFAULT_TEMPLATE`
- `client/src/features/templates/ResumeDocument.tsx` — style-config-driven; Banner header
- `client/src/features/editor/components/TemplateGallery.tsx` *(new)* — modal gallery, live scaled previews
- `client/src/features/editor/EditorTopBar.tsx` — open gallery; write `template` field
- `client/src/features/editor/components/TemplateSwitcher.tsx` — **removed** (replaced by gallery)
- `client/src/features/dashboard/ResumeCard.tsx` — show `getTemplate(slug).label`
- tests alongside source; `CHANGELOG.md` (cut `0.11.0`), `package.json` version, `CLAUDE.md` status

No `server/` changes.
