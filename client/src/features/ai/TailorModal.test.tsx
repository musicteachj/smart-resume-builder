import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { EditorValues } from "@/features/editor/editorSchema";

const { tailorMutate } = vi.hoisted(() => ({ tailorMutate: vi.fn() }));
vi.mock("@/api/generated/ai/ai", () => ({
  useTailorJd: () => ({ mutateAsync: tailorMutate, isPending: false }),
}));

const { extractFileText } = vi.hoisted(() => ({ extractFileText: vi.fn() }));
vi.mock("@/lib/extractFileText", () => ({ extractFileText }));

import { TailorModal } from "./TailorModal";

function Harness() {
  const methods = useForm<EditorValues>();
  return (
    <FormProvider {...methods}>
      <TailorModal onClose={() => {}} />
    </FormProvider>
  );
}

function uploadPdf(text = "jd") {
  const file = new File([text], "role.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/upload job description/i), { target: { files: [file] } });
  return file;
}

describe("TailorModal upload", () => {
  it("fills the textarea with text extracted from an uploaded file", async () => {
    extractFileText.mockResolvedValue("Senior Product Designer — lead the design system and mentor the team.");
    render(<Harness />);

    uploadPdf();

    const textarea = await screen.findByPlaceholderText(/paste the full job description/i);
    await waitFor(() =>
      expect(textarea).toHaveValue("Senior Product Designer — lead the design system and mentor the team."),
    );
  });

  it("shows the extraction error and leaves the textarea unchanged", async () => {
    extractFileText.mockRejectedValue(new Error("Unsupported file type — upload a PDF or DOCX, or paste text instead."));
    render(<Harness />);

    uploadPdf();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unsupported file type/i);
    expect(screen.getByPlaceholderText(/paste the full job description/i)).toHaveValue("");
  });

  it("disables Analyze while reading, then enables it once text is in", async () => {
    let resolve!: (text: string) => void;
    extractFileText.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    render(<Harness />);

    // Empty to start → disabled.
    expect(screen.getByRole("button", { name: /analyze match/i })).toBeDisabled();

    uploadPdf();
    expect(await screen.findByText(/reading file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze match/i })).toBeDisabled();

    resolve("A sufficiently long job description that clears the minimum length threshold.");
    await waitFor(() => expect(screen.getByRole("button", { name: /analyze match/i })).toBeEnabled());
  });
});
