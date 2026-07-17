import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useGenerateCoverLetter } from "@/api/generated/ai/ai";
import { useCreateCoverLetter, usePatchCoverLetter } from "@/api/generated/cover-letters/cover-letters";
import type { CoverLetter, ResumeContent } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import type { EditorValues } from "@/features/editor/editorSchema";
import { downloadBlob, safeFileName } from "@/lib/download";
import { extractFileText } from "@/lib/extractFileText";

import { aiErrorMessage } from "./aiError";
import { applyAiUsage } from "./aiUsage";
import { defaultCoverLetterTitle } from "./coverLetters";

interface Props {
  resumeId: string;
  /** null = create a new letter; otherwise edit this one. */
  letter: CoverLetter | null;
  /** Parent invalidates the list + returns to it. */
  onSaved: () => void;
  onBack: () => void;
}

/** Generate a new cover letter from a JD, or edit an existing saved one, then save it. */
export function CoverLetterEditor({ resumeId, letter, onSaved, onBack }: Props) {
  const { getValues } = useFormContext<EditorValues>();
  const gen = useGenerateCoverLetter();
  const create = useCreateCoverLetter();
  const patch = usePatchCoverLetter();

  const [jd, setJd] = useState(letter?.job_description ?? "");
  const [title, setTitle] = useState(letter?.title ?? defaultCoverLetterTitle(getValues("title")));
  const [body, setBody] = useState<string | null>(letter?.body ?? null);
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
      setBody(res.cover_letter);
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const save = async () => {
    setError("");
    try {
      if (letter) {
        await patch.mutateAsync({ id: letter.id, data: { title, body: body ?? "", job_description: jd } });
      } else {
        await create.mutateAsync({ data: { resume: resumeId, title, body: body ?? "", job_description: jd } });
      }
      onSaved();
    } catch (err) {
      setError(aiErrorMessage(err));
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(body ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    downloadBlob(
      `${safeFileName(title)}.txt`,
      new Blob([body ?? ""], { type: "text/plain;charset=utf-8" }),
    );
  };

  // New letter, before generation: job-description input.
  if (body === null) {
    return (
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
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {reading ? (
              <span className="flex items-center gap-2"><Spinner className="h-4 w-4" /> Reading file…</span>
            ) : (
              "Uses 1 of your daily AI credits."
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
          <Button onClick={() => void generate()} loading={gen.isPending} disabled={reading || jd.trim().length < 20}>
            Generate
          </Button>
        </div>
      </div>
    );
  }

  // Have a body (generated or existing): title + editable body + save/export.
  const saving = create.isPending || patch.isPending;
  return (
    <div className="space-y-4">
      <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea aria-label="Cover letter" value={body} onChange={(e) => setBody(e.target.value)} rows={16} />
      {letter && jd && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Job description</summary>
          <p className="mt-2 whitespace-pre-wrap">{jd}</p>
        </details>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={saving}>Back</Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={download}>
            <Download className="h-4 w-4" /> Download .txt
          </Button>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!body.trim() || !title.trim()}>Save</Button>
        </div>
      </div>
    </div>
  );
}
