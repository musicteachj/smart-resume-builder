import type { AxiosError } from "axios";

import type { User } from "@/api/generated/model";

import { AXIOS_INSTANCE } from "@/api/axios";
import { useAuthStore } from "@/stores/auth";

// Single-flight. React StrictMode runs the mount effect twice in development, and two
// refreshes racing with the same cookie lose: rotation blacklists the token the first one
// spent, so the second gets a 401 and signs the user out (bouncing a deep link, such as
// the editor, through /login to the dashboard).
let inflight: Promise<void> | null = null;

/** Restore the session on load: exchange the refresh cookie for an access token,
 * then load the user. On failure, mark unauthenticated: quietly when there was no cookie
 * (`no_session`), and as an ended session when the server refused the cookie it had
 * (`session_ended`, for example a demo past its 24 hours). Runs once at app start.
 *
 * A refresh that fails for any other reason (a 429 from a shared office IP, a 5xx, a network
 * error) also leaves the visitor unauthenticated, but never as an ended session, and nothing
 * here touches the cookie (it is httpOnly and only the logout endpoint clears it), so the next
 * reload restores the session. Waiting on a spinner instead would leave the visitor stuck.
 *
 * A failure at load never clears the query cache (nothing user-scoped has loaded yet); a sign-out
 * after a session was in use (menu, end demo, a failed refresh mid-session) still does. */
export function bootstrapAuth(): Promise<void> {
  inflight ??= restoreSession().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function restoreSession(): Promise<void> {
  const { setAccessToken, setSession } = useAuthStore.getState();
  try {
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>("/api/auth/refresh");
    setAccessToken(data.access); // so the /me request carries the Authorization header
    const me = await AXIOS_INSTANCE.get<User>("/api/auth/me");
    setSession({ user: me.data, access: data.access });
  } catch (err) {
    const response = (err as AxiosError<{ code?: string }>)?.response;
    const sessionEnded = response?.status === 401 && response.data?.code === "session_ended";
    const { status, user, logout, markSignedOut } = useAuthStore.getState();
    // Nothing has loaded yet, so there is no one's data to drop: mark the visitor signed out and
    // leave the query cache alone. Clearing it here removed the in-flight demo-status query and left
    // the pages it gates (sign-in, register, password reset, landing) on the Loading splash.
    if (status === "loading" && user === null) markSignedOut({ sessionEnded });
    else logout({ sessionEnded });
  }
}
