import { describe, expect, it } from "vitest";

import { editorSchema, type EditorValues } from "./editorSchema";

const validContent: EditorValues["content"] = {
  personalInfo: {
    name: "Maya Chen",
    headline: "Senior Product Designer",
    email: "maya@example.com",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
  },
  summary: "",
  workExperience: [],
  education: [],
  skills: [],
  projects: [],
};

const base: EditorValues = { title: "My Resume", template: "classic", documentFont: "", content: validContent };

describe("editorSchema", () => {
  it("accepts a valid (draft-friendly) resume", () => {
    expect(editorSchema.safeParse(base).success).toBe(true);
  });

  it("allows blank email/url (drafts) but rejects malformed ones", () => {
    expect(editorSchema.safeParse(base).success).toBe(true); // blank ok
    const badEmail = structuredClone(base);
    badEmail.content.personalInfo.email = "not-an-email";
    expect(editorSchema.safeParse(badEmail).success).toBe(false);
  });

  it("requires a title", () => {
    expect(editorSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });

  it("validates YYYY-MM dates when present", () => {
    const c = structuredClone(base);
    c.content.workExperience = [
      { id: "w1", company: "", position: "", location: "", startDate: "2022", endDate: "", bullets: [] },
    ];
    expect(editorSchema.safeParse(c).success).toBe(false);
    c.content.workExperience[0].startDate = "2022-01";
    expect(editorSchema.safeParse(c).success).toBe(true);
  });
});
