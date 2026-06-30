import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useTailorJd } from "@/api/generated/ai/ai";
import type { ResumeContent, TailorJDResponse, TailorSuggestion } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import type { EditorValues } from "@/features/editor/editorSchema";
import { extractFileText } from "@/lib/extractFileText";
import { cn } from "@/lib/utils";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";
import { ScoreMeter } from "./ScoreMeter";

export function TailorModal({ onClose }: { onClose: () => void }) {
  const { getValues, setValue } = useFormContext<EditorValues>();
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<TailorJDResponse | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [appliedBullets, setAppliedBullets] = useState<Set<string>>(new Set());
  const [addedKeywords, setAddedKeywords] = useState<Set<string>>(new Set());
  const tailor = useTailorJd();

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      setJd(await extractFileText(file));
    } catch (err) {
      // extractFileText throws user-friendly messages (unsupported type, scanned/empty);
      // surface them directly rather than the generic AI-error fallback.
      setError(err instanceof Error ? err.message : aiErrorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const analyze = async () => {
    setError("");
    try {
      const res = await tailor.mutateAsync({
        data: { content: getValues("content") as unknown as ResumeContent, job_description: jd },
      });
      setResult(res);
      setAppliedBullets(new Set());
      setAddedKeywords(new Set());
      applyAiUsage(res.ai_usage);
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const applySuggestion = (s: TailorSuggestion) => {
    const [workId, idxStr] = s.bullet_id.split("::");
    const bi = Number(idxStr);
    const work = getValues("content.workExperience");
    const wi = work.findIndex((w) => w.id === workId);
    if (wi >= 0 && Number.isInteger(bi) && bi >= 0 && bi < work[wi].bullets.length) {
      setValue(`content.workExperience.${wi}.bullets.${bi}`, s.suggested, { shouldDirty: true });
      setAppliedBullets((prev) => new Set(prev).add(s.bullet_id));
    }
  };

  const addKeyword = (kw: string) => {
    const skills = getValues("content.skills");
    if (!skills.includes(kw)) setValue("content.skills", [...skills, kw], { shouldDirty: true });
    setAddedKeywords((prev) => new Set(prev).add(kw));
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="lg"
      title="Tailor to job description"
      description="Paste a job description — we'll score the match and suggest stronger, role-specific bullets."
    >
      {!result ? (
        <div className="space-y-4">
          <input
            type="file"
            accept=".pdf,.docx"
            aria-label="Upload job description file"
            onChange={(e) => void readFile(e.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-surface-variant"
          />
          <div className="text-center text-xs text-muted-foreground">or paste below</div>
          <Textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            rows={10}
            placeholder="Paste the full job description here…"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted-foreground">
              {reading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" /> Reading file…
                </span>
              ) : (
                "Uses 1 of your daily AI credits."
              )}
            </span>
            <Button
              onClick={() => void analyze()}
              loading={tailor.isPending}
              disabled={reading || jd.trim().length < 20}
            >
              Analyze match
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ScoreMeter score={result.match_score} />

          {result.missing_keywords.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Missing keywords</h3>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                From the posting, not yet in your resume. Tap to add to Skills.
              </p>
              <div className="flex flex-wrap gap-2">
                {result.missing_keywords.map((kw) => {
                  const added = addedKeywords.has(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => addKeyword(kw)}
                      disabled={added}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        added
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning hover:bg-warning/20",
                      )}
                    >
                      {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Suggested rewrites</h3>
              <div className="space-y-3">
                {result.suggestions.map((s) => {
                  const applied = appliedBullets.has(s.bullet_id);
                  return (
                    <div key={s.bullet_id} className="overflow-hidden rounded-lg border border-border">
                      <div className="border-b border-border bg-surface-variant px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.current}</p>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Suggested</p>
                        <p className="mt-0.5 text-sm text-foreground">{s.suggested}</p>
                        {s.adds.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">Adds:</span>
                            {s.adds.map((a) => (
                              <span key={a} className="rounded-sm bg-surface-variant px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex justify-end">
                          {applied ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                              <Check className="h-4 w-4" /> Applied
                            </span>
                          ) : (
                            <Button size="sm" onClick={() => applySuggestion(s)}>
                              Accept
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setResult(null)} disabled={tailor.isPending}>
              New analysis
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
