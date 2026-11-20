import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

vi.mock("@/api/generated/auth/auth", () => ({
  useDeleteAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AppHeader } from "./AppHeader";

const usage = { calls_today: 2, daily_limit: 10, calls_this_month: 2, monthly_limit: 50 };

function signIn(user: Record<string, unknown>) {
  useAuthStore.setState({ status: "authenticated", accessToken: "a", user: { ai_usage: usage, ...user } as never });
}

const renderHeader = () =>
  render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  );

const openMenu = () => userEvent.click(screen.getByRole("button", { name: "Account menu" }));

describe("AppHeader", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "loading" }));

  it("an account sees its email, usage, Account, and Sign out", async () => {
    signIn({ id: 1, email: "maya@example.com", name: "Maya Chen", is_guest: false });
    renderHeader();
    expect(screen.getByText("2 / 10 today")).toBeInTheDocument();
    await openMenu();
    expect(await screen.findByText("maya@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("a guest sees Demo guest, not the synthetic email, and no Account item", async () => {
    signIn({ id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true });
    renderHeader();
    expect(screen.queryByText("2 / 10 today")).not.toBeInTheDocument();
    await openMenu();
    expect(await screen.findByText("Demo guest")).toBeInTheDocument();
    expect(screen.queryByText(/demo\.invalid/)).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);

    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out and end demo" }));
    expect(await screen.findByRole("dialog", { name: "End your demo?" })).toBeInTheDocument();
  });
});
