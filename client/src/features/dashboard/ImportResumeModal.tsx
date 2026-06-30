import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useParseResume } from "@/api/generated/ai/ai";
import type { ResumeContent } from "@/api/generated/model";
import { useCreateResume } from "@/api/generated/resumes/resumes";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { aiErrorMessage } from "@/features/ai/aiError";
import { applyAiUsage } from "@/features/ai/aiUsage";
import { ResumeDocument } from "@/features/templates/ResumeDocument";
import { extractResumeText } from "@/lib/extractResumeText";

type Step = "input" | "parsing" | "review";

export function ImportResumeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const parse = useParseResume();
  const create = useCreateResume();
  const [step, setStep] = useState<Step>("input");
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [parsedContent, setParsedContent] = useState<ResumeContent | null>(null);

  const reset = () => {
    setStep("input");
    setFile(null);
    setPasted("");
    setError("");
    setParsedContent(null);
  };

  const runParse = async () => {
    setError("");
    setStep("parsing");
    try {
      const text = file ? await extractResumeText(file) : pasted.trim();
      if (text.length < 30) throw new Error("Add a file or paste your résumé text first.");
      const res = await parse.mutateAsync({ data: { text } });
      applyAiUsage(res.ai_usage);
      setParsedContent(res.content);
      setStep("review");
    } catch (err) {
      setError(aiErrorMessage(err));
      setStep("input");
    }
  };

  const confirm = async () => {
    if (!parsedContent) return;
    const created = await create.mutateAsync({
      data: { title: "Imported resume", template: "classic", content: parsedContent },
    });
    navigate(`/resumes/${created.id}`);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="lg"
      title="Import a resume"
      description="Upload a PDF or DOCX, or paste the text. Claude structures it — you review before anything is created."
    >
      {step === "review" && parsedContent ? (
        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-white">
            <div className="pointer-events-none origin-top-left" style={{ width: 816, transform: "scale(0.62)" }}>
              <ResumeDocument content={parsedContent} template="classic" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Start over
            </Button>
            <Button size="sm" disabled={create.isPending} onClick={confirm}>
              Open in editor
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            type="file"
            accept=".pdf,.docx"
            aria-label="Upload résumé file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-surface-variant"
          />
          <div className="text-center text-xs text-muted-foreground">or</div>
          <Textarea
            aria-label="Paste resume text"
            placeholder="Paste your resume text here…"
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {step === "parsing" && (
              <span className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" /> {file ? "Reading file…" : "Parsing with AI…"}
              </span>
            )}
            <Button
              size="sm"
              disabled={step === "parsing" || (!file && pasted.trim().length < 30)}
              onClick={runParse}
            >
              Parse résumé
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
