export type TemplateId =
  | "classic"
  | "modern"
  | "banner"
  | "executive"
  | "minimal"
  | "editorial";

export interface TemplateStyle {
  id: TemplateId;
  label: string;
  description: string;
  font: "serif" | "sans";
  headerAlign: "center" | "left";
  header: "plain" | "banner";
  /** Section-heading treatment: "ruled" = uppercase with a bottom rule; "minimal" = quiet, no rule. */
  heading: "ruled" | "minimal";
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
    heading: "ruled",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Left-aligned sans — clean and contemporary.",
    font: "sans",
    headerAlign: "left",
    header: "plain",
    heading: "ruled",
  },
  {
    id: "banner",
    label: "Banner",
    description: "Bold navy header band — confident and distinct.",
    font: "sans",
    headerAlign: "left",
    header: "banner",
    heading: "ruled",
  },
  {
    id: "executive",
    label: "Executive",
    description: "Left-aligned serif with quiet headings — senior and formal.",
    font: "serif",
    headerAlign: "left",
    header: "plain",
    heading: "minimal",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Airy sans, understated headings — modern and quiet.",
    font: "sans",
    headerAlign: "left",
    header: "plain",
    heading: "minimal",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Centered serif, refined headings — magazine-like.",
    font: "serif",
    headerAlign: "center",
    header: "plain",
    heading: "minimal",
  },
];

export const DEFAULT_TEMPLATE: TemplateId = "classic";

/** Resolve a (possibly unknown) slug to a template style, falling back to the default. */
export function getTemplate(id: string): TemplateStyle {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** ATS-safe document typefaces a user can pick, independent of the template. */
export interface DocumentFont {
  id: string;
  label: string;
  /** CSS font-family stack — system/ATS-safe fonts only (no web fonts in the document). */
  family: string;
  kind: "serif" | "sans";
}

export const DOCUMENT_FONTS: DocumentFont[] = [
  { id: "georgia", label: "Georgia", family: '"Georgia", "Times New Roman", serif', kind: "serif" },
  { id: "times", label: "Times New Roman", family: '"Times New Roman", Times, serif', kind: "serif" },
  { id: "garamond", label: "Garamond", family: 'Garamond, "Times New Roman", serif', kind: "serif" },
  { id: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif", kind: "sans" },
  { id: "helvetica", label: "Helvetica", family: '"Helvetica Neue", Helvetica, Arial, sans-serif', kind: "sans" },
  { id: "calibri", label: "Calibri", family: 'Calibri, Carlito, "Segoe UI", sans-serif', kind: "sans" },
];

/** Resolve a font slug to its CSS family. Unknown/blank → undefined (use the template's default font). */
export function getDocumentFontFamily(id?: string): string | undefined {
  return DOCUMENT_FONTS.find((f) => f.id === id)?.family;
}
