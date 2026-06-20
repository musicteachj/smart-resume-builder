import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

/** ATS match-score gauge. Bands always pair color WITH a text label + icon
 * (never color alone) per docs/DESIGN.md. success ≠ accent. */
function band(score: number) {
  if (score >= 75) {
    return { label: "Strong", text: "text-success", bar: "bg-success", Icon: CheckCircle2 };
  }
  if (score >= 50) {
    return { label: "Good", text: "text-warning", bar: "bg-warning", Icon: TrendingUp };
  }
  return { label: "Needs work", text: "text-destructive", bar: "bg-destructive", Icon: AlertTriangle };
}

export function ScoreMeter({ score }: { score: number }) {
  const b = band(score);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="rounded-lg border border-border bg-surface-variant p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{pct}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", b.text)}>
          <b.Icon className="h-4 w-4" aria-hidden />
          {b.label}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`ATS match score ${pct} of 100 — ${b.label}`}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300", b.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        ATS fit: under 50 needs work · 50–74 good · 75+ strong. Applying suggestions raises your score.
      </p>
    </div>
  );
}
