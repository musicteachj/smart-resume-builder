import { Outlet } from "react-router-dom";

import { AppHeader } from "./AppHeader";

export function AuthedLayout() {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <Outlet />
    </div>
  );
}
