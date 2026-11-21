import { Navigate, Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { useDemoStatus } from "@/features/demo/useDemoStatus";
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

/** Signed-in pages. The signed out go to /login, or home in demo mode (which has no sign-in). */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const demo = useDemoStatus();
  if (status === "loading") return <LoadingSplash />;
  if (status === "authenticated") return <Outlet />;
  if (demo.isLoading) return <LoadingSplash />;
  return <Navigate to={demo.demoMode ? "/" : "/login"} replace />;
}

/** Pages that only exist with real accounts (sign-in, register, password reset, account).
 * In demo mode, or if the demo status can't be fetched, they redirect home. */
export function AccountsOnlyRoute() {
  const { isLoading, demoMode } = useDemoStatus();
  if (isLoading) return <LoadingSplash />;
  return demoMode ? <Navigate to="/" replace /> : <Outlet />;
}

export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <LoadingSplash />;
  return status === "authenticated" ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
