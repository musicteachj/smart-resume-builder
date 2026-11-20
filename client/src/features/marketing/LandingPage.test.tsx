import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoStatus } from "@/api/generated/model";
import { useAuthStore } from "@/stores/auth";

const { demo } = vi.hoisted(() => ({
  demo: { status: undefined, isLoading: false, demoMode: false } as {
    status: DemoStatus | undefined;
    isLoading: boolean;
    demoMode: boolean;
  },
}));
vi.mock("@/features/demo/useDemoStatus", () => ({ useDemoStatus: () => demo }));
vi.mock("@/api/generated/demo/demo", () => ({
  useStartDemo: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { LandingPage } from "./LandingPage";

const DEMO: DemoStatus = {
  demo_mode: true,
  ai_available: true,
  ai_reason: "ok",
  guest_start_available: true,
  turnstile_site_key: "1x00000000000000000000AA",
};

function renderLanding(status: DemoStatus | undefined, { isLoading = false, failed = false } = {}) {
  Object.assign(demo, { status, isLoading, demoMode: failed || status?.demo_mode === true });
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

const turnstileScripts = () => document.querySelectorAll('script[src^="https://challenges.cloudflare.com"]');

const DEMO_ENDED = "Your demo ended. Demos last 24 hours. You can start a new one anytime.";
const AI_NOTICE =
  "Today's live AI budget is used up. The editor, templates, and PDF and Word export still work, and the screenshots below show the AI features.";

describe("LandingPage", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "unauthenticated", sessionEnded: false }));

  it("demo mode offers the live demo, the notice, and no sign-in", () => {
    renderLanding(DEMO);
    expect(screen.getByRole("heading", { level: 1, name: "The resume that writes itself well." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    expect(screen.getByText(/Please don't upload a real resume\./)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Build my resume/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
    expect(screen.queryByText(AI_NOTICE)).toBeNull();
  });

  it("says when today's live AI budget is used, before any bot check", async () => {
    renderLanding({ ...DEMO, ai_available: false, ai_reason: "daily_used" });
    expect(await within(screen.getByRole("status")).findByText(AI_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    expect(turnstileScripts()).toHaveLength(0);
  });

  it("disables the start when the demo is full", () => {
    renderLanding({ ...DEMO, guest_start_available: false });
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeDisabled();
    expect(
      screen.getByText("The demo is full right now. The screenshots below show what it does. Please check back later."),
    ).toBeInTheDocument();
  });

  it("shows the demo-ended notice after a session ends", async () => {
    useAuthStore.setState({ sessionEnded: true });
    renderLanding(DEMO);
    expect(await within(screen.getByRole("status")).findByText(DEMO_ENDED)).toBeInTheDocument();
  });

  it("mounts the notice's live region empty and fills it after, so screen readers announce it", async () => {
    useAuthStore.setState({ sessionEnded: true });
    renderLanding(DEMO);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    // The visible notice is there from the first render, so nothing below it moves.
    expect(screen.getByText(DEMO_ENDED)).toBeVisible();
    expect(await within(region).findByText(DEMO_ENDED)).toBeInTheDocument();
  });

  it("waits for a reload's session restore, then shows the start to a visitor without one", () => {
    useAuthStore.setState({ status: "loading" });
    renderLanding(DEMO);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to your demo" })).toBeNull();

    // No cookie: bootstrap signs out quietly, and the start appears.
    act(() => useAuthStore.setState({ status: "unauthenticated" }));
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Back to your demo" })).toBeNull();
  });

  it("waits for a reload's session restore, then sends a guest back to the demo", () => {
    useAuthStore.setState({ status: "loading" });
    renderLanding(DEMO);
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to your demo" })).toBeNull();

    act(() =>
      useAuthStore.setState({
        status: "authenticated",
        accessToken: "a",
        user: { id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true } as never,
      }),
    );
    expect(screen.getByRole("link", { name: "Back to your demo" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
  });

  it("doesn't wait for the session restore outside demo mode", () => {
    useAuthStore.setState({ status: "loading" });
    renderLanding({ ...DEMO, demo_mode: false, guest_start_available: false });
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("a guest still signed in goes back to the demo instead of starting another", () => {
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "a",
      user: { id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true } as never,
    });
    renderLanding(DEMO);
    expect(screen.getByRole("link", { name: "Back to your demo" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
  });

  it("a signed-out visitor gets the start, not the way back", () => {
    renderLanding(DEMO);
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Back to your demo" })).toBeNull();
  });

  it("fails closed when the status can't load: no sign-in, and no start", () => {
    renderLanding(undefined, { failed: true });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try the live demo" })).toBeDisabled();
  });

  it("shows the loading splash, not either landing, while the status loads", () => {
    renderLanding(undefined, { isLoading: true });
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
  });

  it("keeps today's landing outside demo mode", () => {
    useAuthStore.setState({ sessionEnded: true });
    renderLanding({ ...DEMO, demo_mode: false, guest_start_available: false });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /Build my resume/ })).toHaveAttribute("href", "/register");
    expect(screen.getByText("Free to start · No credit card required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try the live demo" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
