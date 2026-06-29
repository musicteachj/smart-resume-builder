import { arrayMove } from "@dnd-kit/sortable";
import { Plus, X } from "lucide-react";
import { useState } from "react";

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
  // add/remove/reorder keep them in lockstep with `value` below. If `value` is
  // replaced externally with a different length (e.g. an AI tailor result), we
  // reconcile during render (React's "adjust state from props" pattern), reusing
  // overlapping ids and minting new ones for added rows.
  const [storedIds, setStoredIds] = useState<string[]>(() => value.map(makeId));
  let ids = storedIds;
  if (ids.length !== value.length) {
    ids = value.map((_, i) => storedIds[i] ?? makeId());
    setStoredIds(ids);
  }

  const update = (i: number, v: string) => onChange(value.map((b, idx) => (idx === i ? v : b)));
  const remove = (i: number) => {
    setStoredIds(ids.filter((_, idx) => idx !== i));
    onChange(value.filter((_, idx) => idx !== i));
  };
  const add = () => {
    setStoredIds([...ids, makeId()]);
    onChange([...value, ""]);
  };
  const reorder = (from: number, to: number) => {
    setStoredIds(arrayMove(ids, from, to));
    onChange(arrayMove(value, from, to));
  };

  const items = value.map((text, i) => ({ id: ids[i], text, index: i }));

  return (
    <div className="space-y-2">
      <SortableList items={items} getId={(it) => it.id} onReorder={reorder}>
        {(it, handle) => (
          <div className="flex gap-2">
            {handle}
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
