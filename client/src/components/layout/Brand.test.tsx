import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Brand } from "./Brand";

describe("Brand", () => {
  it("names the product in text and hides the decorative mark", () => {
    const { container } = render(<Brand />);
    expect(screen.getByText("ResumeIQ")).toBeInTheDocument();
    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("fill", "currentColor");
  });
});
