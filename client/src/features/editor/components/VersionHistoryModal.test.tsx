import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorSessionProvider, type EditorSession } from "../EditorSession";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@/api/generated/resume-versions/resume-versions", () => ({
  getListResumeVersionsQueryKey: () => ["resume-versions"],
  useListResumeVersions: () => h.list(),
  useGetResumeVersion: (id: string) => h.get(id),
  useCreateResumeVersion: () => ({ mutateAsync: h.create, isPending: false }),
  usePatchResumeVersion: () => ({ mutateAsync: h.patch, isPending: false }),
  useDeleteResumeVersion: () => ({ mutateAsync: h.del, isPending: false }),
  useRestoreResumeVersion: () => ({ mutateAsync: h.restore, isPending: false }),
}));

import { VersionHistoryModal } from "./VersionHistoryModal";

const now = new Date().toISOString();
const summaries = [
  { id: "v2", resume: "r1", kind: "manual", label: "Sent to Acme", title: "PM", template: "classic", created_at: now },
  { id: "v1", resume: "r1", kind: "auto", label: "", title: "PM", template: "classic", created_at: now },
];
const snapshot = (id: string, name: string) => ({
  ...summaries.find((s) => s.id === id),
  document_font: "",
  section_order: [],
  content: {
    personalInfo: { name, email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
    summary: "",
    workExperience: [],
    education: [],
    skills: [],
    projects: [],
  },
});

function renderModal(session: Partial<EditorSession> = {}, onClose = vi.fn()) {
  const full: EditorSession = {
    resumeId: "r1",
    flush: vi.fn().mockResolvedValue(true),
    onRestored: vi.fn(),
    ...session,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditorSessionProvider value={full}>
        <VersionHistoryModal onClose={onClose} />
      </EditorSessionProvider>
    </QueryClientProvider>,
  );
  return { session: full, onClose };
}

describe("VersionHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.list.mockReturnValue({ data: summaries, isLoading: false, isError: false });
    h.get.mockImplementation((id: string) => ({
      data: id ? snapshot(id, id === "v2" ? "Acme Maya" : "Older Maya") : undefined,
    }));
  });

  it("lists versions, newest selected, and previews the selected one", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /sent to acme/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /automatic checkpoint/i })).toBeInTheDocument();
    expect(screen.getByText("Acme Maya")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /automatic checkpoint/i }));
    expect(screen.getByText("Older Maya")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    h.list.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderModal();
    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
  });

  it("saves pending edits, then saves a named version", async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => {
      order.push("flush");
      return true;
    });
    h.create.mockImplementation(async () => {
      order.push("create");
      return { id: "v3" };
    });
    renderModal({ flush });
    fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "  Before Globex  " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(order).toEqual(["flush", "create"]));
    expect(h.create).toHaveBeenCalledWith({ data: { resume: "r1", label: "Before Globex" } });
  });

  it("shows the server's message when saving fails", async () => {
    h.create.mockRejectedValue({
      response: { status: 400, data: { detail: "You can keep up to 20 saved versions. Delete one first." } },
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete one first.");
  });

  it("restores after confirming: flush, restore, close, then hand the résumé to the editor", async () => {
    const restored = { id: "r1", title: "PM" };
    h.restore.mockResolvedValue(restored);
    const { session, onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));
    expect(await screen.findByText(/restore this version/i)).toBeInTheDocument();
    expect(h.restore).not.toHaveBeenCalled();
    // The confirm dialog's button is also "Restore"; it's the last one.
    const buttons = screen.getAllByRole("button", { name: /^restore$/i, hidden: true });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(session.onRestored).toHaveBeenCalledWith(restored));
    expect(session.flush).toHaveBeenCalled();
    expect(h.restore).toHaveBeenCalledWith({ id: "v2" });
    expect(onClose).toHaveBeenCalled();
  });

  it("won't restore while edits are unsaved, so they can't be lost", async () => {
    const { session } = renderModal({ flush: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));
    const buttons = await screen.findAllByRole("button", { name: /^restore$/i, hidden: true });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/haven't been saved yet/i);
    expect(h.restore).not.toHaveBeenCalled();
    expect(session.onRestored).not.toHaveBeenCalled();
  });

  it("won't save a version from a stale copy while edits are unsaved", async () => {
    renderModal({ flush: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/haven't been saved yet/i);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("ignores a second Save click while the first is still running", async () => {
    let finishFlush: (v: boolean) => void = () => {};
    const flush = vi.fn(() => new Promise<boolean>((r) => (finishFlush = r)));
    h.create.mockResolvedValue({ id: "v3" });
    renderModal({ flush });
    const save = screen.getByRole("button", { name: /^save$/i });
    fireEvent.click(save);
    fireEvent.click(save);
    finishFlush(true);
    await waitFor(() => expect(h.create).toHaveBeenCalledOnce());
    expect(flush).toHaveBeenCalledOnce();
  });

  it("shows an error with a retry when history can't load", () => {
    const refetch = vi.fn();
    h.list.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderModal();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load/i);
    expect(screen.queryByText(/no history yet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("deletes the selected version after confirming", async () => {
    h.del.mockResolvedValue(undefined);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    const buttons = await screen.findAllByRole("button", { name: /^delete$/i, hidden: true });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(h.del).toHaveBeenCalledWith({ id: "v2" }));
  });

  it("renames the selected version", async () => {
    h.patch.mockResolvedValue({});
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByLabelText("New version name"), { target: { value: "Acme final" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith({ id: "v2", data: { label: "Acme final" } }));
  });
});
