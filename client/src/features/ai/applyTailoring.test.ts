import { describe, expect, it } from "vitest";

import type { ResumeContent, TailorSuggestion } from "@/api/generated/model";

import { applyTailoring } from "./applyTailoring";

function content(): ResumeContent {
  return {
    personalInfo: { name: "Maya" },
    summary: "",
    workExperience: [
      { id: "w1", company: "Acme", position: "Designer", startDate: "2022-01", endDate: "", bullets: ["Old bullet.", "Keep me."] },
    ],
    education: [],
    skills: ["Figma"],
    projects: [],
  };
}

const suggestion = (over: Partial<TailorSuggestion> = {}): TailorSuggestion => ({
  bullet_id: "w1::0",
  current: "Old bullet.",
  suggested: "New, stronger bullet.",
  adds: [],
  ...over,
});

describe("applyTailoring", () => {
  it("replaces the targeted bullet and appends new keywords, immutably", () => {
    const original = content();
    const next = applyTailoring(original, [suggestion()], ["A/B testing"]);

    expect(next.workExperience![0].bullets).toEqual(["New, stronger bullet.", "Keep me."]);
    expect(next.skills).toEqual(["Figma", "A/B testing"]);
    // input untouched
    expect(original.workExperience![0].bullets![0]).toBe("Old bullet.");
    expect(original.skills).toEqual(["Figma"]);
  });

  it("does not duplicate a keyword already present", () => {
    expect(applyTailoring(content(), [], ["Figma"]).skills).toEqual(["Figma"]);
  });

  it("ignores a suggestion whose bullet no longer exists", () => {
    const next = applyTailoring(content(), [suggestion({ bullet_id: "w1::9" })], []);
    expect(next.workExperience![0].bullets).toEqual(["Old bullet.", "Keep me."]);
  });
});
