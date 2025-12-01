import type { TemplateDefinition, TemplateId } from "../types";

export const AI_LIMITS = Object.freeze({
  FREE_DAILY: 10,
  FREE_MONTHLY: 50,
});

export const AI_FEATURES = Object.freeze({
  IMPROVE_BULLET: "improve-bullet",
});

export const TEMPLATES: readonly TemplateDefinition[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Timeless single-column layout optimized for ATS readability.",
  },
] as const;

export const DEFAULT_TEMPLATE_ID: TemplateId = "classic";
