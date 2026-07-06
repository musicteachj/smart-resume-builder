import type { User } from "@/api/generated/model";

import { AXIOS_INSTANCE } from "@/api/axios";
import { useAuthStore } from "@/stores/auth";

/** Restore the session on load: exchange the refresh cookie for an access token,
 * then load the user. On failure, mark unauthenticated. Runs once at app start. */
export async function bootstrapAuth(): Promise<void> {
  const { setAccessToken, setSession, logout } = useAuthStore.getState();
  try {
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>("/api/auth/refresh");
    setAccessToken(data.access); // so the /me request carries the Authorization header
    const me = await AXIOS_INSTANCE.get<User>("/api/auth/me");
    setSession({ user: me.data, access: data.access });
  } catch {
    logout();
  }
}
