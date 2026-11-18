import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/stores/auth";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/auth/auth", () => ({
  useDeleteAccount: () => ({ mutateAsync, isPending: false }),
}));

import { DeleteAccountDialog } from "./DeleteAccountDialog";

const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route path="/account" element={<DeleteAccountDialog open onOpenChange={() => {}} />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const apiError = (status: number, data: unknown) =>
  new AxiosError("fail", String(status), undefined, null, { status, data } as AxiosResponse);

const submit = () => userEvent.click(screen.getByRole("button", { name: "Delete account" }));

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    queryClient.clear();
    useAuthStore.setState({
      accessToken: "a",
      status: "authenticated",
      user: { id: 1, email: "maya@example.com", name: "Maya Chen" } as never,
    });
  });

  it("says what gets deleted", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /permanently deletes your account and all of your résumés, saved versions, and cover letters/i,
    );
  });

  it("requires the password before calling the server", async () => {
    renderDialog();
    await submit();
    expect(await screen.findByText("Enter your password to confirm")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows a wrong-password error and keeps the session", async () => {
    mutateAsync.mockRejectedValue(apiError(400, { password: ["Incorrect password."] }));
    renderDialog();
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await submit();
    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("deletes, clears the session and cached data, and goes home", async () => {
    mutateAsync.mockResolvedValue(undefined);
    queryClient.setQueryData(["/api/resumes/"], [{ id: "r1", title: "Private résumé" }]);
    renderDialog();
    await userEvent.type(screen.getByLabelText("Password"), "sup3rSecret!");
    await submit();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ data: { password: "sup3rSecret!" } }));
    expect(await screen.findByText("home page")).toBeInTheDocument();
    const state = useAuthStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(queryClient.getQueryData(["/api/resumes/"])).toBeUndefined();
  });
});
