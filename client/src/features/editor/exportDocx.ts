import type { ResumeContent } from "@/api/generated/model";
import { dateRange, formatMonth, joinTruthy } from "@/features/templates/documentFormat";
import { normalizeSectionOrder, type SectionKey } from "@/features/templates/sections";

/** Map a document-font slug to a Word font name. Blank/unknown → undefined (caller picks a default). */
export function docxFontName(slug?: string): string | undefined {
  const names: Record<string, string> = {
    georgia: "Georgia",
    times: "Times New Roman",
    garamond: "Garamond",
    arial: "Arial",
    helvetica: "Helvetica",
    calibri: "Calibri",
  };
  return slug ? names[slug] : undefined;
}

/**
 * Build an ATS-safe .docx from the résumé content, sections in the saved order. The `docx`
 * library is imported lazily so it stays out of the main bundle.
 */
export async function resumeToDocxBlob(
  content: ResumeContent,
  opts: { sectionOrder?: string[]; font?: string } = {},
): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const font = opts.font || "Georgia";
  const pi = content.personalInfo ?? {};

  type Child = InstanceType<typeof Paragraph>;
  const children: Child[] = [];

  const line = (text: string, o: { bold?: boolean; size?: number; before?: number; indent?: number } = {}) =>
    new Paragraph({
      spacing: { before: o.before ?? 0, after: 40 },
      indent: o.indent ? { left: o.indent } : undefined,
      children: [new TextRun({ text, bold: o.bold, size: o.size ?? 21 })],
    });

  const heading = (title: string) => children.push(line(title.toUpperCase(), { bold: true, size: 22, before: 200 }));

  // Header
  if (pi.name) children.push(line(pi.name, { bold: true, size: 32 }));
  if (pi.headline) children.push(line(pi.headline, { size: 22 }));
  const contact = joinTruthy([pi.email ?? "", pi.phone ?? "", pi.location ?? ""], "   |   ");
  if (contact) children.push(line(contact, { size: 18 }));
  const links = joinTruthy([pi.linkedin ?? "", pi.github ?? "", pi.website ?? ""], "   |   ");
  if (links) children.push(line(links, { size: 18 }));

  const blocks: Record<SectionKey, () => void> = {
    summary: () => {
      if (!content.summary) return;
      heading("Summary");
      children.push(line(content.summary));
    },
    experience: () => {
      const items = content.workExperience ?? [];
      if (items.length === 0) return;
      heading("Experience");
      items.forEach((w) => {
        const title = joinTruthy([w.position ?? "", joinTruthy([w.company ?? "", w.location ?? ""], ", ")], " — ");
        const range = dateRange(w.startDate ?? undefined, w.endDate);
        children.push(line(range ? `${title}   (${range})` : title, { bold: true, before: 80 }));
        (w.bullets ?? []).filter(Boolean).forEach((b) => children.push(line(`• ${b}`, { indent: 280 })));
      });
    },
    education: () => {
      const items = content.education ?? [];
      if (items.length === 0) return;
      heading("Education");
      items.forEach((e) => {
        const grad = formatMonth(e.graduationDate);
        children.push(line(grad ? `${e.school ?? ""}   (${grad})` : (e.school ?? ""), { bold: true, before: 80 }));
        const detail = joinTruthy([joinTruthy([e.degree ?? "", e.field ?? ""], ", "), e.gpa ? `GPA ${e.gpa}` : ""], " · ");
        if (detail) children.push(line(detail));
      });
    },
    skills: () => {
      const skills = content.skills ?? [];
      if (skills.length === 0) return;
      heading("Skills");
      children.push(line(skills.join(", ")));
    },
    projects: () => {
      const items = content.projects ?? [];
      if (items.length === 0) return;
      heading("Projects");
      items.forEach((p) => {
        children.push(line(p.name ?? "", { bold: true, before: 80 }));
        if (p.description) children.push(line(p.description));
        if (p.technologies && p.technologies.length > 0) children.push(line(p.technologies.join(", "), { size: 18 }));
      });
    },
  };

  for (const key of normalizeSectionOrder(opts.sectionOrder)) blocks[key]();

  const doc = new Document({
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [
      { properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children },
    ],
  });
  return Packer.toBlob(doc);
}
