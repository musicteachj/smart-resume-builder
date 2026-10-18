import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImportResumeModal } from "./ImportResumeModal";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

const parseMutate = vi.fn();
const createMutate = vi.fn();
vi.mock("@/api/generated/ai/ai", () => ({
  useParseResume: () => ({ mutateAsync: parseMutate, isPending: false }),
}));
vi.mock("@/api/generated/resumes/resumes", () => ({
  useCreateResume: () => ({ mutateAsync: createMutate, isPending: false }),
}));

const parsed = {
  personalInfo: { name: "Maya Chen" },
  summary: "",
  workExperience: [],
  education: [],
  skills: [],
  projects: [],
};

describe("ImportResumeModal", () => {
  it("parses pasted text, shows the review, and creates on confirm", async () => {
    parseMutate.mockResolvedValue({ content: parsed, ai_usage: { calls_today: 1, daily_limit: 10 } });
    createMutate.mockResolvedValue({ id: "new-id" });
    render(<ImportResumeModal open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: "Maya Chen\nSenior Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));

    await screen.findByRole("button", { name: /open in editor/i });
    fireEvent.click(screen.getByRole("button", { name: /open in editor/i }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith("/resumes/new-id");
  });

  it("shows an error and stays on input when parsing fails", async () => {
    parseMutate.mockRejectedValue({ response: { status: 502, data: { detail: "AI down" } } });
    render(<ImportResumeModal open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/paste/i), {
      target: { value: "some resume text long enough to clear the minimum length" },
    });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open in editor/i })).not.toBeInTheDocument();
  });

  it("asks before Start over discards the parsed résumé", async () => {
    parseMutate.mockResolvedValue({ content: parsed, ai_usage: { calls_today: 1, daily_limit: 10 } });
    render(<ImportResumeModal open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: "Maya Chen\nSenior Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));
    await screen.findByRole("button", { name: /open in editor/i });

    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(await screen.findByText(/discard imported résumé/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /open in editor/i })).not.toBeInTheDocument(),
    );
  });

  it("ignores a parse that finishes after the user discarded it", async () => {
    let finish: (v: unknown) => void = () => {};
    parseMutate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const onOpenChange = vi.fn();
    render(<ImportResumeModal open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: "Maya Chen\nSenior Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /parse/i }));
    await screen.findByText(/parsing with ai/i);

    // Closing mid-parse asks first; discarding resets the modal.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    finish({ content: parsed, ai_usage: { calls_today: 1, daily_limit: 10 } });
    await waitFor(() => expect(screen.queryByText(/parsing with ai/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /open in editor/i })).not.toBeInTheDocument();
  });
});
