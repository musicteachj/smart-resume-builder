import { AlertCircle, Check } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

import type { SaveStatus } from "../useAutosave";

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: "Saved", className: "text-muted-foreground" },
    saving: { icon: <Spinner className="h-3.5 w-3.5" />, text: "Saving…", className: "text-muted-foreground" },
    unsaved: { icon: null, text: "Unsaved changes", className: "text-muted-foreground" },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, text: "Couldn't save", className: "text-destructive" },
  }[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs", map.className)}
      aria-live="polite"
    >
      {map.icon}
      {map.text}
    </span>
  );
}
