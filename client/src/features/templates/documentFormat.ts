/** Shared formatting helpers for the résumé document and its exports, so the rendered
 * preview, the PDF, the DOCX, and the plain-text output all read identically. */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2022-01" → "Jan 2022". Blank → "". Non-YYYY-MM passes through unchanged. */
export function formatMonth(value?: string | null): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : m[1];
}

/** "Jan 2022 – Present" / "Jan 2022 – Mar 2024". Blank start → "". */
export function dateRange(start?: string, end?: string | null): string {
  const s = formatMonth(start);
  if (!s) return "";
  return `${s} – ${end ? formatMonth(end) : "Present"}`;
}

/** Join the non-blank parts with a separator. */
export function joinTruthy(parts: (string | undefined)[], sep: string): string {
  return parts.filter((p) => p && p.trim()).join(sep);
}
