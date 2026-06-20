import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/api/generated/ai/ai", () => ({
  useImproveBullet: () => ({ mutateAsync, isPending: false }),
}));

import { ImproveBulletButton } from "./ImproveBulletButton";

const usage = { calls_today: 1, calls_this_month: 1, daily_limit: 10, monthly_limit: 50, is_admin: false };

describe("ImproveBulletButton", () => {
  beforeEach(() => mutateAsync.mockReset());

  it("is disabled when the bullet is empty", () => {
    render(<ImproveBulletButton value="   " onAccept={vi.fn()} />);
    expect(screen.getByRole("button", { name: /improve with ai/i })).toBeDisabled();
  });

  it("fetches a suggestion and applies it on Accept", async () => {
    mutateAsync.mockResolvedValue({ suggestion: "Led a redesign that lifted engagement 34%.", ai_usage: usage });
    const onAccept = vi.fn();
    render(<ImproveBulletButton value="did design work" onAccept={onAccept} />);

    await userEvent.click(screen.getByRole("button", { name: /improve with ai/i }));
    expect(await screen.findByText("Led a redesign that lifted engagement 34%.")).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledWith({ data: { text: "did design work" } });

    await userEvent.click(screen.getByRole("button", { name: /^accept$/i }));
    expect(onAccept).toHaveBeenCalledWith("Led a redesign that lifted engagement 34%.");
  });
});
