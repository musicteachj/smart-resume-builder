import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { User } from "@/api/generated/model";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (session: { user: User; access: string; refresh: string }) => void;
  setAccessToken: (access: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

/** Auth/session store. Tokens persist to localStorage so a reload stays signed in. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, access, refresh }) =>
        set({ user, accessToken: access, refreshToken: refresh }),
      setAccessToken: (access) => set({ accessToken: access }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: "srb-auth" },
  ),
);

/** Non-reactive auth check for guards/interceptors outside React. */
export const isAuthenticated = () => Boolean(useAuthStore.getState().accessToken);
