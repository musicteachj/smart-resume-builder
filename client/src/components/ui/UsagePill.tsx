import { Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Compact "n / limit today" AI-usage indicator (see docs/DESIGN.md). */
export function UsagePill({ used, limit }: { used: number; limit: number }) {
  const nearLimit = used >= limit;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium",
        nearLimit ? "text-warning" : "text-muted-foreground",
      )}
      title={`${used} of ${limit} AI calls used today`}
    >
      <Wand2 className="h-3.5 w-3.5" aria-hidden />
      {used} / {limit} today
    </span>
  );
}
