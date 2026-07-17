import { describe, expect, it } from "vitest";

import { defaultCoverLetterTitle } from "./coverLetters";

describe("defaultCoverLetterTitle", () => {
  it("derives from the résumé title", () => {
    expect(defaultCoverLetterTitle("PM résumé")).toBe("PM résumé — cover letter");
  });

  it("falls back when the résumé title is blank", () => {
    expect(defaultCoverLetterTitle("  ")).toBe("Untitled — cover letter");
  });
});
