import { Navigate, Route, Routes } from "react-router-dom";

import { AuthedLayout } from "@/components/layout/AuthedLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { EditorPlaceholderPage } from "@/features/editor/EditorPlaceholderPage";
import { LandingPage } from "@/features/marketing/LandingPage";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/guards";

function App() {
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
          <Route path="/resumes/:id" element={<EditorPlaceholderPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
