# Editor Polish (Feature A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three client-only editor polish items — headline in the resume document, drag-to-reorder sections/bullets via `@dnd-kit`, and an app-chrome dark-mode toggle — cutting `0.10.0`.

**Architecture:** A reusable `SortableList` (render-prop exposing a drag handle) wraps RHF `useFieldArray` entries and `BulletEditor` bullets; reorder calls `fieldArray.move()` / `arrayMove` so the existing autosave persists order with no extra wiring. A Zustand+persist `theme` store toggles the `.dark` class on `<html>`; every chrome component is already token-driven and `.dark` CSS vars already exist, so dark mode "just works" while `ResumeDocument` (explicit paper/ink colors) stays light.

**Tech Stack:** React 19, TypeScript (strict), Tailwind 3 (Editorial Ink tokens), Zustand + persist, React Hook Form, `@dnd-kit/{core,sortable,modifiers,utilities}`, Vitest + React Testing Library, lucide-react.

---

## Important context (read before starting)

- **Hard rule — NO COMMITS.** Per `CLAUDE.md`, never `git commit`/`git push`. This plan uses **Checkpoint** steps (run verification) instead of commits. James reviews and commits himself at the end.
- **Item 1 (headline) is already implemented** — `client/src/features/templates/ResumeDocument.tsx:60` renders `pi.headline` under the name in a secondary treatment (`text-[13px] text-[#555]`), inheriting the header's Classic-center / Modern-left alignment (`ResumeDocument.tsx:56`). Task 1 therefore only adds the missing tests the spec calls for.
- Run all client commands from `client/` (or root via `npm run -w`). Tests: `npm run test:client`. Typecheck: `npm run typecheck`. Lint: `npm run lint`. Build: `npm run build`. Full suite: `npm run test` (client + server).
- Existing patterns to match: tests use Vitest + RTL (`src/features/ai/ScoreMeter.test.tsx`); the persist store pattern is `src/stores/auth.ts`; section components are `src/features/editor/sections/*`.

## File structure

- `client/package.json` — add four `@dnd-kit/*` deps (and bump version to `0.10.0` at the end).
- `client/src/components/ui/SortableList.tsx` *(new)* — reusable DnD list + handle.
- `client/src/components/ui/SortableList.test.tsx` *(new)* — smoke/handle test.
- `client/src/stores/theme.ts` *(new)* — Zustand theme store + `getSystemTheme` + `applyTheme`.
- `client/src/stores/theme.test.ts` *(new)* — toggle/persist/default/apply tests.
- `client/src/main.tsx` — apply theme on load + subscribe.
- `client/src/components/layout/AppHeader.tsx` — sun/moon toggle button.
- `client/src/features/templates/ResumeDocument.test.tsx` *(new)* — headline present/absent.
- `client/src/features/editor/sections/ExperienceSection.tsx` — sortable entries.
- `client/src/features/editor/sections/EducationSection.tsx` — sortable entries.
- `client/src/features/editor/sections/ProjectsSection.tsx` — sortable entries.
- `client/src/features/editor/components/BulletEditor.tsx` — sortable bullets w/ stable ids.
- Docs/meta: root `package.json` version, `CHANGELOG.md`, `CLAUDE.md` phase status.

---

## Task 1: Headline tests (impl already exists)

**Files:**
- Test: `client/src/features/templates/ResumeDocument.test.tsx` *(new)*

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ResumeContent } from "@/api/generated/model";

import { ResumeDocument } from "./ResumeDocument";

function content(overrides: Partial<ResumeContent["personalInfo"]> = {}): ResumeContent {
  return {
    personalInfo: { name: "Ada Lovelace", email: "", phone: "", location: "", linkedin: "", github: "", website: "", headline: "", ...overrides },
    summary: "",
    workExperience: [],
    education: [],
    skills: [],
    projects: [],
  };
}

describe("ResumeDocument headline", () => {
  it("renders the headline under the name when present", () => {
    render(<ResumeDocument content={content({ headline: "Senior Engineer" })} />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("omits the headline when blank", () => {
    render(<ResumeDocument content={content({ headline: "" })} />);
    expect(screen.queryByText("Senior Engineer")).not.toBeInTheDocument();
  });

  it("renders the headline for the modern template too", () => {
    render(<ResumeDocument content={content({ headline: "Designer" })} template="modern" />);
    expect(screen.getByText("Designer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:client -- ResumeDocument`
Expected: PASS (impl already exists at `ResumeDocument.tsx:60`). If the `ResumeContent` shape differs (e.g. a required field), read `client/src/api/generated/model` and adjust the `content()` helper until the type checks and tests pass — do not change `ResumeDocument`.

- [ ] **Step 3: Checkpoint**

Run: `npm run test:client -- ResumeDocument` and `npm run typecheck`
Expected: both green. Do **not** commit.

---

## Task 2: Install @dnd-kit + build `SortableList`

**Files:**
- Modify: `client/package.json` (deps)
- Create: `client/src/components/ui/SortableList.tsx`
- Test: `client/src/components/ui/SortableList.test.tsx`

- [ ] **Step 1: Install the libraries**

Run (from `client/`):
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities
```
Expected: four packages added to `dependencies`, lockfile updated.

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SortableList } from "./SortableList";

const items = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }];

describe("SortableList", () => {
  it("renders each item via the render-prop with a labeled drag handle", () => {
    render(
      <SortableList items={items} getId={(i) => i.id} onReorder={() => {}}>
        {(item, handle) => (
          <div>
            {handle}
            <span>{item.label}</span>
          </div>
        )}
      </SortableList>,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:client -- SortableList`
Expected: FAIL — cannot find module `./SortableList`.

- [ ] **Step 4: Implement `SortableList`**

```tsx
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Called with the source and destination indices after a drag (compatible with RHF `move`). */
  onReorder: (oldIndex: number, newIndex: number) => void;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
}

/**
 * Reusable vertical drag-to-reorder list. Encapsulates DndContext + SortableContext
 * (pointer + keyboard sensors, vertical-axis modifier) and renders each item via a
 * render-prop that receives a labeled drag handle. One implementation, many call sites.
 * DndContext/SortableContext render no DOM nodes, so each item's wrapper is a direct
 * child of wherever <SortableList> is placed (parent `space-y-*` spacing is preserved).
 */
export function SortableList<T>({ items, getId, onReorder, children }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem key={getId(item)} id={getId(item)}>
            {(handle) => children(item, handle, index)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

/** Respect prefers-reduced-motion: drop the transform transition when the user opts out. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function SortableItem({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion() ? undefined : transition,
  };
  const handle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-10 opacity-80")}>
      {children(handle)}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:client -- SortableList`
Expected: PASS. Then `npm run typecheck` — green.

- [ ] **Step 6: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 3: Sortable Work Experience entries

**Files:**
- Modify: `client/src/features/editor/sections/ExperienceSection.tsx`

- [ ] **Step 1: Add `move` + `SortableList` and place the handle in the header**

Replace the body of `ExperienceSection`. Changes: destructure `move` from `useFieldArray`; wrap the `fields.map` in `<SortableList>`; put `{handle}` left of the "Position N" label.

```tsx
import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SortableList } from "@/components/ui/SortableList";

import { BulletEditor } from "../components/BulletEditor";
import { newWorkItem, type EditorValues } from "../editorSchema";

export function ExperienceSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "content.workExperience" });

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">No experience added yet.</p>
      )}
      <SortableList items={fields} getId={(f) => f.id} onReorder={move}>
        {(_f, handle, i) => {
          const e = errors.content?.workExperience?.[i];
          return (
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Position {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove position"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Company" htmlFor={`w-${i}-company`} error={e?.company?.message}>
                  <Input id={`w-${i}-company`} {...register(`content.workExperience.${i}.company`)} />
                </Field>
                <Field label="Position" htmlFor={`w-${i}-position`} error={e?.position?.message}>
                  <Input id={`w-${i}-position`} {...register(`content.workExperience.${i}.position`)} />
                </Field>
                <Field label="Location" htmlFor={`w-${i}-location`} error={e?.location?.message}>
                  <Input id={`w-${i}-location`} {...register(`content.workExperience.${i}.location`)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" htmlFor={`w-${i}-start`} error={e?.startDate?.message}>
                    <Input
                      id={`w-${i}-start`}
                      placeholder="2022-01"
                      {...register(`content.workExperience.${i}.startDate`)}
                    />
                  </Field>
                  <Field label="End" htmlFor={`w-${i}-end`} error={e?.endDate?.message} hint="blank = current">
                    <Input
                      id={`w-${i}-end`}
                      placeholder="2024-06"
                      {...register(`content.workExperience.${i}.endDate`)}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-3">
                <span className="mb-1.5 block text-sm font-semibold text-foreground">Bullets</span>
                <Controller
                  control={control}
                  name={`content.workExperience.${i}.bullets`}
                  render={({ field }) => (
                    <BulletEditor value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          );
        }}
      </SortableList>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => append(newWorkItem())}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" /> Add experience
      </Button>
    </div>
  );
}
```

> Note: the render-prop's first arg `_f` (the RHF field object) is unused because all inputs key off the array index `i`; `register(...)` resolves the live value. The stable id used by DnD is `getId={(f) => f.id}`.

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint`
Expected: green. Manually verify in `npm run dev`: a grip handle appears in each Position header; dragging reorders entries and the preview updates. Do not commit.

---

## Task 4: Sortable Education entries

**Files:**
- Modify: `client/src/features/editor/sections/EducationSection.tsx`

- [ ] **Step 1: Add `move` + `SortableList` + handle**

Apply the same transform as Task 3 to `EducationSection`: import `SortableList`, destructure `move`, wrap the `fields.map` body in `<SortableList items={fields} getId={(f) => f.id} onReorder={move}>{(_f, handle, i) => { const e = errors.content?.education?.[i]; return (...same card...) }}</SortableList>`, and add the handle to the header:

```tsx
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Education {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove education"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
```

Keep everything else (the `grid` of School/Degree/Field/Graduated/GPA fields, the `append(newEducationItem())` button) exactly as-is, just relocated inside the render-prop. Add `import { SortableList } from "@/components/ui/SortableList";` and change `const { fields, append, remove } = useFieldArray(...)` to `const { fields, append, remove, move } = useFieldArray(...)`.

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. `npm run dev`: education entries reorder via the handle. Do not commit.

---

## Task 5: Sortable Projects entries

**Files:**
- Modify: `client/src/features/editor/sections/ProjectsSection.tsx`

- [ ] **Step 1: Add `move` + `SortableList` + handle**

Same transform on `ProjectsSection`: import `SortableList`, destructure `move`, wrap the `fields.map` body in `<SortableList items={fields} getId={(f) => f.id} onReorder={move}>{(_f, handle, i) => { const e = errors.content?.projects?.[i]; return (...same card...) }}</SortableList>`, header becomes:

```tsx
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {handle}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project {i + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove project"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
```

Keep the Name/Description/URL fields and the Technologies `Controller`/`TagInput` and the `append(newProjectItem())` button unchanged inside the render-prop. Change `useFieldArray` destructure to include `move`.

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. `npm run dev`: projects reorder. Do not commit.

---

## Task 6: Sortable bullets in `BulletEditor` (stable internal ids)

**Files:**
- Modify: `client/src/features/editor/components/BulletEditor.tsx`

The form value stays `string[]`. `BulletEditor` keeps a ref-backed parallel array of stable ids so `@dnd-kit` has stable keys during a drag; reorder `arrayMove`s both the strings (via `onChange`) and the ids in lockstep.

- [ ] **Step 1: Reimplement `BulletEditor` with `SortableList`**

```tsx
import { arrayMove } from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { SortableList } from "@/components/ui/SortableList";
import { Textarea } from "@/components/ui/Textarea";
import { ImproveBulletButton } from "@/features/ai/ImproveBulletButton";

interface BulletEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function BulletEditor({ value, onChange }: BulletEditorProps) {
  // Stable per-bullet ids, parallel to `value`, so DnD keys survive edits/drags.
  // Synced positionally to the value length each render (add/remove/reorder keep
  // them in lockstep below; this also recovers if `value` is replaced externally).
  const idsRef = useRef<string[]>([]);
  while (idsRef.current.length < value.length) idsRef.current.push(makeId());
  if (idsRef.current.length > value.length) idsRef.current.length = value.length;
  const ids = idsRef.current;

  const update = (i: number, v: string) => onChange(value.map((b, idx) => (idx === i ? v : b)));
  const remove = (i: number) => {
    idsRef.current = ids.filter((_, idx) => idx !== i);
    onChange(value.filter((_, idx) => idx !== i));
  };
  const add = () => {
    idsRef.current = [...ids, makeId()];
    onChange([...value, ""]);
  };
  const reorder = (from: number, to: number) => {
    idsRef.current = arrayMove(ids, from, to);
    onChange(arrayMove(value, from, to));
  };

  const items = value.map((text, i) => ({ id: ids[i], text, index: i }));

  return (
    <div className="space-y-2">
      <SortableList items={items} getId={(it) => it.id} onReorder={reorder}>
        {(it) => (
          <div className="flex gap-2">
            {it.handle}
            <Textarea
              value={it.text}
              onChange={(e) => update(it.index, e.target.value)}
              rows={2}
              placeholder="Describe an accomplishment, ideally with a metric…"
              className="flex-1"
            />
            <ImproveBulletButton value={it.text} onAccept={(t) => update(it.index, t)} />
            <button
              type="button"
              onClick={() => remove(it.index)}
              aria-label="Remove bullet"
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </SortableList>
      {value.length < 12 && (
        <Button type="button" variant="ghost" size="sm" onClick={add} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add bullet
        </Button>
      )}
    </div>
  );
}
```

> The render-prop signature is `(item, handle, index)`. Above, the handle is the **second** positional arg — fix the destructure: use `{(it, handle) => (...)}` and place `{handle}` (not `it.handle`). Corrected JSX:
>
> ```tsx
>       <SortableList items={items} getId={(it) => it.id} onReorder={reorder}>
>         {(it, handle) => (
>           <div className="flex gap-2">
>             {handle}
>             ...
> ```
> (The `index` carried on `it.index` is what the `update`/`remove` closures use, so the third render-prop arg isn't needed here.)

- [ ] **Step 2: Verify existing BulletEditor usage still type-checks**

Run: `npm run typecheck`
Expected: green. `BulletEditor`'s public props (`value`, `onChange`) are unchanged, so `ExperienceSection`'s `Controller` keeps working.

- [ ] **Step 3: Run related tests**

Run: `npm run test:client -- ImproveBulletButton`
Expected: PASS (the AI button is still rendered per bullet). If a test queried bullet rows by structure, adjust only the test selectors, not behavior.

- [ ] **Step 4: Checkpoint** — `npm run lint` clean; `npm run dev`: bullets show a grip handle and reorder via drag + keyboard; editing a bullet does not reset others. Do not commit.

---

## Task 7: Theme store

**Files:**
- Create: `client/src/stores/theme.ts`
- Test: `client/src/stores/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, getSystemTheme, useThemeStore } from "./theme";

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: prefersDark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("getSystemTheme reads the OS preference", () => {
    mockMatchMedia(true);
    expect(getSystemTheme()).toBe("dark");
    mockMatchMedia(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("toggle flips the theme", () => {
    expect(useThemeStore.getState().theme).toBe("light");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("persists the theme to localStorage under srb-theme", () => {
    useThemeStore.getState().setTheme("dark");
    expect(localStorage.getItem("srb-theme")).toContain("dark");
  });

  it("applyTheme toggles the .dark class on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:client -- theme`
Expected: FAIL — cannot find module `./theme`.

- [ ] **Step 3: Implement the store**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

/** OS color-scheme preference; used as the first-visit default. */
export function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Toggle the `.dark` class on <html> to switch the app chrome theme. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * App-chrome theme store. Persists to localStorage (`srb-theme`); first visit with no
 * stored value defaults to the OS preference. The resume document stays light regardless
 * — `ResumeDocument` uses explicit paper/ink colors, not theme tokens.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getSystemTheme(),
      toggle: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "srb-theme" },
  ),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- theme`
Expected: PASS. Then `npm run typecheck` → green.

- [ ] **Step 5: Checkpoint** — `npm run lint` clean. Do not commit.

---

## Task 8: Apply the theme at app load

**Files:**
- Modify: `client/src/main.tsx`

- [ ] **Step 1: Apply on load + subscribe to changes**

Add imports and wiring before `createRoot`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { installAuthInterceptors } from "./api/interceptors";
import { queryClient } from "./api/queryClient";
import { applyTheme, useThemeStore } from "./stores/theme";
import "./index.css";

installAuthInterceptors();

// Apply the persisted/OS theme before first paint, then keep <html> in sync.
applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((s) => applyTheme(s.theme));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

> `persist` with the default `localStorage` storage rehydrates synchronously, so `getState().theme` already reflects a stored value here; on a true first visit it is the OS default from the store's initializer.

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` → green. `npm run dev`: with `localStorage` cleared and OS in dark mode, the app loads dark; reload preserves the choice. Do not commit.

---

## Task 9: Dark-mode toggle in `AppHeader`

**Files:**
- Modify: `client/src/components/layout/AppHeader.tsx`

- [ ] **Step 1: Add a sun/moon toggle button**

Add imports: `Moon, Sun` from `lucide-react` (alongside `FileText, LogOut`) and `import { useThemeStore } from "@/stores/theme";`. Read theme + toggle, and insert the button in the right-side cluster (before the account dropdown):

```tsx
import { FileText, LogOut, Moon, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { UsagePill } from "@/components/ui/UsagePill";
import { initials } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

export function AppHeader() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-header border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-semibold text-foreground">Resume Builder</span>
        </Link>

        <div className="flex items-center gap-4">
          {user?.ai_usage && (
            <UsagePill used={user.ai_usage.calls_today} limit={user.ai_usage.daily_limit} />
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Account menu"
            >
              {initials(user?.name ?? "")}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  logout();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Checkpoint**

Run: `npm run typecheck` and `npm run lint` → green. `npm run dev`: the sun/moon button toggles chrome between light/dark; the resume document and Export PDF stay light. Do not commit.

---

## Task 10: Verify whole suite, then docs + version

**Files:**
- Modify: root `package.json` (version), `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Full green gate**

Run (from repo root):
```bash
npm run test && npm run typecheck && npm run lint && npm run build
```
Expected: all green. The client test count grows by the new theme + ResumeDocument + SortableList tests. Fix any failures before proceeding.

- [ ] **Step 2: Bump version**

Edit root `package.json`: `"version": "0.9.0"` → `"version": "0.10.0"`.

- [ ] **Step 3: Update `CHANGELOG.md`**

Replace the `## [Unreleased]` block's placeholder and add a new section above `## [0.9.0]`:

```markdown
## [Unreleased]

_Phase 10 — AWS deploy (ECS Fargate + ECR + ALB + RDS + Secrets Manager + GitHub Actions) next._

## [0.10.0] - 2026-06-29

Feature A — editor & document polish (client-only; no backend/schema changes).

### Added
- **Drag-to-reorder** with `@dnd-kit`: a reusable `SortableList` (render-prop drag handle, pointer +
  keyboard sensors, vertical-axis modifier) powers reordering of Work Experience, Education, and
  Projects entries (RHF `useFieldArray.move()`) and bullets within a work experience (stable
  ref-backed ids over the `string[]` value). Existing autosave persists the new order.
- **Dark-mode toggle** for the app chrome: a Zustand + `persist` `theme` store (`srb-theme`, defaults
  to the OS preference) toggles the `.dark` class on `<html>`; a sun/moon button in `AppHeader`. The
  resume document and exported PDF stay light (explicit paper/ink colors, not theme tokens).
- Tests: theme store (toggle/persist/OS-default/apply), `ResumeDocument` headline present/absent,
  `SortableList` render + labeled handles.

### Notes
- The resume document already rendered `personalInfo.headline` under the name (Classic-centered /
  Modern-left); this cycle adds its test coverage.
```

Then update the compare links at the bottom of `CHANGELOG.md`: add a `[0.10.0]` link and point `[Unreleased]` at `v0.10.0...HEAD` (mirror the existing link format).

- [ ] **Step 4: Update `CLAUDE.md` phase status**

Add a line under the Phase status list (after the Phase 9 entry) marking this cycle done:

```markdown
- ✅ Feature A — editor polish (`0.10.0`): headline in the resume document, `@dnd-kit` drag-to-reorder
  (experience/education/projects entries + work bullets via a reusable `SortableList`), app-chrome
  dark-mode toggle (Zustand `theme` store → `.dark` on `<html>`; document/PDF stay light).
```

- [ ] **Step 5: Final checkpoint**

Run: `npm run test && npm run build`
Expected: green. **STOP — do not commit.** Report to James for review; he commits himself.

---

## Self-review notes

- **Spec coverage:** item 1 headline → Task 1 (impl pre-exists, tests added); item 2 drag-reorder → Tasks 2–6 (`SortableList` + 3 entry sections + bullets); item 3 dark mode → Tasks 7–9 (store, apply, toggle); testing/docs → Task 10. Non-goals (skill chips, dark document, landing-nav toggle) are respected — no changes there.
- **Accessibility:** drag handles are `<button aria-label="Drag to reorder">`; `@dnd-kit` provides keyboard sensor + ARIA announcements; transition gated behind `prefers-reduced-motion`; toggle has an action-reflecting `aria-label`.
- **Tokens/no hex:** all new chrome uses token classes (`border-border`, `bg-surface`, `text-muted-foreground`, `ring-ring`); `ResumeDocument` is untouched and stays light.
- **Commits:** none — every Task ends in a Checkpoint; James reviews and commits.
