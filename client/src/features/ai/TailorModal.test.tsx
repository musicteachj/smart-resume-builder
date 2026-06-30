import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorValues } from "@/features/editor/editorSchema";

const { tailorMutate } = vi.hoisted(() => ({ tailorMutate: vi.fn() }));
vi.mock("@/api/generated/ai/ai", () => ({
  useTailorJd: () => ({ mutateAsync: tailorMutate, isPending: false }),
}));

const { duplicateMutate, patchMutate } = vi.hoisted(() => ({
  duplicateMutate: vi.fn(),
  patchMutate: vi.fn(),
}));
vi.mock("@/api/generated/resumes/resumes", () => ({
  useDuplicateResume: () => ({ mutateAsync: duplicateMutate, isPending: false }),
  usePatchResume: () => ({ mutateAsync: patchMutate, isPending: false }),
}));

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "r1" }),
  useNavigate: () => navigate,
}));

const { extractFileText } = vi.hoisted(() => ({ extractFileText: vi.fn() }));
vi.mock("@/lib/extractFileText", () => ({ extractFileText }));

import { TailorModal } from "./TailorModal";

const defaultContent = {
  personalInfo: { name: "Maya", headline: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  summary: "",
  workExperience: [
    { id: "w1", company: "Acme", position: "Designer", location: "", startDate: "2022-01", endDate: "", bullets: ["Old bullet."] },
  ],
  education: [],
  skills: [] as string[],
  projects: [],
};

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const methods = useForm<EditorValues>({
    defaultValues: { title: "R", template: "classic", documentFont: "", sectionOrder: [], content: defaultContent },
  });
  return (
    <FormProvider {...methods}>
      <TailorModal onClose={onClose} />
    </FormProvider>
  );
}

function uploadPdf(text = "jd") {
  const file = new File([text], "role.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/upload job description/i), { target: { files: [file] } });
  return file;
}

const tailorResult = {
  match_score: 70,
  missing_keywords: ["A/B testing"],
  suggestions: [{ bullet_id: "w1::0", current: "Old bullet.", suggested: "New, stronger bullet.", adds: [] }],
  ai_usage: { calls_today: 1, daily_limit: 10 },
};

async function analyzeTo() {
  tailorMutate.mockResolvedValue(tailorResult);
  fireEvent.change(screen.getByPlaceholderText(/paste the full job description/i), {
    target: { value: "A sufficiently long job description to enable analysis." },
  });
  fireEvent.click(screen.getByRole("button", { name: /analyze match/i }));
  await screen.findByText(/suggested rewrites/i);
}

describe("TailorModal upload", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(screen.getByRole("button", { name: /analyze match/i })).toBeDisabled();
    uploadPdf();
    expect(await screen.findByText(/reading file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze match/i })).toBeDisabled();
    resolve("A sufficiently long job description that clears the minimum length threshold.");
    await waitFor(() => expect(screen.getByRole("button", { name: /analyze match/i })).toBeEnabled());
  });
});

describe("TailorModal destinations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables both destinations until something is picked", async () => {
    render(<Harness />);
    await analyzeTo();
    expect(screen.getByRole("button", { name: /apply to this résumé/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save as tailored copy/i })).toBeDisabled();
  });

  it("saves a tailored copy: duplicate → patch with applied changes → navigate", async () => {
    duplicateMutate.mockResolvedValue({ id: "copy1" });
    patchMutate.mockResolvedValue({});
    render(<Harness />);
    await analyzeTo();

    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save as tailored copy/i }));

    await waitFor(() => expect(duplicateMutate).toHaveBeenCalledWith({ id: "r1" }));
    await waitFor(() => expect(patchMutate).toHaveBeenCalled());
    const patchArg = patchMutate.mock.calls[0][0];
    expect(patchArg.id).toBe("copy1");
    expect(patchArg.data.content.workExperience[0].bullets[0]).toBe("New, stronger bullet.");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/resumes/copy1"));
  });

  it("applies to the current résumé in place and closes, without duplicating", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await analyzeTo();

    fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply to this résumé/i }));

    expect(onClose).toHaveBeenCalled();
    expect(duplicateMutate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
