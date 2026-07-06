import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useAtsHealthCheck } from "@/api/generated/ai/ai";
import type { ResumeContent } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { EditorValues } from "@/features/editor/editorSchema";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";
import { ScoreMeter } from "./ScoreMeter";

/** ATS health check — scores the current résumé (no job description) and lists fixes. */
export function AtsHealthModal({ onClose }: { onClose: () => void }) {
  const { getValues } = useFormContext<EditorValues>();
  const check = useAtsHealthCheck();
  const result = check.data;
  const error = check.isError ? aiErrorMessage(check.error) : "";

  const run = () => {
    check.mutate(
      { data: { content: getValues("content") as unknown as ResumeContent } },
      { onSuccess: (res) => applyAiUsage(res.ai_usage) },
    );
  };

  // Run once when the modal opens.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="lg"
      title="ATS health check"
      description="An ATS-readiness score for your résumé, with specific fixes — no job description needed."
    >
      <div className="space-y-5">
        {check.isPending ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Analyzing your résumé…
          </div>
        ) : error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : result ? (
          <>
            <ScoreMeter score={result.score} />

            {result.issues.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Issues</h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.issues.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-foreground">
                  {result.recommendations.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" size="sm" onClick={run} disabled={check.isPending} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Re-check
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
