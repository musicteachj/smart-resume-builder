import { z } from "zod";

import type { Resume } from "@/api/generated/model";

const monthOrEmpty = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM")
  .or(z.literal(""));
const urlOrEmpty = z.union([z.string().url("Enter a valid URL"), z.literal("")]);
const emailOrEmpty = z.union([z.string().email("Enter a valid email"), z.literal("")]);

/** Lenient editor schema: blank is fine (drafts autosave), formats checked when present. */
export const editorSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  template: z.string(),
  content: z.object({
    personalInfo: z.object({
      name: z.string().max(100),
      headline: z.string().max(120),
      email: emailOrEmpty,
      phone: z.string().max(40),
      location: z.string().max(100),
      linkedin: urlOrEmpty,
      github: urlOrEmpty,
      website: urlOrEmpty,
    }),
    summary: z.string().max(1000),
    workExperience: z
      .array(
        z.object({
          id: z.string(),
          company: z.string().max(120),
          position: z.string().max(120),
          location: z.string().max(120),
          startDate: monthOrEmpty,
          endDate: monthOrEmpty,
          bullets: z.array(z.string().max(500)).max(12),
        }),
      )
      .max(20),
    education: z
      .array(
        z.object({
          id: z.string(),
          school: z.string().max(120),
          degree: z.string().max(120),
          field: z.string().max(120),
          graduationDate: monthOrEmpty,
          gpa: z.string().max(10),
        }),
      )
      .max(10),
    skills: z.array(z.string().max(60)).max(60),
    projects: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().max(120),
          description: z.string().max(500),
          technologies: z.array(z.string().max(50)).max(20),
          url: urlOrEmpty,
        }),
      )
      .max(20),
  }),
});

export type EditorValues = z.infer<typeof editorSchema>;

/** Map a fetched resume into fully-defined form values (no undefined for RHF). */
export function toFormValues(resume: Resume): EditorValues {
  const c = resume.content;
  const pi = c.personalInfo ?? {};
  return {
    title: resume.title,
    template: resume.template ?? "classic",
    content: {
      personalInfo: {
        name: pi.name ?? "",
        headline: pi.headline ?? "",
        email: pi.email ?? "",
        phone: pi.phone ?? "",
        location: pi.location ?? "",
        linkedin: pi.linkedin ?? "",
        github: pi.github ?? "",
        website: pi.website ?? "",
      },
      summary: c.summary ?? "",
      workExperience: (c.workExperience ?? []).map((w) => ({
        id: w.id,
        company: w.company ?? "",
        position: w.position ?? "",
        location: w.location ?? "",
        startDate: w.startDate ?? "",
        endDate: w.endDate ?? "",
        bullets: w.bullets ?? [],
      })),
      education: (c.education ?? []).map((e) => ({
        id: e.id,
        school: e.school ?? "",
        degree: e.degree ?? "",
        field: e.field ?? "",
        graduationDate: e.graduationDate ?? "",
        gpa: e.gpa ?? "",
      })),
      skills: c.skills ?? [],
      projects: (c.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? "",
        description: p.description ?? "",
        technologies: p.technologies ?? [],
        url: p.url ?? "",
      })),
    },
  };
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const newWorkItem = () => ({
  id: uid(),
  company: "",
  position: "",
  location: "",
  startDate: "",
  endDate: "",
  bullets: [] as string[],
});

export const newEducationItem = () => ({
  id: uid(),
  school: "",
  degree: "",
  field: "",
  graduationDate: "",
  gpa: "",
});

export const newProjectItem = () => ({
  id: uid(),
  name: "",
  description: "",
  technologies: [] as string[],
  url: "",
});
