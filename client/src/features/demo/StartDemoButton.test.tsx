import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoStatus } from "@/api/generated/model";
import { useAuthStore } from "@/stores/auth";

const { mutateAsync, getTurnstileToken } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  getTurnstileToken: vi.fn(),
}));
vi.mock("@/api/generated/demo/demo", () => ({
  useStartDemo: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("./turnstile", () => ({ getTurnstileToken }));

import { StartDemoButton } from "./StartDemoButton";

const STATUS: DemoStatus = {
  demo_mode: true,
  turnstile_site_key: "1x00000000000000000000AA",
  ai_available: true,
  ai_reason: "ok",
  guest_start_available: true,
};

const guest = { id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true };

const renderButton = (status: DemoStatus | undefined) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<StartDemoButton status={status} />} />
        <Route path="/resumes/:id" element={<p>editor page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const apiError = (status: number, data: unknown) =>
  new AxiosError("fail", String(status), undefined, null, { status, data } as AxiosResponse);

const start = () => userEvent.click(screen.getByRole("button", { name: "Try the live demo" }));

describe("StartDemoButton", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    getTurnstileToken.mockReset();
    useAuthStore.setState({ user: null, accessToken: null, status: "unauthenticated", sessionEnded: true });
  });

  it("asks visitors not to upload a real resume", () => {
    renderButton(STATUS);
    expect(
      screen.getByText("No sign-up. Your demo resumes are deleted after 24 hours. Please don't upload a real resume."),
    ).toBeInTheDocument();
  });

  it("starts a guest and opens the sample resume", async () => {
    getTurnstileToken.mockResolvedValue("XXXX.DUMMY.TOKEN.XXXX");
    mutateAsync.mockResolvedValue({ user: guest, access: "guest-access", resume_id: "r1" });
    renderButton(STATUS);
    await start();

    expect(await screen.findByText("editor page")).toBeInTheDocument();
    expect(getTurnstileToken).toHaveBeenCalledWith(expect.any(HTMLElement), "1x00000000000000000000AA");
    expect(mutateAsync).toHaveBeenCalledWith({ data: { turnstile_token: "XXXX.DUMMY.TOKEN.XXXX" } });
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      accessToken: "guest-access",
      user: guest,
      sessionEnded: false,
    });
  });

  it("clears the demo-ended notice as soon as a new start begins", async () => {
    getTurnstileToken.mockReturnValue(new Promise(() => {}));
    renderButton(STATUS);
    await start();
    expect(useAuthStore.getState().sessionEnded).toBe(false);
  });

  it("shows the server's words when the start is refused", async () => {
    const detail = "A lot of demos have started from your network recently. Please try again later.";
    getTurnstileToken.mockResolvedValue("XXXX.DUMMY.TOKEN.XXXX");
    mutateAsync.mockRejectedValue(apiError(429, { detail, code: "demo_rate_limited" }));
    renderButton(STATUS);
    await start();

    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
  });

  it("explains when the bot check can't load", async () => {
    getTurnstileToken.mockRejectedValue(new Error("The Turnstile script could not be loaded."));
    renderButton(STATUS);
    await start();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The bot check couldn't load. Please try again, or look at the screenshots below.",
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables the start when the demo is full", () => {
    renderButton({ ...STATUS, guest_start_available: false });
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The demo is full right now. The screenshots below show what it does. Please check back later.",
    );
  });

  it("is unavailable, not broken, when the status is missing", () => {
    renderButton(undefined);
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("The demo can't start right now. Please check back later.");
  });
});
