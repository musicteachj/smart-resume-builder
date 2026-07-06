import { Navigate, Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth";

/** Shown while the on-load session bootstrap is in flight, so a reload doesn't flash to /login. */
function AuthSplash() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center bg-background">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <AuthSplash />;
  return status === "authenticated" ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <AuthSplash />;
  return status === "authenticated" ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
