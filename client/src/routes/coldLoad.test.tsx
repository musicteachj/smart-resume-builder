import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AXIOS_INSTANCE } from "@/api/axios";
import { queryClient } from "@/api/queryClient";
import { bootstrapAuth } from "@/features/auth/bootstrap";
import { useAuthStore } from "@/stores/auth";

import { AccountsOnlyRoute, PublicOnlyRoute } from "./guards";

// The real app QueryClient, bootstrap, and useDemoStatus: only the network is faked. On a cold load
// with no session, the bootstrap's sign-out used to clear the query cache while `/api/demo/status`
// was still in flight, which stranded the mounted query and left /login on the Loading splash forever.

const original = AXIOS_INSTANCE.defaults.adapter;
let answerDemoStatus: (() => void) | null = null;

const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
  const reply = (status: number, data: unknown) => ({ data, status, statusText: "", headers: {}, config });
  if (config.url === "/api/auth/refresh") {
    const response = reply(401, { detail: "No refresh token.", code: "no_session" });
    return Promise.reject(new AxiosError("fail", "401", config, null, response));
  }
  if (config.url === "/api/demo/status") {
    // Held open until the test answers it, so the bootstrap fails first.
    return new Promise((resolve) => {
      answerDemoStatus = () =>
        resolve(
          reply(200, {
            demo_mode: false,
            ai_available: true,
            ai_reason: "ok",
            guest_start_available: false,
            turnstile_site_key: "",
          }),
        );
    });
  }
  return Promise.reject(new Error(`unexpected request ${config.url}`));
};

beforeEach(() => {
  answerDemoStatus = null;
  queryClient.clear();
  AXIOS_INSTANCE.defaults.adapter = adapter;
  useAuthStore.setState({ user: null, accessToken: null, status: "loading", sessionEnded: false });
});

afterEach(() => {
  AXIOS_INSTANCE.defaults.adapter = original;
  queryClient.clear();
});

function renderLogin() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/" element={<div>LANDING</div>} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route element={<AccountsOnlyRoute />}>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>LOGIN</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("cold load with no session", () => {
  it("resolves /login even when the bootstrap fails while the demo status is in flight", async () => {
    renderLogin();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(answerDemoStatus).not.toBeNull(); // the demo status request is in flight

    await act(() => bootstrapAuth());
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });

    await act(async () => answerDemoStatus!());
    expect(await screen.findByText("LOGIN")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("a real sign-out while the demo status is in flight keeps it, so the route still resolves", async () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "a", user: { id: 1 } as never });
    renderLogin();
    expect(answerDemoStatus).not.toBeNull();

    act(() => useAuthStore.getState().logout());
    await act(async () => answerDemoStatus!());
    expect(await screen.findByText("LOGIN")).toBeInTheDocument();
  });
});
