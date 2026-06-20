import { AxiosError } from "axios";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/auth";

import { aiErrorMessage } from "./aiError";

function axiosErr(status: number, data: unknown): AxiosError {
  return { isAxiosError: true, response: { status, data } } as AxiosError;
}

describe("aiErrorMessage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 1, email: "a@b.com", name: "A", is_admin: false, created_at: "", ai_usage: undefined },
      accessToken: "t",
      refreshToken: "r",
    } as never);
  });

  it("surfaces the server detail on 429 and syncs usage to the store", () => {
    const usage = { calls_today: 10, calls_this_month: 12, daily_limit: 10, monthly_limit: 50, is_admin: false };
    const msg = aiErrorMessage(axiosErr(429, { detail: "Daily AI limit reached (10/day).", ai_usage: usage }));
    expect(msg).toContain("Daily AI limit reached");
    expect(useAuthStore.getState().user?.ai_usage).toEqual(usage);
  });

  it("surfaces the server detail on 502", () => {
    expect(aiErrorMessage(axiosErr(502, { detail: "AI is not configured." }))).toBe("AI is not configured.");
  });

  it("falls back to a generic message when there's no detail", () => {
    expect(aiErrorMessage(axiosErr(500, {}))).toMatch(/something went wrong/i);
  });
});
