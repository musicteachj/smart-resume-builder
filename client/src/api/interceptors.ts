import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/stores/auth";

import { AXIOS_INSTANCE } from "./axios";

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAccessToken, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return null;
  }
  try {
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>(
      "/api/auth/refresh",
      { refresh: refreshToken },
    );
    setAccessToken(data.access);
    return data.access;
  } catch {
    logout();
    return null;
  }
}

const AUTH_ENDPOINTS = ["/api/auth/login", "/api/auth/refresh", "/api/auth/register"];

/** Attach the JWT to every request and transparently refresh it on 401. */
export function installAuthInterceptors() {
  AXIOS_INSTANCE.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  });

  AXIOS_INSTANCE.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retry?: boolean })
        | undefined;
      const isAuthCall = AUTH_ENDPOINTS.some((p) => (original?.url ?? "").includes(p));

      if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
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
