import { describe, expect, it } from "vitest";

import { entryLabel } from "./entryLabel";

describe("entryLabel", () => {
  it("uses the first non-blank candidate", () => {
    expect(entryLabel(["Acme Corp", "Engineer"], "job 1")).toBe("Acme Corp");
    expect(entryLabel(["  ", "Engineer"], "job 1")).toBe("Engineer");
  });

  it("falls back when every candidate is blank or missing", () => {
    expect(entryLabel(["", undefined, null], "job 2")).toBe("job 2");
  });
});
