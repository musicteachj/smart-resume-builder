import { RefreshCw, Wand2 } from "lucide-react";
import { useState } from "react";

import { useImproveBullet } from "@/api/generated/ai/ai";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";

/** Per-bullet "Improve with AI" — before/after with Accept / Regenerate. */
export function ImproveBulletButton({
  value,
  onAccept,
}: {
  value: string;
  onAccept: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState("");
  const improve = useImproveBullet();

  const run = async () => {
    setError("");
    setSuggestion("");
    try {
      const res = await improve.mutateAsync({ data: { text: value } });
      setSuggestion(res.suggestion);
      applyAiUsage(res.ai_usage);
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const start = () => {
    setOpen(true);
    void run();
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={!value.trim()}
        aria-label="Improve with AI"
        title={value.trim() ? "Improve with AI" : "Write a bullet first"}
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Wand2 className="h-4 w-4" />
      </button>

      <Modal open={open} onOpenChange={setOpen} title="Improve with AI">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
            <p className="rounded-md border border-border bg-surface-variant p-3 text-sm text-muted-foreground">
              {value}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Suggested</p>
            {improve.isPending ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" /> Generating…
              </div>
            ) : error ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="rounded-md border border-border bg-surface p-3 text-sm text-foreground">{suggestion}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => void run()} disabled={improve.isPending} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Regenerate
            </Button>
            <Button
              size="sm"
              disabled={improve.isPending || !suggestion}
              onClick={() => {
                onAccept(suggestion);
                setOpen(false);
              }}
            >
              Accept
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
