/** The reorderable content sections of a résumé (the header is always pinned at the top). */
export const SECTION_KEYS = ["summary", "experience", "education", "skills", "projects"] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** The canonical order used when a résumé has no custom order saved. */
export const DEFAULT_SECTION_ORDER: SectionKey[] = [...SECTION_KEYS];

/**
 * Coerce a stored order into a complete, de-duplicated list of known section keys:
 * keep the saved order, drop anything unknown, and append any missing keys in canonical
 * order (forward-compatible if sections are ever added). An empty/absent order → canonical.
 */
export function normalizeSectionOrder(order?: string[] | null): SectionKey[] {
  const known = new Set<string>(SECTION_KEYS);
  const seen = new Set<SectionKey>();
  const result: SectionKey[] = [];
  for (const key of order ?? []) {
    if (known.has(key) && !seen.has(key as SectionKey)) {
      result.push(key as SectionKey);
      seen.add(key as SectionKey);
    }
  }
  for (const key of DEFAULT_SECTION_ORDER) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}
