import { fireEvent, render, screen } from "@testing-library/react";
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
      <TemplateGallery open onOpenChange={() => {}} content={content()} value="classic" onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Classic template" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Modern template" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Banner template" })).toBeInTheDocument();
  });

  it("calls onSelect with the chosen id and closes on click", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TemplateGallery open onOpenChange={onOpenChange} content={content()} value="classic" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Banner template" }));
    expect(onSelect).toHaveBeenCalledWith("banner");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
