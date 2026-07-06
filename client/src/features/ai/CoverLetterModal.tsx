import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useGenerateCoverLetter } from "@/api/generated/ai/ai";
import type { ResumeContent } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import type { EditorValues } from "@/features/editor/editorSchema";
import { downloadBlob, safeFileName } from "@/lib/download";
import { extractFileText } from "@/lib/extractFileText";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";

/** Generate a tailored cover letter from the résumé + a pasted/uploaded job description. */
export function CoverLetterModal({ onClose }: { onClose: () => void }) {
  const { getValues } = useFormContext<EditorValues>();
  const gen = useGenerateCoverLetter();
  const [jd, setJd] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [copied, setCopied] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setReading(true);
    try {
      setJd(await extractFileText(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : aiErrorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const generate = async () => {
    setError("");
    try {
      const res = await gen.mutateAsync({
        data: { content: getValues("content") as unknown as ResumeContent, job_description: jd },
      });
      applyAiUsage(res.ai_usage);
      setLetter(res.cover_letter);
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(letter ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const name = `${safeFileName(getValues("title"))}-cover-letter.txt`;
    downloadBlob(name, new Blob([letter ?? ""], { type: "text/plain;charset=utf-8" }));
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="lg"
      title="Generate cover letter"
      description="A tailored cover letter drafted from your résumé and the job description."
    >
      {letter === null ? (
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
            rows={9}
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
            <Button onClick={() => void generate()} loading={gen.isPending} disabled={reading || jd.trim().length < 20}>
              Generate cover letter
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Textarea
            aria-label="Cover letter"
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            rows={16}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setLetter(null)} disabled={gen.isPending}>
              New
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void copy()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={download}>
                <Download className="h-4 w-4" /> Download .txt
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
