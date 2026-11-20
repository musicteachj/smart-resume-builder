import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AXIOS_INSTANCE } from "@/api/axios";
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

  it("no cookie at load is a quiet sign-out", async () => {
    refreshStatus = 401;
    refreshBody = { detail: "No refresh token.", code: "no_session" };
    await bootstrapAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });
  });
});
