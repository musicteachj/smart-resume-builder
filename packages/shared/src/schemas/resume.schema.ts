import { z } from "zod";

import { TEMPLATES } from "../constants";

const templateIds = TEMPLATES.map((template) => template.id) as [
  (typeof TEMPLATES)[number]["id"],
  ...(typeof TEMPLATES)[number]["id"][]
];

const dateRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/i;
const phoneRegex = /^[+]?[\d\s().-]{7,20}$/;

export const TemplateIdSchema = z.enum(templateIds);

export const PersonalInfoSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z
    .string()
    .regex(phoneRegex, "Phone number must be valid")
    .optional()
    .or(z.literal("")),
  location: z.string().max(100).optional(),
  linkedin: z.string().url("LinkedIn must be a valid URL").optional(),
  github: z.string().url("GitHub must be a valid URL").optional(),
});

export const WorkExperienceSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1).max(120),
  position: z.string().min(1).max(120),
  location: z.string().max(120).optional(),
  startDate: z.string().regex(dateRegex, "Start date must be YYYY-MM"),
  endDate: z
    .string()
    .regex(dateRegex, "End date must be YYYY-MM")
    .nullable()
    .optional(),
  bullets: z.array(z.string().min(1).max(500)).max(10),
});

export const EducationSchema = z.object({
  id: z.string().min(1),
  school: z.string().min(1).max(120),
  degree: z.string().min(1).max(120),
  field: z.string().min(1).max(120),
  graduationDate: z
    .string()
    .regex(dateRegex, "Graduation date must be YYYY-MM"),
  gpa: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "GPA must be numeric")
    .optional(),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  technologies: z.array(z.string().min(1).max(50)).max(10),
  url: z.string().regex(urlRegex, "URL must be valid").optional(),
});

export const ResumeContentSchema = z.object({
  personalInfo: PersonalInfoSchema,
  summary: z.string().max(1000).optional(),
  workExperience: z.array(WorkExperienceSchema).max(10),
  education: z.array(EducationSchema).max(5),
  skills: z.array(z.string().min(1).max(50)).max(50),
  projects: z.array(ProjectSchema).max(5).optional(),
});

export const CreateResumeSchema = z.object({
  title: z.string().min(1).max(100),
  template: TemplateIdSchema,
  content: ResumeContentSchema,
});

export const UpdateResumeSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  template: TemplateIdSchema.optional(),
  content: ResumeContentSchema.optional(),
});
