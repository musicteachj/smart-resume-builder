import { create } from "zustand";

import type { User } from "@/api/generated/model";
import { queryClient } from "@/api/queryClient";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  /** Access token, in memory only (never persisted). */
  accessToken: string | null;
  status: AuthStatus;
  /** A session that was in use ended on its own (a demo expired or was ended elsewhere),
   * so the landing page can say so. Cleared by a new session or `clearSessionEnded`. */
  sessionEnded: boolean;
  setSession: (session: { user: User; access: string }) => void;
  setAccessToken: (access: string) => void;
  setUser: (user: User) => void;
  logout: (options?: { sessionEnded?: boolean }) => void;
  clearSessionEnded: () => void;
}

/** Auth/session store. Nothing persists: the refresh token is an httpOnly cookie,
 * and the session is restored on load via bootstrapAuth(). */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  sessionEnded: false,
  setSession: ({ user, access }) =>
    set({ user, accessToken: access, status: "authenticated", sessionEnded: false }),
  setAccessToken: (access) => set({ accessToken: access }),
  setUser: (user) => set({ user }),
  // Every sign-out path (menu, failed refresh, account deletion) also drops the query
  // cache, so one user's résumés are never shown to the next person on this browser.
  // A plain logout never clears `sessionEnded`: a late request that fails after the session
  // ended must not hide the notice that says so.
  logout: (options) => {
    set((state) => ({
      user: null,
      accessToken: null,
      status: "unauthenticated",
      sessionEnded: state.sessionEnded || options?.sessionEnded === true,
    }));
    queryClient.clear();
  },
  clearSessionEnded: () => set({ sessionEnded: false }),
}));

/** Non-reactive auth check for interceptors outside React. */
export const isAuthenticated = () => useAuthStore.getState().status === "authenticated";
