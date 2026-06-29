# Feature C — Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template dropdown with a visual gallery picker and add a third "Banner" template, driven by a small template registry — cutting `0.11.0`.

**Architecture:** A registry module (`templates.ts`) turns templates from an `isModern` boolean into data (id/label/description + style config). `ResumeDocument` consumes the resolved style; "Banner" reuses Modern's ATS-safe body and adds a full-bleed navy header. A `TemplateGallery` modal renders a live, scaled `ResumeDocument` of the user's content per template, click-to-select, writing the RHF `template` field so existing autosave persists it.

**Tech Stack:** React 19, TypeScript (strict), Tailwind 3 (Editorial Ink tokens; the resume document uses explicit document hex by convention), Radix Dialog via `@/components/ui/Modal`, React Hook Form, Vitest + React Testing Library, lucide-react.

---

## Important context (read before starting)

- **Hard rule — NO COMMITS.** Per `CLAUDE.md`, never `git commit`/`git push`. This plan uses **Checkpoint** steps instead. James reviews and commits himself. Work happens on the `templates` branch (already created off `dev`).
- Run client commands from repo root: `npm run test:client -- <pattern>`, `npm run typecheck`, `npm run lint`, `npm run build`. Full suite: `npm run test`.
- **The resume document is exempt from the "no raw hex" rule** by existing convention — `ResumeDocument.tsx` already uses explicit hex (`#1a1a1a`, `#d9d6d0`, `#555`…). The Banner navy `#2B3A55` follows that pattern; it is **not** the reserved forest-green app accent and uses no app fonts.
- `template` is a free-form server `SlugField` → the `banner` slug needs **no migration**. The editor form field is `template: z.string()` (unchanged). New resumes still default to `classic`.
- Existing tests to keep green: `ResumeDocument.test.tsx` (headline), plus the broader suite. `TemplateSwitcher.tsx` has no test (verified by grep).
- Preview === PDF: `ResumeDocument` is the single component for both. The Banner header must print, so it needs `print-color-adjust: exact` and must collapse its full-bleed negative margins when the document's print padding goes to 0.

## File structure

- `client/src/features/templates/templates.ts` *(new)* — `TemplateId`, `TemplateStyle`, `TEMPLATES`, `DEFAULT_TEMPLATE`, `getTemplate()`.
- `client/src/features/templates/templates.test.ts` *(new)* — registry/`getTemplate` tests.
- `client/src/features/templates/ResumeDocument.tsx` — registry-driven; Banner header; print-safe full-bleed.
- `client/src/features/templates/ResumeDocument.test.tsx` — add Banner-header cases.
- `client/src/features/editor/components/TemplateGallery.tsx` *(new)* — modal gallery, live scaled previews.
- `client/src/features/editor/components/TemplateGallery.test.tsx` *(new)*.
- `client/src/features/editor/EditorTopBar.tsx` — open gallery, write `template`.
- `client/src/features/editor/components/TemplateSwitcher.tsx` — **delete** (replaced).
- `client/src/features/dashboard/ResumeCard.tsx` — show `getTemplate(slug).label`.
- Docs/meta: root `package.json` version, `CHANGELOG.md`, `CLAUDE.md` status.

---

## Task 1: Template registry

**Files:**
- Create: `client/src/features/templates/templates.ts`
- Test: `client/src/features/templates/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE, TEMPLATES, getTemplate } from "./templates";

describe("templates registry", () => {
  it("contains classic, modern, and banner", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["classic", "modern", "banner"]);
  });

  it("getTemplate resolves a known id", () => {
    expect(getTemplate("banner").label).toBe("Banner");
    expect(getTemplate("modern").font).toBe("sans");
  });

  it("getTemplate falls back to the default for an unknown slug", () => {
    expect(getTemplate("nope").id).toBe(DEFAULT_TEMPLATE);
    expect(DEFAULT_TEMPLATE).toBe("classic");
  });

  it("banner uses the banner header treatment", () => {
    expect(getTemplate("banner").header).toBe("banner");
    expect(getTemplate("classic").header).toBe("plain");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:client -- templates`
Expected: FAIL — cannot find module `./templates`.

- [ ] **Step 3: Implement the registry**

```ts
export type TemplateId = "classic" | "modern" | "banner";

export interface TemplateStyle {
  id: TemplateId;
  label: string;
  description: string;
  font: "serif" | "sans";
  headerAlign: "center" | "left";
  header: "plain" | "banner";
}

/** The one source of truth for templates — consumed by ResumeDocument, the gallery, and the dashboard. */
export const TEMPLATES: TemplateStyle[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Centered serif — editorial and timeless.",
    font: "serif",
    headerAlign: "center",
    header: "plain",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Left-aligned sans — clean and contemporary.",
    font: "sans",
    headerAlign: "left",
    header: "plain",
  },
  {
    id: "banner",
    label: "Banner",
    description: "Bold navy header band — confident and distinct.",
    font: "sans",
    headerAlign: "left",
    header: "banner",
  },
];

export const DEFAULT_TEMPLATE: TemplateId = "classic";

/** Resolve a (possibly unknown) slug to a template style, falling back to the default. */
export function getTemplate(id: string): TemplateStyle {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- templates`
Expected: PASS. Then `npm run typecheck` → green.

- [ ] **Step 5: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 2: Registry-driven `ResumeDocument` + Banner header

**Files:**
- Modify: `client/src/features/templates/ResumeDocument.tsx`
- Test: `client/src/features/templates/ResumeDocument.test.tsx`

- [ ] **Step 1: Add the failing Banner tests**

Append to the existing `ResumeDocument.test.tsx` describe block (keep the existing headline tests):

```tsx
describe("ResumeDocument banner template", () => {
  it("renders the name in a banner header when template=banner", () => {
    render(<ResumeDocument content={content({ headline: "Engineer" })} template="banner" />);
    // Name + headline still present...
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    // ...inside an element carrying the banner test id.
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "banner");
  });

  it("uses the plain header for classic and modern", () => {
    const { rerender } = render(<ResumeDocument content={content()} template="classic" />);
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "plain");
    rerender(<ResumeDocument content={content()} template="modern" />);
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "plain");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:client -- ResumeDocument`
Expected: FAIL — no element with `data-testid="doc-header"`.

- [ ] **Step 3: Make `ResumeDocument` registry-driven with a Banner header**

In `client/src/features/templates/ResumeDocument.tsx`:

(a) Add the import near the top (after the existing imports):

```tsx
import { getTemplate } from "./templates";
```

(b) Replace the start of the component body — change `isModern` to the resolved style and define the document padding as a CSS variable so the Banner's full-bleed margins can collapse in print:

Replace:

```tsx
export function ResumeDocument({ content, template = "classic", className }: ResumeDocumentProps) {
  const isModern = template === "modern";
  const { personalInfo: pi, summary, workExperience, education, skills, projects } = content;
```

with:

```tsx
export function ResumeDocument({ content, template = "classic", className }: ResumeDocumentProps) {
  const style = getTemplate(template);
  const { personalInfo: pi, summary, workExperience, education, skills, projects } = content;
```

(c) Replace the opening `<article>` tag. Replace:

```tsx
    <article
      className={cn(
        "bg-white p-[clamp(28px,4vw,52px)] text-[#1a1a1a] print:p-0",
        isModern ? "font-document-sans" : "font-document",
        className,
      )}
    >
```

with (padding now comes from a `--doc-pad` custom property that drops to 0 in print, so the Banner's negative margins also collapse to 0):

```tsx
    <article
      className={cn(
        "bg-white p-[var(--doc-pad)] text-[#1a1a1a] [--doc-pad:clamp(28px,4vw,52px)] print:[--doc-pad:0px]",
        style.font === "sans" ? "font-document-sans" : "font-document",
        className,
      )}
    >
```

(d) Replace the entire `<header>…</header>` block. Replace:

```tsx
      {/* Header */}
      <header className={cn("border-b border-[#d9d6d0] pb-4", isModern ? "text-left" : "text-center")}>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">
          {pi.name || "Your Name"}
        </h1>
        {pi.headline && <p className="mt-0.5 text-[13px] text-[#555]">{pi.headline}</p>}
        {contactLine && <p className="mt-2 text-[11px] text-[#444]">{contactLine}</p>}
        {linksLine && <p className="mt-1 text-[11px] text-[#444]">{linksLine}</p>}
      </header>
```

with:

```tsx
      {/* Header — plain (classic/modern) or full-bleed banner */}
      {style.header === "banner" ? (
        <header
          data-testid="doc-header"
          data-header="banner"
          className="mb-5 bg-[#2B3A55] px-[var(--doc-pad)] pb-5 pt-[var(--doc-pad)] text-left text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
          style={{
            marginInline: "calc(-1 * var(--doc-pad))",
            marginTop: "calc(-1 * var(--doc-pad))",
          }}
        >
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {pi.name || "Your Name"}
          </h1>
          {pi.headline && <p className="mt-0.5 text-[13px] text-[#d7dce6]">{pi.headline}</p>}
          {contactLine && <p className="mt-2 text-[11px] text-[#c2cad8]">{contactLine}</p>}
          {linksLine && <p className="mt-1 text-[11px] text-[#c2cad8]">{linksLine}</p>}
        </header>
      ) : (
        <header
          data-testid="doc-header"
          data-header="plain"
          className={cn("border-b border-[#d9d6d0] pb-4", style.headerAlign === "center" ? "text-center" : "text-left")}
        >
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {pi.name || "Your Name"}
          </h1>
          {pi.headline && <p className="mt-0.5 text-[13px] text-[#555]">{pi.headline}</p>}
          {contactLine && <p className="mt-2 text-[11px] text-[#444]">{contactLine}</p>}
          {linksLine && <p className="mt-1 text-[11px] text-[#444]">{linksLine}</p>}
        </header>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:client -- ResumeDocument`
Expected: PASS (new Banner cases + existing headline cases). Then `npm run typecheck` → green.

- [ ] **Step 5: Checkpoint**

Run: `npm run lint` → clean. Manual (optional now, required at Task 6): in `npm run dev`, switch a resume to `banner` via the existing dropdown — confirm a navy header band spanning the full document width, white text, body identical to Modern. Do not commit.

---

## Task 3: `TemplateGallery` modal

**Files:**
- Create: `client/src/features/editor/components/TemplateGallery.tsx`
- Test: `client/src/features/editor/components/TemplateGallery.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PersonalInfo, ResumeContent } from "@/api/generated/model";

import { TemplateGallery } from "./TemplateGallery";

function content(personalInfo: PersonalInfo = {}): ResumeContent {
  return {
    personalInfo: { name: "Ada Lovelace", ...personalInfo },
    summary: "",
    workExperience: [],
    education: [],
    skills: [],
    projects: [],
  };
}

describe("TemplateGallery", () => {
  it("renders a card per template and marks the active one selected", () => {
    render(
      <TemplateGallery open onOpenChange={() => {}} content={content()} value="classic" onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Classic template" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Modern template" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Banner template" })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen id and closes on click", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TemplateGallery open onOpenChange={onOpenChange} content={content()} value="classic" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Banner template" }));
    expect(onSelect).toHaveBeenCalledWith("banner");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:client -- TemplateGallery`
Expected: FAIL — cannot find module `./TemplateGallery`.

- [ ] **Step 3: Implement `TemplateGallery`**

```tsx
import { Check } from "lucide-react";

import type { ResumeContent } from "@/api/generated/model";
import { Modal } from "@/components/ui/Modal";
import { ResumeDocument } from "@/features/templates/ResumeDocument";
import { TEMPLATES } from "@/features/templates/templates";
import { cn } from "@/lib/utils";

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: ResumeContent;
  value: string;
  onSelect: (id: string) => void;
}

/**
 * Template picker modal. Each card is a live, scaled-down ResumeDocument of the user's
 * actual content (DRY — the preview is the real document), so previews are always accurate.
 * Selecting a card writes the template id and closes.
 */
export function TemplateGallery({ open, onOpenChange, content, value, onSelect }: TemplateGalleryProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Choose a template"
      description="Live preview of your résumé in each style."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TEMPLATES.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${t.label} template`}
              onClick={() => {
                onSelect(t.id);
                onOpenChange(false);
              }}
              className={cn(
                "flex flex-col overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent/60",
              )}
            >
              <div className="relative h-44 overflow-hidden bg-white">
                {/* 816px ≈ 8.5in Letter width at 96dpi; scaled into the thumbnail. Non-interactive. */}
                <div
                  className="pointer-events-none absolute left-0 top-0 origin-top-left"
                  style={{ width: 816, transform: "scale(0.23)" }}
                  aria-hidden
                >
                  <ResumeDocument content={content} template={t.id} />
                </div>
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
              </div>
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{t.label}</span>
                  {selected && <span className="text-xs font-medium text-accent">Selected</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- TemplateGallery`
Expected: PASS. Then `npm run typecheck` → green.

- [ ] **Step 5: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 4: Wire the gallery into `EditorTopBar`; remove `TemplateSwitcher`

**Files:**
- Modify: `client/src/features/editor/EditorTopBar.tsx`
- Delete: `client/src/features/editor/components/TemplateSwitcher.tsx`

- [ ] **Step 1: Replace the dropdown with a gallery trigger + modal**

Rewrite `client/src/features/editor/EditorTopBar.tsx`:

```tsx
import { ArrowLeft, ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import type { ResumeContent } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { AiMenu } from "@/features/ai/AiMenu";
import { getTemplate } from "@/features/templates/templates";

import { SaveIndicator } from "./components/SaveIndicator";
import { TemplateGallery } from "./components/TemplateGallery";
import type { EditorValues } from "./editorSchema";
import type { SaveStatus } from "./useAutosave";

export function EditorTopBar({
  status,
  onExport,
}: {
  status: SaveStatus;
  onExport: () => void;
}) {
  const navigate = useNavigate();
  const { register, watch, setValue } = useFormContext<EditorValues>();
  const template = watch("template");
  const [galleryOpen, setGalleryOpen] = useState(false);

  return (
    <div className="sticky top-0 z-header flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          aria-label="Back to dashboard"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          {...register("title")}
          aria-label="Resume title"
          className="min-w-0 max-w-[40ch] truncate rounded bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <SaveIndicator status={status} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="text-muted-foreground">Template:</span> {getTemplate(template).label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </button>
        <AiMenu />
        <Button size="sm" onClick={onExport} className="gap-1.5">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <TemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        content={watch("content") as unknown as ResumeContent}
        value={template}
        onSelect={(id) => setValue("template", id, { shouldDirty: true })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the obsolete `TemplateSwitcher`**

Run: `rm client/src/features/editor/components/TemplateSwitcher.tsx`

- [ ] **Step 3: Verify nothing else references it**

Run: `grep -rn "TemplateSwitcher" client/src`
Expected: no output (no remaining references).

- [ ] **Step 4: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. In `npm run dev`: the top-bar "Template: …" button opens the gallery modal showing three live previews of the current résumé; picking one updates the bar + preview and persists via autosave. Do not commit.

---

## Task 5: Dashboard card shows the template label

**Files:**
- Modify: `client/src/features/dashboard/ResumeCard.tsx`

- [ ] **Step 1: Use the registry label instead of the raw slug**

In `client/src/features/dashboard/ResumeCard.tsx`, add the import (with the other `@/` imports):

```tsx
import { getTemplate } from "@/features/templates/templates";
```

Then replace:

```tsx
        Updated {relativeTime(resume.updated_at)} · {resume.template} template
```

with:

```tsx
        Updated {relativeTime(resume.updated_at)} · {getTemplate(resume.template).label} template
```

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. In `npm run dev`, the dashboard card reads e.g. "Banner template" (capitalized label) rather than the raw slug. Do not commit.

---

## Task 6: Verify whole suite, then docs + version

**Files:**
- Modify: root `package.json` (version), `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Full green gate**

Run (from repo root):
```bash
npm run test && npm run typecheck && npm run lint && npm run build
```
Expected: all green. Client test count grows by the new `templates`, Banner `ResumeDocument`, and `TemplateGallery` tests.

- [ ] **Step 2: Manual smoke (the parts unit tests can't cover)**

In `npm run dev`: open a résumé → click "Template:" → the modal shows three live previews of your actual content → pick **Banner** → the preview shows a full-width navy header with the body matching Modern → **Export PDF** and confirm the navy banner appears in the PDF → reload and confirm the choice persisted → toggle dark mode and confirm the document stays light.

- [ ] **Step 3: Bump version**

Edit root `package.json`: `"version": "0.10.0"` → `"version": "0.11.0"`.

- [ ] **Step 4: Update `CHANGELOG.md`**

Add a new section above `## [0.10.0]` and keep the `## [Unreleased]` placeholder:

```markdown
## [0.11.0] - 2026-06-29

Feature C — templates (client-only; no backend/schema changes).

### Added
- **Visual template gallery** replacing the dropdown: a modal showing each template as a live, scaled-down
  preview of the user's actual résumé (reuses `ResumeDocument`), click-to-select with an accent ring + check.
- **Third template — "Banner"**: a full-bleed navy header band with the name/headline/contacts reversed out
  in white; the body reuses Modern's ATS-safe single-column layout. Real selectable text on color (ATS-safe),
  prints in the PDF (`print-color-adjust: exact`), and stays light in dark mode.
- **Template registry** (`features/templates/templates.ts`): templates are now data (id/label/description +
  style config) instead of an `isModern` boolean; one source of truth for the document, the gallery, and the
  dashboard card label.
- Tests: registry/`getTemplate` fallback, `ResumeDocument` Banner header, `TemplateGallery` select-and-close.

### Changed
- Dashboard résumé cards show the template's display label (e.g. "Banner template") instead of the raw slug.
- Removed `TemplateSwitcher` (superseded by the gallery).
```

Then update the compare links at the bottom of `CHANGELOG.md`: add `[0.11.0]` and point `[Unreleased]` at `v0.11.0...HEAD` (mirror the existing format).

- [ ] **Step 5: Update `CLAUDE.md` phase status**

Add a line under the Feature A entry in the Phase status list:

```markdown
- ✅ Feature C — templates (`0.11.0`): template registry (`features/templates/templates.ts`) replacing the
  `isModern` boolean, third **Banner** template (full-bleed navy header, Modern body, ATS-safe, prints), and a
  visual `TemplateGallery` modal with live scaled previews replacing the dropdown. Client-only, no migration.
```

- [ ] **Step 6: Final checkpoint**

Run: `npm run test && npm run build`
Expected: green. **STOP — do not commit.** Report to James for review; he commits himself.

---

## Self-review notes

- **Spec coverage:** registry → Task 1; Banner template → Task 2; gallery picker → Task 3 + wiring Task 4; dashboard label → Task 5; remove `TemplateSwitcher` → Task 4; tests + docs/version → Tasks 1–6. Non-goals (two-column, customization, create-time picker, backend) untouched.
- **Print safety:** Banner background uses `print-color-adjust: exact`; full-bleed negative margins reference `--doc-pad`, which drops to `0px` in print so the banner never overflows the page when document padding collapses.
- **DRY:** the gallery previews reuse the real `ResumeDocument`; all template metadata flows from one `TEMPLATES` list.
- **Type consistency:** `getTemplate(id: string): TemplateStyle`, `TemplateStyle.header: "plain" | "banner"`, `font: "serif" | "sans"`, `headerAlign: "center" | "left"` — used identically in Tasks 1–4. `TemplateGallery` props (`open/onOpenChange/content/value/onSelect`) match the `EditorTopBar` call site in Task 4.
- **Accent ring + check + "Selected" text** satisfy the "never color alone" convention; `aria-pressed` + `aria-label` give the cards accessible state.
- **Commits:** none — every Task ends in a Checkpoint; James reviews and commits.
```
