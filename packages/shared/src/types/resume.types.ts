export type TemplateId = "classic";

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  previewImage?: string;
}

export interface PersonalInfo {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: string; // YYYY-MM
  endDate?: string | null; // YYYY-MM or null when current
  bullets: string[];
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  graduationDate: string; // YYYY-MM
  gpa?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url?: string;
}

export interface ResumeContent {
  personalInfo: PersonalInfo;
  summary?: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  projects?: Project[];
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  template: TemplateId;
  content: ResumeContent;
  createdAt: string;
  updatedAt: string;
}
