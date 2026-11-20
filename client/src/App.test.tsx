import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

vi.mock("@/features/auth/bootstrap", () => ({ bootstrapAuth: () => Promise.resolve() }));
vi.mock("@/features/demo/useDemoStatus", () => ({
  useDemoStatus: () => ({
    status: {
      demo_mode: true,
      ai_available: true,
      ai_reason: "ok",
      guest_start_available: true,
      turnstile_site_key: "1x00000000000000000000AA",
    },
    isLoading: false,
    demoMode: true,
  }),
}));

import App from "./App";

function renderAppAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App in demo mode", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "unauthenticated" }));

  it.each(["/login", "/register", "/forgot-password", "/reset-password", "/account"])(
    "%s redirects to the landing page in demo mode",
    async (path) => {
      renderAppAt(path);
      expect(
        await screen.findByRole("heading", { level: 1, name: "The resume that writes itself well." }),
      ).toBeInTheDocument();
    },
  );

  it("/account redirects a signed-in guest to the landing page too", async () => {
    useAuthStore.setState({
      status: "authenticated",
      accessToken: "a",
      user: { id: 7, email: "guest-abc@demo.invalid", name: "Demo guest", is_guest: true } as never,
    });
    renderAppAt("/account");
    expect(
      await screen.findByRole("heading", { level: 1, name: "The resume that writes itself well." }),
    ).toBeInTheDocument();
  });
});
