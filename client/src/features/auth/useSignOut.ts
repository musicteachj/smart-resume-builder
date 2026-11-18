import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/stores/auth";

/**
 * Deliberate sign-out from a protected page (header menu, account deletion): go home, then
 * end the session. The order matters. Router navigations are React transitions, while the
 * auth store updates synchronously, so calling `logout()` right after `navigate()` still
 * re-renders the protected page's guard first, and it redirects to /login. Instead the
 * session ends when the calling component unmounts, which is when the protected page is
 * gone. Use it only from components inside the protected routes.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const pending = useRef(false);

  useEffect(
    () => () => {
      if (!pending.current) return;
      pending.current = false;
      logout();
    },
    [logout],
  );

  return useCallback(() => {
    pending.current = true;
    navigate("/", { replace: true });
  }, [navigate]);
}
