import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ImproveBulletButton } from "@/features/ai/ImproveBulletButton";

interface BulletEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function BulletEditor({ value, onChange }: BulletEditorProps) {
  const update = (i: number, v: string) => onChange(value.map((b, idx) => (idx === i ? v : b)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, ""]);

  return (
    <div className="space-y-2">
      {value.map((bullet, i) => (
        <div key={i} className="flex gap-2">
          <Textarea
            value={bullet}
            onChange={(e) => update(i, e.target.value)}
            rows={2}
            placeholder="Describe an accomplishment, ideally with a metric…"
            className="flex-1"
          />
          <ImproveBulletButton value={bullet} onAccept={(t) => update(i, t)} />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove bullet"
            className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {value.length < 12 && (
        <Button type="button" variant="ghost" size="sm" onClick={add} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add bullet
        </Button>
      )}
    </div>
  );
}
