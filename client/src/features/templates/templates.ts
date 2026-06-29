export type TemplateId = "classic" | "modern" | "banner";

export interface TemplateStyle {
  id: TemplateId;
  label: string;
  description: string;
  font: "serif" | "sans";
  headerAlign: "center" | "left";
  header: "plain" | "banner";
}

/** The one source of truth for templates — consumed by ResumeDocument, the gallery, and the dashboard. */
export const TEMPLATES: TemplateStyle[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Centered serif — editorial and timeless.",
    font: "serif",
    headerAlign: "center",
    header: "plain",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Left-aligned sans — clean and contemporary.",
    font: "sans",
    headerAlign: "left",
    header: "plain",
  },
  {
    id: "banner",
    label: "Banner",
    description: "Bold navy header band — confident and distinct.",
    font: "sans",
    headerAlign: "left",
    header: "banner",
  },
];

export const DEFAULT_TEMPLATE: TemplateId = "classic";

/** Resolve a (possibly unknown) slug to a template style, falling back to the default. */
export function getTemplate(id: string): TemplateStyle {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
