import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SaveIndicator } from "./SaveIndicator";

const STORAGE =
  "This demo has reached its storage limit. Delete a resume or some saved versions to keep editing.";

describe("SaveIndicator", () => {
  it("shows the server's detail in place of the generic error", () => {
    render(<SaveIndicator status="error" detail={STORAGE} />);
    expect(screen.getByText(STORAGE)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't save")).not.toBeInTheDocument();
  });

  it("falls back to the generic error without a detail", () => {
    render(<SaveIndicator status="error" />);
    expect(screen.getByText("Couldn't save")).toBeInTheDocument();
  });

  it("ignores the detail for other statuses", () => {
    render(<SaveIndicator status="saved" detail={STORAGE} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText(STORAGE)).not.toBeInTheDocument();
  });
});
