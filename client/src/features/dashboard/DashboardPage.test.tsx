import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMutate, duplicateMutate } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  duplicateMutate: vi.fn(),
}));
vi.mock("@/api/generated/resumes/resumes", () => ({
  getListResumesQueryKey: () => ["resumes"],
  useListResumes: () => ({
    data: [{ id: "r1", title: "My resume", template: "classic", skills: [], created_at: "", updated_at: "" }],
    isLoading: false,
  }),
  useCreateResume: () => ({ mutateAsync: createMutate, isPending: false }),
  useDuplicateResume: () => ({ mutateAsync: duplicateMutate, isPending: false }),
  useDeleteResume: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./ImportResumeModal", () => ({ ImportResumeModal: () => null }));

import { DashboardPage } from "./DashboardPage";

const LIMIT = "This demo can hold up to 20 resumes. Delete one to make room.";
const limitError = {
  isAxiosError: true,
  response: { status: 400, data: { detail: LIMIT, code: "demo_limit" } },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the server's message when New resume is refused", async () => {
    createMutate.mockRejectedValue(limitError);
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /new resume/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(LIMIT);
  });

  it("falls back to a generic message when the error has no detail", async () => {
    createMutate.mockRejectedValue(new Error("boom"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /new resume/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create a resume. Please try again.",
    );
  });

  it("shows the server's message when a duplicate is refused", async () => {
    duplicateMutate.mockRejectedValue(limitError);
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /options for my resume/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /duplicate/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(LIMIT);
  });
});
