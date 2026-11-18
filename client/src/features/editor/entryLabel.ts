/**
 * What a repeated editor entry is called in its controls' accessible names ("Remove Acme
 * Corp", "Reorder Acme Corp", "Bullet 1 from Acme Corp"): the first non-blank candidate
 * (for a job, the company, then the title), else a numbered fallback ("job 2"). Never
 * "position N", which would read as a place in the list.
 */
export function entryLabel(candidates: (string | null | undefined)[], fallback: string): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}
