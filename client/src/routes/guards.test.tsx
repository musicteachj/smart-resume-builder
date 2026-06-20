import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/auth";

import { ProtectedRoute, PublicOnlyRoute } from "./guards";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        </Route>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>LOGIN</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, refreshToken: null } as never);
  });

  it("ProtectedRoute redirects to /login when unauthenticated", () => {
    renderAt("/dashboard");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("ProtectedRoute renders the page when authenticated", () => {
    useAuthStore.setState({ accessToken: "token" } as never);
    renderAt("/dashboard");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("PublicOnlyRoute sends authenticated users to /dashboard", () => {
    useAuthStore.setState({ accessToken: "token" } as never);
    renderAt("/login");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });
});
