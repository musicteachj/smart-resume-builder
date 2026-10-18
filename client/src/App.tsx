import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AuthedLayout } from "@/components/layout/AuthedLayout";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { bootstrapAuth } from "@/features/auth/bootstrap";
import { LoadingSplash, ProtectedRoute, PublicOnlyRoute } from "@/routes/guards";

// Each page is its own chunk, so visitors only download the page they open (the
// editor, with drag-and-drop, templates, and print, is by far the largest).
const LandingPage = lazy(() =>
  import("@/features/marketing/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() => import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("@/features/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const EditorPage = lazy(() => import("@/features/editor/EditorPage").then((m) => ({ default: m.EditorPage })));

function App() {
  const { pathname } = useLocation();
  // Restore the session (silent refresh via the httpOnly cookie) once on load.
  useEffect(() => {
    void bootstrapAuth();
  }, []);

  return (
    // Last-resort boundary: resets on navigation, so other pages still work.
    <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<LoadingSplash />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AuthedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
            {/* Editor is full-screen with its own top bar (no app header). */}
            <Route path="/resumes/:id" element={<EditorPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageErrorBoundary>
  );
}

export default App;
