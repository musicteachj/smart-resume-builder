import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

// The modals open only on demand; the menu itself is under test.
vi.mock("./AtsHealthModal", () => ({ AtsHealthModal: () => null }));
vi.mock("./CoverLettersModal", () => ({ CoverLettersModal: () => null }));
vi.mock("./GenerateSummaryModal", () => ({ GenerateSummaryModal: () => null }));
vi.mock("./TailorModal", () => ({ TailorModal: () => null }));

import { AiMenu } from "./AiMenu";

const usage = { calls_today: 3, daily_limit: 10, calls_this_month: 3, monthly_limit: 50 };

describe("AiMenu", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "loading" }));

  it("shows today's usage to an account", async () => {
    useAuthStore.setState({ status: "authenticated", user: { is_guest: false, ai_usage: usage } as never });
    render(<AiMenu />);
    await userEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(await screen.findByText("3 / 10 AI calls today")).toBeInTheDocument();
  });

  it("hides the usage line from a guest", async () => {
    useAuthStore.setState({ status: "authenticated", user: { is_guest: true, ai_usage: usage } as never });
    render(<AiMenu />);
    await userEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(await screen.findByRole("menuitem", { name: "Generate summary" })).toBeInTheDocument();
    expect(screen.queryByText(/AI calls today/)).not.toBeInTheDocument();
  });
});
