import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/stores/auth";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/auth/auth", () => ({
  useDeleteAccount: () => ({ mutateAsync, isPending: false }),
}));

import { EndDemoDialog } from "./EndDemoDialog";

const onOpenChange = vi.fn();

const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<EndDemoDialog open onOpenChange={onOpenChange} />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe("EndDemoDialog", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    onOpenChange.mockReset();
    queryClient.clear();
    useAuthStore.setState({
      accessToken: "a",
      status: "authenticated",
      sessionEnded: false,
      user: { id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true } as never,
    });
  });

  it("says what ending the demo does", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "End your demo?" });
    expect(dialog).toHaveTextContent(
      "Signing out ends this demo and deletes its resumes right away. You can start a new demo from the home page anytime.",
    );
    expect(screen.getByRole("button", { name: "Keep working" })).toBeInTheDocument();
  });

  it("ending the demo deletes it without a password, then signs out", async () => {
    mutateAsync.mockResolvedValue(undefined);
    queryClient.setQueryData(["/api/resumes/"], [{ id: "r1" }]);
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "End demo" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ data: {} }));
    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", user: null, sessionEnded: false });
    expect(queryClient.getQueryData(["/api/resumes/"])).toBeUndefined();
  });

  it("keeps the session and says so when ending fails", async () => {
    mutateAsync.mockRejectedValue(new Error("network"));
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "End demo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't end your demo. Please try again.");
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("Keep working closes the dialog without ending anything", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Keep working" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
