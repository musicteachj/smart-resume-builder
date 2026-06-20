import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Generic Radix dialog shell for richer modals (AI assist, tailor-to-JD). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-modal bg-foreground/50 backdrop-blur-[1px]" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-modal max-h-[90vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-heavy focus:outline-none",
            size === "lg" ? "max-w-2xl" : "max-w-md",
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <D.Title className="font-display text-lg font-semibold text-foreground">
                {title}
              </D.Title>
              {description && (
                <D.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </D.Description>
              )}
            </div>
            <D.Close
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
