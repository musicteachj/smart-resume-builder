import { describe, expect, it } from "vitest";

import { DEFAULT_SECTION_ORDER, normalizeSectionOrder } from "./sections";

describe("normalizeSectionOrder", () => {
  it("returns the canonical order when nothing is saved", () => {
    expect(normalizeSectionOrder()).toEqual(DEFAULT_SECTION_ORDER);
    expect(normalizeSectionOrder([])).toEqual(DEFAULT_SECTION_ORDER);
    expect(normalizeSectionOrder(null)).toEqual(DEFAULT_SECTION_ORDER);
  });

  it("keeps a saved order and appends any missing keys (forward-compatible)", () => {
    expect(normalizeSectionOrder(["skills", "summary"])).toEqual([
      "skills",
      "summary",
      "experience",
      "education",
      "projects",
    ]);
  });

  it("drops unknown keys and de-duplicates", () => {
    expect(normalizeSectionOrder(["bogus", "skills", "skills", "summary"])).toEqual([
      "skills",
      "summary",
      "experience",
      "education",
      "projects",
    ]);
  });
});
