import type { ResumeContent } from "@/api/generated/model";
import { dateRange, formatMonth, joinTruthy } from "@/features/templates/documentFormat";
import { normalizeSectionOrder, type SectionKey } from "@/features/templates/sections";

/**
 * Serialize a résumé to clean, ATS-friendly plain text — sections in the saved order,
 * matching the rendered document's formatting (dates, separators).
 */
export function resumeToText(content: ResumeContent, sectionOrder?: string[]): string {
  const pi = content.personalInfo ?? {};
  const out: string[] = [];

  // Header
  if (pi.name) out.push(pi.name);
  if (pi.headline) out.push(pi.headline);
  const contact = joinTruthy([pi.email ?? "", pi.phone ?? "", pi.location ?? ""], "  |  ");
  if (contact) out.push(contact);
  const links = joinTruthy([pi.linkedin ?? "", pi.github ?? "", pi.website ?? ""], "  |  ");
  if (links) out.push(links);

  const heading = (title: string) => out.push("", title.toUpperCase(), "");

  const blocks: Record<SectionKey, () => void> = {
    summary: () => {
      if (!content.summary) return;
      heading("Summary");
      out.push(content.summary);
    },
    experience: () => {
      const items = content.workExperience ?? [];
      if (items.length === 0) return;
      heading("Experience");
      items.forEach((w, i) => {
        if (i > 0) out.push("");
        const title = joinTruthy([w.position ?? "", joinTruthy([w.company ?? "", w.location ?? ""], ", ")], " — ");
        const range = dateRange(w.startDate ?? undefined, w.endDate);
        out.push(range ? `${title}  (${range})` : title);
        (w.bullets ?? []).filter(Boolean).forEach((b) => out.push(`  • ${b}`));
      });
    },
    education: () => {
      const items = content.education ?? [];
      if (items.length === 0) return;
      heading("Education");
      items.forEach((e, i) => {
        if (i > 0) out.push("");
        const grad = formatMonth(e.graduationDate);
        out.push(grad ? `${e.school ?? ""}  (${grad})`.trim() : (e.school ?? ""));
        const line = joinTruthy([joinTruthy([e.degree ?? "", e.field ?? ""], ", "), e.gpa ? `GPA ${e.gpa}` : ""], " · ");
        if (line) out.push(line);
      });
    },
    skills: () => {
      const skills = content.skills ?? [];
      if (skills.length === 0) return;
      heading("Skills");
      out.push(skills.join(", "));
    },
    projects: () => {
      const items = content.projects ?? [];
      if (items.length === 0) return;
      heading("Projects");
      items.forEach((p, i) => {
        if (i > 0) out.push("");
        out.push(p.name ?? "");
        if (p.description) out.push(p.description);
        if (p.technologies && p.technologies.length > 0) out.push(p.technologies.join(", "));
      });
    },
  };

  for (const key of normalizeSectionOrder(sectionOrder)) blocks[key]();

  return out.join("\n").trim() + "\n";
}
