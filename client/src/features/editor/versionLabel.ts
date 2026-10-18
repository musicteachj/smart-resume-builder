import type { ResumeVersionKindEnum, ResumeVersionList } from "@/api/generated/model";

/** What a version is when it has no user-given name. */
const KIND_TEXT: Record<ResumeVersionKindEnum, string> = {
  auto: "Automatic checkpoint",
  manual: "Saved version",
  restore: "Before restoring an earlier version",
  ai: "Before an AI change",
};

export function versionTitle(v: Pick<ResumeVersionList, "kind" | "label">): string {
  return v.label || KIND_TEXT[v.kind];
}

/** Time of day in the user's locale, e.g. "3:42 PM". */
export function versionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", or a short date (with the year only when it isn't this year). */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Group an already newest-first list into consecutive day sections. */
export function groupByDay<T extends { created_at: string }>(
  versions: T[],
  now: Date = new Date(),
): { heading: string; versions: T[] }[] {
  const groups: { heading: string; versions: T[] }[] = [];
  for (const v of versions) {
    const heading = dayHeading(v.created_at, now);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.versions.push(v);
    else groups.push({ heading, versions: [v] });
  }
  return groups;
}
