import { describe, expect, it } from "vitest";

import { dayHeading, groupByDay, versionTitle } from "./versionLabel";

const now = new Date(2026, 9, 18, 15, 0); // Oct 18, 2026, 3 PM local

describe("versionTitle", () => {
  it("prefers the user's name, else describes the kind", () => {
    expect(versionTitle({ kind: "manual", label: "Sent to Acme" })).toBe("Sent to Acme");
    expect(versionTitle({ kind: "auto", label: "" })).toBe("Automatic checkpoint");
    expect(versionTitle({ kind: "ai", label: "" })).toBe("Before an AI change");
  });
});

describe("dayHeading", () => {
  it("names today and yesterday, otherwise a short date", () => {
    expect(dayHeading(new Date(2026, 9, 18, 8).toISOString(), now)).toBe("Today");
    expect(dayHeading(new Date(2026, 9, 17, 23).toISOString(), now)).toBe("Yesterday");
    expect(dayHeading(new Date(2026, 9, 3).toISOString(), now)).not.toMatch(/2026/);
    expect(dayHeading(new Date(2025, 9, 3).toISOString(), now)).toMatch(/2025/);
  });
});

describe("groupByDay", () => {
  it("keeps order and groups consecutive versions from the same day", () => {
    const v = (d: Date, id: string) => ({ id, created_at: d.toISOString() });
    const groups = groupByDay(
      [v(new Date(2026, 9, 18, 14), "a"), v(new Date(2026, 9, 18, 9), "b"), v(new Date(2026, 9, 17, 9), "c")],
      now,
    );
    expect(groups.map((g) => [g.heading, g.versions.map((x) => x.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
    ]);
  });
});
