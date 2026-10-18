import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";

import { AppHeader } from "./AppHeader";

export function AuthedLayout() {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      {/* Pages are lazy chunks: keep the header up while one loads. */}
      <Suspense
        fallback={
          <div role="status" aria-label="Loading" className="flex justify-center py-16">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  );
}
