import { useFormContext } from "react-hook-form";

import { Textarea } from "@/components/ui/Textarea";

import type { EditorValues } from "../editorSchema";

export function SummarySection() {
  const {
    register,
    formState: { errors },
  } = useFormContext<EditorValues>();
  const error = errors.content?.summary?.message;

  return (
    <div>
      <Textarea
        rows={4}
        placeholder="A 2–3 sentence professional overview…"
        {...register("content.summary")}
      />
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Aim for 2–3 sentences. The AI menu can draft this from your experience.
        </p>
      )}
    </div>
  );
}
