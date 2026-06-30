import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PersonalInfo, ResumeContent } from "@/api/generated/model";

import { ResumeDocument } from "./ResumeDocument";

function content(personalInfo: PersonalInfo = {}): ResumeContent {
  return {
    personalInfo: { name: "Ada Lovelace", ...personalInfo },
    summary: "",
    workExperience: [],
    education: [],
    skills: [],
    projects: [],
  };
}

describe("ResumeDocument headline", () => {
  it("renders the headline under the name when present", () => {
    render(<ResumeDocument content={content({ headline: "Senior Engineer" })} />);
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
  });

  it("omits the headline when blank", () => {
    render(<ResumeDocument content={content({ headline: "" })} />);
    expect(screen.queryByText("Senior Engineer")).not.toBeInTheDocument();
  });

  it("renders the headline for the modern template too", () => {
    render(<ResumeDocument content={content({ headline: "Designer" })} template="modern" />);
    expect(screen.getByText("Designer")).toBeInTheDocument();
  });
});

describe("ResumeDocument profile links", () => {
  it("renders linkedin/github/website as labeled clickable links, not raw URLs", () => {
    render(
      <ResumeDocument
        content={content({ linkedin: "https://linkedin.com/in/ada", github: "https://github.com/ada", website: "https://ada.dev" })}
      />,
    );
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/ada");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/ada");
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://ada.dev");
    // raw URL text is no longer shown
    expect(screen.queryByText("https://linkedin.com/in/ada")).not.toBeInTheDocument();
  });

  it("never renders a non-http(s) scheme as a link (XSS guard)", () => {
    render(<ResumeDocument content={content({ website: "javascript:alert(1)" })} />);
    expect(screen.queryByRole("link", { name: "Website" })).not.toBeInTheDocument();
    // the label is still shown as plain text, and no dangerous href exists
    expect(screen.getByText("Website")).toBeInTheDocument();
  });
});

describe("ResumeDocument banner template", () => {
  it("renders the name in a banner header when template=banner", () => {
    render(<ResumeDocument content={content({ headline: "Engineer" })} template="banner" />);
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "banner");
  });

  it("uses the plain header for classic and modern", () => {
    const { rerender } = render(<ResumeDocument content={content()} template="classic" />);
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "plain");
    rerender(<ResumeDocument content={content()} template="modern" />);
    expect(screen.getByTestId("doc-header")).toHaveAttribute("data-header", "plain");
  });
});
