import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE, TEMPLATES, getTemplate } from "./templates";

describe("templates registry", () => {
  it("contains classic, modern, and banner", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["classic", "modern", "banner"]);
  });

  it("getTemplate resolves a known id", () => {
    expect(getTemplate("banner").label).toBe("Banner");
    expect(getTemplate("modern").font).toBe("sans");
  });

  it("getTemplate falls back to the default for an unknown slug", () => {
    expect(getTemplate("nope").id).toBe(DEFAULT_TEMPLATE);
    expect(DEFAULT_TEMPLATE).toBe("classic");
  });

  it("banner uses the banner header treatment", () => {
    expect(getTemplate("banner").header).toBe("banner");
    expect(getTemplate("classic").header).toBe("plain");
  });
});
