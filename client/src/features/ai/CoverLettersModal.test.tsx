import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router-dom", () => ({ useParams: () => ({ id: "r1" }) }));

const del = vi.fn();
vi.mock("@/api/generated/cover-letters/cover-letters", () => ({
  useListCoverLetters: () => ({
    data: [
      { id: "c1", title: "Acme PM role", body: "Dear team…", job_description: "", updated_at: "2026-07-16T00:00:00Z" },
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
    expect(screen.getByText("Acme PM role")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new cover letter/i })).toBeInTheDocument();
  });

  it("deletes a letter after confirming in the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Acme PM role" }));
    // The styled ConfirmDialog opens; its confirm button is labelled "Delete".
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: "c1" }));
  });

  it("keeps the dialog open with an error when the delete fails", async () => {
    del.mockRejectedValueOnce(
      new AxiosError("fail", "500", undefined, null, {
        status: 500,
        statusText: "",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {},
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Acme PM role" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't delete this cover letter. Please try again.");
    expect(screen.getByRole("dialog", { name: "Delete cover letter?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});
