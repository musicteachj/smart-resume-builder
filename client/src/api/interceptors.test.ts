import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/auth";

import { AXIOS_INSTANCE } from "./axios";
import { installAuthInterceptors } from "./interceptors";

/** Fake server: records every request and answers via `respond`. */
const seen: InternalAxiosRequestConfig[] = [];
let respond: (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

const adapter: AxiosAdapter = async (config) => {
  seen.push(config);
  const { status, data = {} } = respond(config);
  const response = { data, status, statusText: "", headers: {}, config };
  if (status >= 400) {
    throw new AxiosError("fail", String(status), config, null, response);
  }
  return response;
};

const authHeader = (url: string) =>
  seen.find((c) => c.url === url)?.headers.get("Authorization") ?? null;

beforeAll(() => {
  AXIOS_INSTANCE.defaults.adapter = adapter;
  installAuthInterceptors();
});

beforeEach(() => {
  seen.length = 0;
  respond = () => ({ status: 200 });
  useAuthStore.setState({ accessToken: "stale-token", status: "authenticated", sessionEnded: false });
});

describe("auth interceptors", () => {
  it("attaches the Bearer to API calls", async () => {
    await AXIOS_INSTANCE.get("/api/resumes/");
    expect(authHeader("/api/resumes/")).toBe("Bearer stale-token");
  });

  it("never sends the Bearer to the public auth endpoints", async () => {
    // An expired Bearer made the server 401 refresh/logout, logging users out after 15 minutes.
    for (const url of [
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/password-reset",
      "/api/auth/password-reset/confirm",
    ]) {
      await AXIOS_INSTANCE.post(url);
      expect(authHeader(url)).toBeNull();
    }
  });

  it("sends the Bearer to delete-account, which is authenticated", async () => {
    await AXIOS_INSTANCE.post("/api/auth/delete-account", { password: "x" });
    expect(authHeader("/api/auth/delete-account")).toBe("Bearer stale-token");
  });

  it("refreshes an expired token and retries the call", async () => {
    respond = (config) => {
      if (config.url === "/api/auth/refresh") return { status: 200, data: { access: "fresh-token" } };
      const auth = config.headers.get("Authorization");
      return auth === "Bearer fresh-token" ? { status: 200 } : { status: 401 };
    };
    await AXIOS_INSTANCE.get("/api/resumes/");
    expect(seen.map((c) => c.url)).toEqual(["/api/resumes/", "/api/auth/refresh", "/api/resumes/"]);
    expect(useAuthStore.getState().accessToken).toBe("fresh-token");
  });

  it("doesn't try to refresh when logout itself fails", async () => {
    respond = () => ({ status: 401 });
    await expect(AXIOS_INSTANCE.post("/api/auth/logout")).rejects.toBeInstanceOf(AxiosError);
    expect(seen.map((c) => c.url)).toEqual(["/api/auth/logout"]);
  });

  it("a failed refresh mid-session marks the session ended", async () => {
    respond = (config) =>
      config.url === "/api/auth/refresh"
        ? { status: 401, data: { detail: "Your session ended.", code: "session_ended" } }
        : { status: 401 };
    await expect(AXIOS_INSTANCE.get("/api/resumes/")).rejects.toBeInstanceOf(AxiosError);
    expect(seen.map((c) => c.url)).toEqual(["/api/resumes/", "/api/auth/refresh"]);
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: true });
  });

  it("a cookie gone mid-session (the demo expired or ended in another tab) also ends it", async () => {
    respond = (config) =>
      config.url === "/api/auth/refresh"
        ? { status: 401, data: { detail: "No refresh token.", code: "no_session" } }
        : { status: 401 };
    await expect(AXIOS_INSTANCE.get("/api/resumes/")).rejects.toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState().sessionEnded).toBe(true);
  });

  it("a refresh that fails while signed out is quiet", async () => {
    useAuthStore.setState({ status: "loading" });
    respond = (config) =>
      config.url === "/api/auth/refresh"
        ? { status: 401, data: { detail: "No refresh token.", code: "no_session" } }
        : { status: 401 };
    await expect(AXIOS_INSTANCE.get("/api/auth/me")).rejects.toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: false });
  });

  it("never refreshes again once the session is gone (no retry loop)", async () => {
    respond = () => ({ status: 401 });
    await expect(AXIOS_INSTANCE.get("/api/resumes/")).rejects.toBeInstanceOf(AxiosError);
    // A request still in flight when the session ended comes back 401: no second refresh.
    await expect(AXIOS_INSTANCE.get("/api/resumes/")).rejects.toBeInstanceOf(AxiosError);
    expect(seen.filter((c) => c.url === "/api/auth/refresh")).toHaveLength(1);
    expect(useAuthStore.getState().sessionEnded).toBe(true);
  });
});
