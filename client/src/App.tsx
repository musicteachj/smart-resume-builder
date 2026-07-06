import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthedLayout } from "@/components/layout/AuthedLayout";
import { bootstrapAuth } from "@/features/auth/bootstrap";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { EditorPage } from "@/features/editor/EditorPage";
import { LandingPage } from "@/features/marketing/LandingPage";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/guards";

function App() {
  // Restore the session (silent refresh via the httpOnly cookie) once on load.
  useEffect(() => {
    void bootstrapAuth();
  }, []);

  return (
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
  );
}

export default App;
