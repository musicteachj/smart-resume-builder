import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreMeter } from "./ScoreMeter";

describe("ScoreMeter", () => {
  it("labels the band with text (never color alone)", () => {
    render(<ScoreMeter score={82} />);
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("uses the right band per range", () => {
    const { rerender } = render(<ScoreMeter score={60} />);
    expect(screen.getByText("Good")).toBeInTheDocument();
    rerender(<ScoreMeter score={30} />);
    expect(screen.getByText("Needs work")).toBeInTheDocument();
  });

  it("exposes an accessible progressbar with the score", () => {
    render(<ScoreMeter score={75} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });
});
