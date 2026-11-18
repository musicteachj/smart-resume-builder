import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/auth/auth", () => ({
  useRequestPasswordReset: () => ({ mutateAsync, isPending: false }),
}));

import { ForgotPasswordPage } from "./ForgotPasswordPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

const apiError = (status: number, data: unknown) =>
  new AxiosError("fail", String(status), undefined, null, { status, data } as AxiosResponse);

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it("requires a valid email and doesn't submit otherwise", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the same confirmation after sending", async () => {
    mutateAsync.mockResolvedValue({ detail: "ok" });
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "maya@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ data: { email: "maya@example.com" } }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for that email, we sent a reset link. It expires in 1 hour.",
    );
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("explains a throttled request", async () => {
    mutateAsync.mockRejectedValue(apiError(429, { detail: "Request was throttled." }));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "maya@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many reset requests. Try again in an hour.",
    );
  });

  it("shows a retry message when the request fails", async () => {
    mutateAsync.mockRejectedValue(apiError(500, {}));
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "maya@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send the reset link/i);
  });
});
