import * as D from "@radix-ui/react-dialog";

import { Button } from "./Button";
import { useReturnFocus } from "./useReturnFocus";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Shown in the dialog (the action failed); the dialog stays open so the user can retry. */
  error?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-modal bg-foreground/50 backdrop-blur-[1px]" />
        <D.Content
          {...returnFocus}
          className="fixed left-1/2 top-1/2 z-modal w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-heavy focus:outline-none"
        >
          <D.Title className="font-display text-lg font-semibold text-foreground">
            {title}
          </D.Title>
          {description && (
            <D.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </D.Description>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? "destructive" : "primary"}
              size="sm"
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
