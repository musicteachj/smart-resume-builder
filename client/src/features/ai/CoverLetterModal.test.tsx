import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { EditorValues } from "@/features/editor/editorSchema";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/ai/ai", () => ({
  useGenerateCoverLetter: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/lib/extractFileText", () => ({ extractFileText: vi.fn() }));

import { CoverLetterModal } from "./CoverLetterModal";

function Harness() {
  const methods = useForm<EditorValues>({
    defaultValues: {
      title: "My Resume",
      content: { personalInfo: { name: "Maya" }, summary: "", workExperience: [], education: [], skills: [], projects: [] },
    },
  });
  return (
    <FormProvider {...methods}>
      <CoverLetterModal onClose={() => {}} />
    </FormProvider>
  );
}

describe("CoverLetterModal", () => {
  it("disables Generate until enough job-description text", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /generate cover letter/i })).toBeDisabled();
  });

  it("generates a letter and shows it in an editable field with a download action", async () => {
    mutateAsync.mockResolvedValue({
      cover_letter: "Dear Hiring Manager, I am excited about this role.",
      ai_usage: { calls_today: 1, daily_limit: 10 },
    });
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText(/paste the full job description/i), {
      target: { value: "A sufficiently long job description to enable generation." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate cover letter/i }));

    expect(await screen.findByDisplayValue("Dear Hiring Manager, I am excited about this role.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download \.txt/i })).toBeInTheDocument();
  });
});
