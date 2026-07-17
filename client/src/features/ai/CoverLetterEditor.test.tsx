import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();
const create = vi.fn();
const patch = vi.fn();
vi.mock("@/api/generated/ai/ai", () => ({
  useGenerateCoverLetter: () => ({ mutateAsync: generate, isPending: false }),
}));
vi.mock("@/api/generated/cover-letters/cover-letters", () => ({
  useCreateCoverLetter: () => ({ mutateAsync: create, isPending: false }),
  usePatchCoverLetter: () => ({ mutateAsync: patch, isPending: false }),
}));

import type { CoverLetter } from "@/api/generated/model";

import { CoverLetterEditor } from "./CoverLetterEditor";

function Harness({ letter = null }: { letter?: CoverLetter | null }) {
  const form = useForm({ defaultValues: { title: "PM résumé", content: {} } });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <FormProvider {...form}>
        <CoverLetterEditor resumeId="r1" letter={letter} onSaved={() => {}} onBack={() => {}} />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe("CoverLetterEditor", () => {
  beforeEach(() => {
    generate.mockReset();
    create.mockReset();
    patch.mockReset();
    generate.mockResolvedValue({ cover_letter: "Dear team…", ai_usage: { calls_today: 1 } });
    create.mockResolvedValue({ id: "c1" });
    patch.mockResolvedValue({ id: "c1" });
  });

  it("generates then saves a new letter", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText(/paste the full job description/i), {
      target: { value: "We need a product manager with SQL and roadmap skills." },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(screen.getByLabelText(/cover letter/i)).toHaveValue("Dear team…"));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0].data).toMatchObject({
      resume: "r1",
      title: "PM résumé — cover letter",
      body: "Dear team…",
    });
  });

  it("edits an existing letter and saves via PATCH", async () => {
    const letter: CoverLetter = {
      id: "c1",
      resume: "r1",
      title: "Old title",
      body: "Old body",
      job_description: "jd",
      created_at: "",
      updated_at: "",
    };
    render(<Harness letter={letter} />);
    // An existing letter opens straight into the edit view (body already present).
    const body = screen.getByLabelText(/cover letter/i);
    expect(body).toHaveValue("Old body");
    fireEvent.change(body, { target: { value: "Revised body" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledOnce());
    expect(patch.mock.calls[0][0]).toMatchObject({ id: "c1", data: { body: "Revised body" } });
  });
});
