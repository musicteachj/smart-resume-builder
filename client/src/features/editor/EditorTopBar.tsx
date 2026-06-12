import { ArrowLeft, Download, Sparkles } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";

import { SaveIndicator } from "./components/SaveIndicator";
import { TemplateSwitcher } from "./components/TemplateSwitcher";
import type { EditorValues } from "./editorSchema";
import type { SaveStatus } from "./useAutosave";

export function EditorTopBar({ status }: { status: SaveStatus }) {
  const navigate = useNavigate();
  const { register, watch, setValue } = useFormContext<EditorValues>();
  const template = watch("template");

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
        <TemplateSwitcher
          value={template}
          onChange={(t) => setValue("template", t, { shouldDirty: true })}
        />
        <Button variant="secondary" size="sm" disabled title="AI assist — coming in Phase 7" className="gap-1.5">
          <Sparkles className="h-4 w-4" /> AI
        </Button>
        <Button size="sm" disabled title="PDF export — coming in Phase 6" className="gap-1.5">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>
    </div>
  );
}
