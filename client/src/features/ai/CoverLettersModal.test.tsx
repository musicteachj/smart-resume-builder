import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "r1" }) }));

const del = vi.fn();
vi.mock("@/api/generated/cover-letters/cover-letters", () => ({
  useListCoverLetters: () => ({
    data: [
      { id: "c1", title: "Acme — PM", body: "Dear team…", job_description: "", updated_at: "2026-07-16T00:00:00Z" },
    ],
    isLoading: false,
  }),
  useDeleteCoverLetter: () => ({ mutateAsync: del, isPending: false }),
  getListCoverLettersQueryKey: () => ["cover-letters"],
}));
// The editor sub-view has its own test; stub it here.
vi.mock("./CoverLetterEditor", () => ({ CoverLetterEditor: () => <div>editor</div> }));

import { CoverLettersModal } from "./CoverLettersModal";

function Harness() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <CoverLettersModal onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe("CoverLettersModal", () => {
  it("lists saved cover letters", () => {
    render(<Harness />);
    expect(screen.getByText("Acme — PM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new cover letter/i })).toBeInTheDocument();
  });

  it("deletes a letter after confirming in the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Delete this cover letter" }));
    // The styled ConfirmDialog opens; its confirm button is labelled "Delete".
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: "c1" }));
  });
});
