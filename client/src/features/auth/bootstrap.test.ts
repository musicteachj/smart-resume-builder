import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AXIOS_INSTANCE } from "@/api/axios";
import { useAuthStore } from "@/stores/auth";

import { bootstrapAuth } from "./bootstrap";

const seen: string[] = [];
let refreshStatus = 200;
const original = AXIOS_INSTANCE.defaults.adapter;

const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  seen.push(config.url ?? "");
  const isRefresh = config.url === "/api/auth/refresh";
  const status = isRefresh ? refreshStatus : 200;
  const data = isRefresh ? { access: "new-access" } : { id: 1, email: "a@example.com", name: "A" };
  const response = { data, status, statusText: "", headers: {}, config };
  if (status >= 400) throw new AxiosError("fail", String(status), config, null, response);
  return response;
};

beforeEach(() => {
  seen.length = 0;
  refreshStatus = 200;
  AXIOS_INSTANCE.defaults.adapter = adapter;
  useAuthStore.setState({ user: null, accessToken: null, status: "loading" });
});

afterEach(() => {
  AXIOS_INSTANCE.defaults.adapter = original;
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
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
});
