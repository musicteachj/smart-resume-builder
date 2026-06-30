import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEMPLATE,
  DOCUMENT_FONTS,
  TEMPLATES,
  getDocumentFontFamily,
  getTemplate,
} from "./templates";

describe("templates registry", () => {
  it("offers at least six templates including the originals", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids).toEqual(expect.arrayContaining(["classic", "modern", "banner", "executive", "minimal", "editorial"]));
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

describe("document fonts", () => {
  it("resolves a known font slug to a CSS family", () => {
    expect(getDocumentFontFamily("garamond")).toContain("Garamond");
    expect(DOCUMENT_FONTS.length).toBeGreaterThanOrEqual(6);
  });

  it("returns undefined for blank/unknown so the template font is used", () => {
    expect(getDocumentFontFamily("")).toBeUndefined();
    expect(getDocumentFontFamily(undefined)).toBeUndefined();
    expect(getDocumentFontFamily("nope")).toBeUndefined();
  });
});
