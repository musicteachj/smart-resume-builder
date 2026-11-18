import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/auth/auth", () => ({
  useConfirmPasswordReset: () => ({ mutateAsync, isPending: false }),
}));

import { ResetPasswordPage } from "./ResetPasswordPage";

function LoginStub() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  return <p>login page: {notice}</p>;
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  );

const VALID_LINK = "/reset-password#uid=MQ&token=abc-123";

const apiError = (status: number, data: unknown) =>
  new AxiosError("fail", String(status), undefined, null, { status, data } as AxiosResponse);

async function fillAndSubmit(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
  await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    useAuthStore.setState({ accessToken: null, user: null, status: "unauthenticated" });
  });

  it("explains a link with no uid or token, with a way to get a new one", () => {
    renderAt("/reset-password");
    expect(screen.getByRole("alert")).toHaveTextContent("This reset link is invalid or has expired.");
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("removes uid and token from the address bar but still uses them", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    mutateAsync.mockResolvedValue(undefined);
    renderAt(VALID_LINK);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0].slice(1)).toEqual(["", "/reset-password"]);
    expect(window.location.hash).toBe("");
    replaceState.mockRestore();

    await fillAndSubmit("brand-New-pass-42");
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: { uid: "MQ", token: "abc-123", new_password: "brand-New-pass-42" },
      }),
    );
  });

  it("validates length and matching passwords before submitting", async () => {
    renderAt(VALID_LINK);
    await fillAndSubmit("short");
    expect(await screen.findByText("At least 8 characters")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await fillAndSubmit("long-enough-pass", "different-pass");
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("sends uid, token, and the new password, then goes to sign in with a notice", async () => {
    mutateAsync.mockResolvedValue(undefined);
    useAuthStore.setState({ accessToken: "a", status: "authenticated" });
    renderAt(VALID_LINK);
    await fillAndSubmit("brand-New-pass-42");

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: { uid: "MQ", token: "abc-123", new_password: "brand-New-pass-42" },
      }),
    );
    expect(await screen.findByText(/login page: Your password was reset/)).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("shows the invalid-link state when the server rejects the link", async () => {
    mutateAsync.mockRejectedValue(apiError(400, { detail: "This reset link is invalid or has expired." }));
    renderAt(VALID_LINK);
    await fillAndSubmit("brand-New-pass-42");
    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link is invalid or has expired.");
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeInTheDocument();
  });

  it("shows the server's password error under the field", async () => {
    mutateAsync.mockRejectedValue(
      apiError(400, { new_password: ["The password is too similar to the email."] }),
    );
    renderAt(VALID_LINK);
    await fillAndSubmit("maya@example");
    expect(await screen.findByText("The password is too similar to the email.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("doesn't treat a throttled request as a bad link", async () => {
    mutateAsync.mockRejectedValue(apiError(429, { detail: "Request was throttled." }));
    renderAt(VALID_LINK);
    await fillAndSubmit("brand-New-pass-42");
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});
