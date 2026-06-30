import { describe, expect, it } from "vitest";

import type { ResumeContent } from "@/api/generated/model";

import { resumeToText } from "./exportText";

const content: ResumeContent = {
  personalInfo: {
    name: "Maya Chen",
    headline: "Senior Product Designer",
    email: "maya@example.com",
    phone: "555-1212",
    location: "NYC",
    linkedin: "",
    github: "",
    website: "",
  },
  summary: "Senior designer who ships.",
  workExperience: [
    { id: "w1", company: "Acme", position: "Designer", location: "NYC", startDate: "2022-01", endDate: "", bullets: ["Did X.", "Did Y."] },
  ],
  education: [],
  skills: ["Figma", "Sketch"],
  projects: [],
};

describe("resumeToText", () => {
  it("includes the header, section headings, dates, and bullets", () => {
    const t = resumeToText(content);
    expect(t).toContain("Maya Chen");
    expect(t).toContain("maya@example.com");
    expect(t).toContain("SUMMARY");
    expect(t).toContain("EXPERIENCE");
    expect(t).toContain("Jan 2022 – Present");
    expect(t).toContain("• Did X.");
    expect(t).toContain("SKILLS");
    expect(t).toContain("Figma, Sketch");
  });

  it("orders sections per sectionOrder", () => {
    const t = resumeToText(content, ["skills", "summary", "experience"]);
    expect(t.indexOf("SKILLS")).toBeLessThan(t.indexOf("SUMMARY"));
    expect(t.indexOf("SUMMARY")).toBeLessThan(t.indexOf("EXPERIENCE"));
  });

  it("skips empty sections", () => {
    const t = resumeToText({ ...content, skills: [], summary: "" });
    expect(t).not.toContain("SKILLS");
    expect(t).not.toContain("SUMMARY");
  });
});
