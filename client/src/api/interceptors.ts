import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { isAuthenticated, useAuthStore } from "@/stores/auth";

import { AXIOS_INSTANCE } from "./axios";

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { setAccessToken, logout } = useAuthStore.getState();
  const wasSignedIn = isAuthenticated();
  try {
    // The refresh token rides along as an httpOnly cookie, so no request body is needed.
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>("/api/auth/refresh");
    setAccessToken(data.access);
    return data.access;
  } catch (err) {
    // Only a 401 ends the session. While a session was in use that means it ended under us:
    // refused (`session_ended`), or its cookie is gone (`no_session`: a demo past its 24 hours,
    // whose cookie the browser dropped, or one ended in another tab).
    // A 429 (several visitors behind one office IP), a 5xx, or a network error says nothing about
    // the session, so it stays as it is and only the original request fails. The next request that
    // gets a 401 tries the refresh once more; nothing retries on its own.
    if ((err as AxiosError)?.response?.status === 401) logout({ sessionEnded: wasSignedIn });
    return null;
  }
}

// Public auth endpoints: they never get the Bearer (an expired one would make the server
// 401 the refresh/logout itself) and a 401 from them never triggers a refresh.
// `/api/auth/delete-account` is deliberately NOT listed: it is authenticated, so it needs
// the Bearer, and an expired token there should refresh and retry like any API call.
const AUTH_ENDPOINTS = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/password-reset",
  "/api/auth/password-reset/confirm",
];

const isAuthEndpoint = (url: string | undefined) => AUTH_ENDPOINTS.some((p) => (url ?? "").includes(p));

/** Attach the JWT to every request and transparently refresh it on 401. */
export function installAuthInterceptors() {
  AXIOS_INSTANCE.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && !isAuthEndpoint(config.url)) config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  });

  AXIOS_INSTANCE.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retry?: boolean })
        | undefined;
      const isAuthCall = isAuthEndpoint(original?.url);

      // No access token means no session in use (signed out, or it just ended): a late 401
      // then never starts another refresh, so a failed refresh can't loop.
      const hasSession = useAuthStore.getState().accessToken !== null;
      if (error.response?.status === 401 && original && !original._retry && !isAuthCall && hasSession) {
        original._retry = true;
        refreshing = refreshing ?? refreshAccessToken();
        const newToken = await refreshing;
        refreshing = null;
        if (newToken) {
          original.headers.set("Authorization", `Bearer ${newToken}`);
          return AXIOS_INSTANCE(original);
        }
      }
      return Promise.reject(error);
    },
  );
}
