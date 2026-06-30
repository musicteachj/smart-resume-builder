import type { ResumeContent, TailorSuggestion } from "@/api/generated/model";

/**
 * Apply accepted tailoring to a résumé's content, returning a new content object
 * (pure — does not mutate the input). Bullet suggestions are matched by `bullet_id`
 * ("workId::index"); missing keywords are appended to skills if not already present.
 * Used for the "save as a tailored copy" flow (the in-place editor path applies the
 * same changes through React Hook Form so its field arrays stay in sync).
 */
export function applyTailoring(
  content: ResumeContent,
  suggestions: TailorSuggestion[],
  keywords: string[],
): ResumeContent {
  const next: ResumeContent = structuredClone(content);

  const work = next.workExperience ?? [];
  for (const s of suggestions) {
    const [workId, idxStr] = s.bullet_id.split("::");
    const bi = Number(idxStr);
    const wi = work.findIndex((w) => w.id === workId);
    if (wi >= 0 && Number.isInteger(bi) && work[wi].bullets && bi >= 0 && bi < work[wi].bullets!.length) {
      work[wi].bullets![bi] = s.suggested;
    }
  }
  next.workExperience = work;

  const skills = next.skills ?? [];
  for (const kw of keywords) if (!skills.includes(kw)) skills.push(kw);
  next.skills = skills;

  return next;
}
