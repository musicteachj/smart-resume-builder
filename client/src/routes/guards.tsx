import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth";

/** Shown while the on-load session bootstrap is in flight (so a reload doesn't flash to
 * /login) and while a lazily loaded page's code downloads. */
export function LoadingSplash() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center bg-background">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const signedOut = useAuthStore((s) => s.signedOut);
  // `signedOut` is one-shot: it steers only the redirect right after signing out. Once
  // that redirect has left the protected pages (this guard unmounts), clear it, so a later
  // visit to a protected page while signed out goes to /login again.
  useEffect(
    () => () => {
      if (useAuthStore.getState().signedOut) useAuthStore.setState({ signedOut: false });
    },
    [],
  );
  if (status === "loading") return <LoadingSplash />;
  if (status === "authenticated") return <Outlet />;
  // Signing out (or deleting the account) re-renders this guard before the caller's own
  // navigation lands, so the guard picks the destination: home after a deliberate
  // sign-out, the sign-in form when the session simply isn't there.
  return <Navigate to={signedOut ? "/" : "/login"} replace />;
}

export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <LoadingSplash />;
  return status === "authenticated" ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
