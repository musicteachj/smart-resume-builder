import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "@/stores/auth";

export function ProtectedRoute() {
  const authed = useAuthStore((s) => Boolean(s.accessToken));
  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const authed = useAuthStore((s) => Boolean(s.accessToken));
  return authed ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
