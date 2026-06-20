import { describe, expect, it } from "vitest";

import { initials, relativeTime } from "./format";

describe("initials", () => {
  it("takes up to two initials, uppercased", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("james robert littlefield")).toBe("JR");
  });

  it("handles a single name", () => {
    expect(initials("Cher")).toBe("C");
  });

  it("falls back to ? for empty input", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("relativeTime", () => {
  it("renders recent times", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 min ago");
    expect(relativeTime(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe("2 hours ago");
    expect(relativeTime(new Date(Date.now() - 24 * 3_600_000).toISOString())).toBe("1 day ago");
  });
});
