import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PersonalInfo, ResumeContent } from "@/api/generated/model";

import { TemplateGallery } from "./TemplateGallery";

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

describe("TemplateGallery", () => {
  it("renders a card per template and marks the active one selected", () => {
    render(
      <TemplateGallery
        open
        onOpenChange={() => {}}
        content={content()}
        value="classic"
        onSelect={() => {}}
        fontValue=""
        onSelectFont={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Classic template" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Modern template" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Executive template" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editorial template" })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen id and closes on click", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TemplateGallery
        open
        onOpenChange={onOpenChange}
        content={content()}
        value="classic"
        onSelect={onSelect}
        fontValue=""
        onSelectFont={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Banner template" }));
    expect(onSelect).toHaveBeenCalledWith("banner");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("picks a document font without closing the modal", () => {
    const onSelectFont = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TemplateGallery
        open
        onOpenChange={onOpenChange}
        content={content()}
        value="classic"
        onSelect={() => {}}
        fontValue=""
        onSelectFont={onSelectFont}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Garamond" }));
    expect(onSelectFont).toHaveBeenCalledWith("garamond");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("previews each template in the résumé's own section order", () => {
    const withSections: ResumeContent = { ...content(), summary: "A short summary.", skills: ["Figma"] };
    render(
      <TemplateGallery
        open
        onOpenChange={() => {}}
        content={withSections}
        value="classic"
        onSelect={() => {}}
        fontValue=""
        onSelectFont={() => {}}
        sectionOrder={["skills", "summary", "experience"]}
      />,
    );
    const card = screen.getByRole("button", { name: "Classic template" });
    // Thumbnails are aria-hidden, so include hidden headings.
    const headings = within(card).getAllByRole("heading", { level: 2, hidden: true });
    expect(headings.map((h) => h.textContent)).toEqual(["Skills", "Summary"]);
  });
});
