import type { ReactNode } from "react";

import { Label } from "./Label";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** Optional element rendered on the right of the label row (e.g. "Forgot?"). */
  action?: ReactNode;
  children: ReactNode;
}

/** Label + control + error/hint, following the form rules in docs/DESIGN.md. */
export function Field({ label, htmlFor, error, hint, action, children }: FieldProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
