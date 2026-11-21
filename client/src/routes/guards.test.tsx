import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/stores/auth";

const { demo } = vi.hoisted(() => ({
  demo: { status: undefined, isLoading: false, demoMode: false } as {
    status: undefined;
    isLoading: boolean;
    demoMode: boolean;
  },
}));
vi.mock("@/features/demo/useDemoStatus", () => ({ useDemoStatus: () => demo }));

import { AccountsOnlyRoute, ProtectedRoute, PublicOnlyRoute } from "./guards";

function mockDemo(next: Partial<typeof demo>) {
  Object.assign(demo, { isLoading: false, demoMode: false }, next);
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>LANDING</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        </Route>
        <Route element={<AccountsOnlyRoute />}>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<div>LOGIN</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  beforeEach(() => {
    mockDemo({});
    useAuthStore.setState({ user: null, accessToken: null, status: "loading" });
  });

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

  it("ProtectedRoute sends the unauthenticated to the landing page in demo mode", () => {
    mockDemo({ demoMode: true });
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/dashboard");
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });

  it("ProtectedRoute keeps /login outside demo mode", () => {
    mockDemo({ demoMode: false });
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/dashboard");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.queryByText("LANDING")).not.toBeInTheDocument();
  });

  it("ProtectedRoute waits for the demo status before choosing where to send the signed out", () => {
    mockDemo({ isLoading: true });
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/dashboard");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
    expect(screen.queryByText("LANDING")).not.toBeInTheDocument();
  });

  it("PublicOnlyRoute sends authenticated users to /dashboard", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "token" });
    renderAt("/login");
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });

  it("AccountsOnlyRoute shows a splash while the demo status loads", () => {
    mockDemo({ isLoading: true });
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/login");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
  });

  it("AccountsOnlyRoute sends visitors home in demo mode", () => {
    mockDemo({ demoMode: true });
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/login");
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });

  it("AccountsOnlyRoute renders the page outside demo mode", () => {
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/login");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });
});
