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

describe("ResumeDocument templates", () => {
  it("renders all six templates", () => {
    for (const id of ["classic", "modern", "banner", "executive", "minimal", "editorial"]) {
      const { unmount } = render(<ResumeDocument content={content()} template={id} />);
      expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
      unmount();
    }
  });

  it("rules section headings on 'ruled' templates and not on 'minimal' ones", () => {
    const withSummary: ResumeContent = { ...content(), summary: "A short summary." };
    const { rerender } = render(<ResumeDocument content={withSummary} template="classic" />);
    expect(screen.getByText("Summary").className).toContain("border-b"); // ruled
    rerender(<ResumeDocument content={withSummary} template="minimal" />);
    expect(screen.getByText("Summary").className).not.toContain("border-b"); // minimal
  });
});

describe("ResumeDocument section order", () => {
  const multi: ResumeContent = {
    ...content(),
    summary: "A short summary.",
    skills: ["Figma"],
    workExperience: [
      { id: "w1", company: "Acme", position: "Designer", location: "", startDate: "2022-01", endDate: "", bullets: ["Did work."] },
    ],
  };

  function headingOrder() {
    return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  }

  it("renders sections in the saved order", () => {
    render(<ResumeDocument content={multi} sectionOrder={["skills", "summary", "experience"]} />);
    expect(headingOrder()).toEqual(["Skills", "Summary", "Experience"]);
  });

  it("falls back to the canonical order when none is given", () => {
    render(<ResumeDocument content={multi} />);
    expect(headingOrder()).toEqual(["Summary", "Experience", "Skills"]);
  });
});

describe("ResumeDocument document font", () => {
  it("applies a chosen ATS-safe font inline, overriding the template default", () => {
    const { container } = render(<ResumeDocument content={content()} documentFont="arial" />);
    expect(container.querySelector("article")!.style.fontFamily).toContain("Arial");
  });

  it("falls back to the template font class when no font is chosen", () => {
    const { container } = render(<ResumeDocument content={content()} template="classic" />);
    const article = container.querySelector("article")!;
    expect(article.style.fontFamily).toBe("");
    expect(article.className).toContain("font-document");
  });
});
