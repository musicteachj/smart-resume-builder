import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useGenerateSummary } from "@/api/generated/ai/ai";
import type { ResumeContent } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { EditorValues } from "@/features/editor/editorSchema";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";

export function GenerateSummaryModal({ onClose }: { onClose: () => void }) {
  const { getValues, setValue } = useFormContext<EditorValues>();
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const gen = useGenerateSummary();
  const current = getValues("content.summary");

  const run = async () => {
    try {
      const res = await gen.mutateAsync({
        data: { content: getValues("content") as unknown as ResumeContent },
      });
      setSummary(res.summary);
      applyAiUsage(res.ai_usage);
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const regenerate = () => {
    setSummary("");
    setError("");
    void run();
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Generate summary"
      description="Drafted from your experience, skills, and education."
    >
      <div className="space-y-4">
        {current && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
            <p className="rounded-md border border-border bg-surface-variant p-3 text-sm text-muted-foreground">
              {current}
            </p>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Suggested</p>
          {gen.isPending ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Drafting…
            </div>
          ) : error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : (
            <p className="rounded-md border border-border bg-surface p-3 text-sm leading-relaxed text-foreground">
              {summary}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={regenerate} disabled={gen.isPending} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Regenerate
          </Button>
          <Button
            size="sm"
            disabled={gen.isPending || !summary}
            onClick={() => {
              setValue("content.summary", summary, { shouldDirty: true });
              onClose();
            }}
          >
            Use this summary
          </Button>
        </div>
      </div>
    </Modal>
  );
}
