import type { User } from "@/api/generated/model";

import { AXIOS_INSTANCE } from "@/api/axios";
import { useAuthStore } from "@/stores/auth";

// Single-flight. React StrictMode runs the mount effect twice in development, and two
// refreshes racing with the same cookie lose: rotation blacklists the token the first one
// spent, so the second gets a 401 and signs the user out (bouncing a deep link, such as
// the editor, through /login to the dashboard).
let inflight: Promise<void> | null = null;

/** Restore the session on load: exchange the refresh cookie for an access token,
 * then load the user. On failure, mark unauthenticated. Runs once at app start. */
export function bootstrapAuth(): Promise<void> {
  inflight ??= restoreSession().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function restoreSession(): Promise<void> {
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
