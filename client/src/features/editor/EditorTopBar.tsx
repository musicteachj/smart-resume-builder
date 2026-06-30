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
  const documentFont = watch("documentFont");
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
        fontValue={documentFont}
        onSelectFont={(id) => setValue("documentFont", id, { shouldDirty: true })}
      />
    </div>
  );
}
