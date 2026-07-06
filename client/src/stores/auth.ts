import { create } from "zustand";

import type { User } from "@/api/generated/model";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  /** Access token — in memory only (never persisted). */
  accessToken: string | null;
  status: AuthStatus;
  setSession: (session: { user: User; access: string }) => void;
  setAccessToken: (access: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

/** Auth/session store. Nothing persists — the refresh token is an httpOnly cookie,
 * and the session is restored on load via bootstrapAuth(). */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: ({ user, access }) => set({ user, accessToken: access, status: "authenticated" }),
  setAccessToken: (access) => set({ accessToken: access }),
  setUser: (user) => set({ user }),
  logout: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
}));

/** Non-reactive auth check for interceptors outside React. */
export const isAuthenticated = () => useAuthStore.getState().status === "authenticated";
