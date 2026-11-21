import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AXIOS_INSTANCE } from "@/api/axios";
import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/stores/auth";

import { bootstrapAuth } from "./bootstrap";

const seen: string[] = [];
let refreshStatus = 200;
let refreshBody: unknown = { access: "new-access" };
const original = AXIOS_INSTANCE.defaults.adapter;

const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  seen.push(config.url ?? "");
  const isRefresh = config.url === "/api/auth/refresh";
  const status = isRefresh ? refreshStatus : 200;
  const data = isRefresh ? refreshBody : { id: 1, email: "a@example.com", name: "A" };
  const response = { data, status, statusText: "", headers: {}, config };
  if (status >= 400) throw new AxiosError("fail", String(status), config, null, response);
  return response;
};

beforeEach(() => {
  seen.length = 0;
  refreshStatus = 200;
  refreshBody = { access: "new-access" };
  AXIOS_INSTANCE.defaults.adapter = adapter;
  useAuthStore.setState({ user: null, accessToken: null, status: "loading", sessionEnded: false });
});

afterEach(() => {
  AXIOS_INSTANCE.defaults.adapter = original;
  vi.restoreAllMocks();
});

describe("bootstrapAuth", () => {
  it("restores the session from the refresh cookie", async () => {
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", accessToken: "new-access" });
  });

  it("shares one refresh between overlapping calls (StrictMode runs the effect twice)", async () => {
    await Promise.all([bootstrapAuth(), bootstrapAuth()]);
    expect(seen.filter((url) => url === "/api/auth/refresh")).toHaveLength(1);
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("signs out when the refresh fails, and a later call tries again", async () => {
    refreshStatus = 401;
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("unauthenticated");

    refreshStatus = 200;
    refreshBody = { access: "new-access" };
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("a refused cookie at load marks the session ended", async () => {
    refreshStatus = 401;
    refreshBody = { detail: "Your session ended.", code: "session_ended" };
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: true });
  });

  it.each([
    ["a 429 (shared office IP)", 429, { detail: "Request was throttled." }],
    ["a 5xx", 503, {}],
  ])("%s on refresh at load is never an ended session and leaves the cookie alone", async (_label, status, body) => {
    refreshStatus = status;
    refreshBody = body;
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });
    // No logout call, so the httpOnly refresh cookie survives and the next load restores the session.
    expect(seen).toEqual(["/api/auth/refresh"]);

    refreshStatus = 200;
    refreshBody = { access: "new-access" };
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("a network error on refresh at load is never an ended session", async () => {
    AXIOS_INSTANCE.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    };
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });
  });

  it("no cookie at load is a quiet sign-out", async () => {
    refreshStatus = 401;
    refreshBody = { detail: "No refresh token.", code: "no_session" };
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });
  });

  it.each([
    ["no cookie (no_session)", 401, { detail: "No refresh token.", code: "no_session" }, false],
    ["a refused cookie (session_ended)", 401, { detail: "Your session ended.", code: "session_ended" }, true],
    ["a 429", 429, { detail: "Request was throttled." }, false],
  ])("a failure at load (%s) never clears or removes cached queries", async (_label, status, body, ended) => {
    const clear = vi.spyOn(queryClient, "clear");
    const remove = vi.spyOn(queryClient, "removeQueries");
    refreshStatus = status;
    refreshBody = body;
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: ended });
    expect(clear).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("a failure after a session was in use still signs out the usual way (cache cleared)", async () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "a", user: { id: 1 } as never });
    const remove = vi.spyOn(queryClient, "removeQueries");
    refreshStatus = 401;
    refreshBody = { detail: "Your session ended.", code: "session_ended" };
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: true });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
