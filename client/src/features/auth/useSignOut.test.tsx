import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { ProtectedRoute } from "@/routes/guards";
import { useAuthStore } from "@/stores/auth";

import { useSignOut } from "./useSignOut";

function AccountPage() {
  const signOut = useSignOut();
  return <button onClick={signOut}>Sign out</button>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/account"]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<AccountPage />} />
        </Route>
        <Route
          path="/"
          element={
            <div>
              HOME <Link to="/account">to account</Link>
            </div>
          }
        />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useSignOut", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: "token", status: "authenticated" }));

  it("goes home (not /login) and then ends the session", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText(/HOME/)).toBeInTheDocument();
    await waitFor(() => expect(useAuthStore.getState().status).toBe("unauthenticated"));
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
  });

  it("a later visit to a protected page while signed out goes to /login", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText(/HOME/);
    await waitFor(() => expect(useAuthStore.getState().status).toBe("unauthenticated"));
    fireEvent.click(screen.getByRole("link", { name: "to account" }));
    expect(await screen.findByText("LOGIN")).toBeInTheDocument();
  });
});
