# Feature A — Editor & document polish — Design

**Date:** 2026-06-13 · **Branch:** `editor-polish` · **Version:** cuts `0.10.0`

## Context

Phases 1–9 shipped a working AI resume builder. Before the AWS deploy, we're adding a few
high-value polish items to the editing experience. This is the first of three feature cycles
(A polish → C templates → B "import an existing resume"); D/E follow later. Client-only — no
backend or schema changes.

## Scope (three items)

1. **Headline in the resume document** — render `personalInfo.headline` under the name.
2. **Drag-to-reorder** — Work Experience, Education, Projects entries, and bullets within a work
   experience.
3. **Dark-mode toggle** — app chrome only; the resume document stays light.

### Non-goals (YAGNI)
- Reordering skill chips (cheap to delete/re-add) or education/project sub-fields.
- Dark-mode *document* / dark PDF — the document is a white-paper artifact, always light.
- A dark-mode toggle on the landing/auth nav (the persisted theme still applies there; the toggle
  lives in the authed header only).

## Design

### 1. Headline in the document
`ResumeDocument` renders `personalInfo.headline` directly beneath the name, only when non-empty, in
a lighter/secondary treatment. Centered under the name for **Classic**, left-aligned for **Modern**
(matches `screens/4`). Pure presentational change; `headline` already exists in the content schema
and editor form, so no other layer changes.

### 2. Drag-to-reorder (`@dnd-kit`)
Libraries: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities`.

A reusable **`SortableList`** component encapsulates `DndContext` + `SortableContext` (vertical-axis
modifier, pointer + keyboard sensors) and renders children via a render-prop that exposes a drag
**handle** (grip icon, `aria-label="Drag to reorder"`). One implementation, four call sites.

- **Experience / Education / Projects** (`useFieldArray` in their Section components): the sortable
  item id is RHF's stable `field.id`; on drag end, compute old/new index and call
  `fieldArray.move(oldIndex, newIndex)`. Autosave (which watches form values) persists the new order
  automatically — no extra wiring.
- **Bullets within a work experience** (`BulletEditor`, a `Controller`-backed `string[]`): the form
  value stays `string[]`, but `BulletEditor` keeps **stable per-bullet ids** internally (a ref-backed
  parallel array) so `@dnd-kit` has stable keys during a drag; on reorder it `arrayMove`s and calls
  `onChange` with the reordered strings.

Accessibility: `@dnd-kit` provides keyboard reordering and ARIA; handles are labeled; drag animation
respects `prefers-reduced-motion`.

### 3. Dark-mode toggle
- **`stores/theme.ts`** (Zustand + `persist`): `{ theme: "light" | "dark", toggle(), setTheme() }`,
  persisted to `localStorage` (key `srb-theme`). First visit with no stored value defaults to the OS
  preference (`matchMedia("(prefers-color-scheme: dark)")`).
- **Apply:** a tiny initializer (in `main.tsx`) toggles the `dark` class on `<html>` whenever `theme`
  changes, and on rehydrate at load.
- **Toggle UI:** a sun/moon icon button in `AppHeader` (`aria-label` reflecting the action).
- **Why it "just works":** every component is token-driven and the `.dark` CSS variables already
  exist in `index.css`. The **resume document stays light** because `ResumeDocument` uses explicit
  paper/ink colors (not theme tokens), so the white document sits on the darkened workspace and the
  PDF is unaffected.

## Testing
- **Vitest:** theme store (toggle flips + persists; `matchMedia` mocked for the default); `ResumeDocument`
  renders the headline when present and omits it when blank.
- **Manual:** drag-reorder of items and bullets (mouse + keyboard); autosave persists order across a
  reload; dark toggle flips chrome while the document + exported PDF stay light.
- Full suite (`npm run test`) + typecheck/lint/build stay green.

## Files
- `client/package.json` — add the four `@dnd-kit/*` packages
- `client/src/stores/theme.ts` *(new)* · `client/src/main.tsx` (apply theme) · `AppHeader.tsx` (toggle)
- `client/src/components/ui/SortableList.tsx` *(new)*
- `client/src/features/templates/ResumeDocument.tsx` (headline)
- editor sections: `ExperienceSection.tsx`, `EducationSection.tsx`, `ProjectsSection.tsx`, and
  `components/BulletEditor.tsx` (sortable)
- tests alongside source; `CHANGELOG.md` (cut `0.10.0`), `package.json` version, `CLAUDE.md` status

No `server/` changes.
