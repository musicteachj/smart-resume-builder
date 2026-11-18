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
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "loading" }));

  it("shows a splash (no redirect) while auth is loading", () => {
    renderAt("/dashboard");
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("ProtectedRoute renders the page when authenticated", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "token" });
    renderAt("/dashboard");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("ProtectedRoute redirects to /login when unauthenticated", () => {
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/dashboard");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("PublicOnlyRoute sends authenticated users to /dashboard", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "token" });
    renderAt("/login");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });
});
