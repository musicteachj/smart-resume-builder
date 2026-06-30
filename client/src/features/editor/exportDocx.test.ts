import { describe, expect, it } from "vitest";

import type { ResumeContent } from "@/api/generated/model";

import { docxFontName, resumeToDocxBlob } from "./exportDocx";

const content: ResumeContent = {
  personalInfo: { name: "Maya Chen", email: "maya@example.com" },
  summary: "Senior designer who ships.",
  workExperience: [
    { id: "w1", company: "Acme", position: "Designer", startDate: "2022-01", endDate: "", bullets: ["Did X."] },
  ],
  education: [],
  skills: ["Figma"],
  projects: [],
};

describe("docxFontName", () => {
  it("maps a known slug and ignores blank/unknown", () => {
    expect(docxFontName("garamond")).toBe("Garamond");
    expect(docxFontName("")).toBeUndefined();
    expect(docxFontName("nope")).toBeUndefined();
  });
});

describe("resumeToDocxBlob", () => {
  it("produces a non-empty .docx Blob", async () => {
    const blob = await resumeToDocxBlob(content, { sectionOrder: ["summary", "experience", "skills"], font: "Arial" });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
