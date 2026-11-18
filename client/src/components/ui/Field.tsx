import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

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

type DescribableProps = { "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

/** Label + control + error/hint, following the form rules in docs/DESIGN.md. */
export function Field({ label, htmlFor, error, hint, action, children }: FieldProps) {
  const messageId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  // Tie the error (or hint) to the control, so a screen reader reads it with the field and
  // announces the field as invalid. Props the control already sets win.
  const control =
    isValidElement<DescribableProps>(children) && messageId
      ? cloneElement(children as ReactElement<DescribableProps>, {
          "aria-describedby": children.props["aria-describedby"] ?? messageId,
          "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
        })
      : children;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {action}
      </div>
      {control}
      {error ? (
        <p id={messageId} role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
