/** Suggested title for a new saved cover letter; the user can rename it. */
export function defaultCoverLetterTitle(resumeTitle: string): string {
  const base = resumeTitle.trim() || "Untitled";
  return `${base} — cover letter`;
}
