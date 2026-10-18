import { useState } from "react";

import { ConfirmDialog } from "./ConfirmDialog";

export interface DiscardCopy {
  title?: string;
  description?: string;
  confirmLabel?: string;
}

/**
 * Gate an action that would throw away unsaved work (usually an AI result) behind
 * a confirm dialog. `confirm(when, action)` runs `action` straight away when
 * `when` is false; otherwise it asks first. Render `dialog` once in the component.
 */
export function useDiscardConfirm({
  title = "Discard AI suggestions?",
  description = "You'll lose what was generated. This can't be undone.",
  confirmLabel = "Discard",
}: DiscardCopy = {}) {
  const [pending, setPending] = useState<(() => void) | null>(null);

  const confirm = (when: boolean, action: () => void) => {
    if (when) setPending(() => action);
    else action();
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o) setPending(null);
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive
      onConfirm={() => {
        const action = pending;
        setPending(null);
        action?.();
      }}
    />
  );

  return { confirm, dialog };
}
