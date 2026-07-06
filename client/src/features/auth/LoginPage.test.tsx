import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/auth/auth", () => ({
  useLogin: () => ({ mutateAsync, isPending: false }),
}));

import { LoginPage } from "./LoginPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

describe("LoginPage", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    useAuthStore.setState({ accessToken: null, user: null, status: "loading" });
  });

  it("shows validation errors and does not submit when empty", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("submits valid credentials", async () => {
    mutateAsync.mockResolvedValue({ user: { id: 1 }, access: "a" });
    renderPage();
    await userEvent.type(screen.getByLabelText("Email"), "maya@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "sup3rSecret!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: { email: "maya@example.com", password: "sup3rSecret!" },
      }),
    );
  });
});
