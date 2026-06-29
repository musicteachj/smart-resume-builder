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
