import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Optional drag handle, rendered left of the title (kept outside the toggle button). */
  handle?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  handle,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center">
        {handle && <span className="pl-2">{handle}</span>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span>
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            {description && (
              <span className="block text-xs text-muted-foreground">{description}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
