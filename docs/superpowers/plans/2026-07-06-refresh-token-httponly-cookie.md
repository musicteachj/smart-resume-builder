# Refresh-token httpOnly cookie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the refresh JWT into an `httpOnly` cookie and keep the access token in memory only, with a silent-refresh bootstrap on load.

**Architecture:** Backend sets the refresh token as an `httpOnly`/`Secure`/`SameSite=Lax` cookie (path `/api/auth`) on login/register and reads it from the cookie on `/api/auth/refresh`; a new `/api/auth/logout` clears it. The client stops persisting tokens: the access token lives in the Zustand store in memory, and on app load a bootstrap runs `/refresh` → `/me` to restore the session. Guards gain a `loading` state so a reload doesn't bounce to `/login`.

**Tech Stack:** Django 5.2 + DRF + SimpleJWT (backend); React 19 + Zustand + Axios + React Router (client). Same-origin in prod (Django serves SPA+API) and in dev (Vite proxies `/api`).

**Repo commit rule:** This project **never commits/pushes without James's explicit ask** (hard rule + global hook). So ignore the per-task `git commit` cadence from the writing-plans skill — instead, complete all tasks, run full verification (Task 11), then STOP and let James commit/PR into `dev` as one branch (`refresh-token-cookie`), matching every prior workstream.

**Spec:** `docs/superpowers/specs/2026-07-06-refresh-token-httponly-cookie-design.md`

---

## File Structure

**Backend (create):**
- `server/apps/accounts/cookies.py` — cookie set/clear helper + constants.

**Backend (modify):**
- `server/config/settings.py` — `SIMPLE_JWT` lifetimes, `CORS_ALLOW_CREDENTIALS`.
- `server/apps/accounts/views.py` — cookie on register/login, `CookieTokenRefreshView`, `LogoutView`.
- `server/apps/accounts/urls.py` — route refresh to the new view; add logout.
- `server/apps/accounts/serializers.py` — drop `refresh` from `AuthResponseSerializer`.
- `server/apps/accounts/tests/test_auth.py` — update token-in-body assertions; add cookie/refresh/logout tests.

**Frontend (create):**
- `client/src/features/auth/bootstrap.ts` — `bootstrapAuth()` silent-refresh-on-load.

**Frontend (modify):**
- `client/src/api/axios.ts` — `withCredentials: true`.
- `client/src/stores/auth.ts` — memory-only + `status`.
- `client/src/api/interceptors.ts` — cookie-based refresh.
- `client/src/routes/guards.tsx` — `loading` splash.
- `client/src/App.tsx` — run `bootstrapAuth()` once.
- `client/src/features/auth/LoginPage.tsx`, `RegisterPage.tsx` — `setSession({user, access})`.
- The logout caller (find via `grep -rn "logout" client/src/features client/src/components`) — call `POST /api/auth/logout` then `logout()`.
- Regenerated OpenAPI client via `npm run gen:api`.
- `client/src/stores/auth.test.ts` (new), `client/src/routes/guards.test.tsx`, `client/src/features/auth/LoginPage.test.tsx`.

---

## Task 1: Backend — SimpleJWT lifetimes + CORS credentials

**Files:**
- Modify: `server/config/settings.py` (the `REST_FRAMEWORK`/`CORS` area, ~L127–145, and add near `# App constants`)

- [ ] **Step 1: Add SIMPLE_JWT config and CORS credentials.** Ensure `from datetime import timedelta` is imported at the top of `settings.py` (add if absent). After the `REST_FRAMEWORK = {...}` block add:

```python
from datetime import timedelta  # top of file if not already imported

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}
```

And under the CORS section (near `CORS_ALLOWED_ORIGINS`):

```python
CORS_ALLOW_CREDENTIALS = True
```

- [ ] **Step 2: Verify settings load.**

Run: `server/.venv/bin/python server/manage.py check`
Expected: `System check identified no issues`.

---

## Task 2: Backend — refresh-cookie helper

**Files:**
- Create: `server/apps/accounts/cookies.py`

- [ ] **Step 1: Write the helper.**

```python
"""Refresh-token cookie helper. The refresh JWT lives in an httpOnly cookie scoped
to /api/auth so it is never exposed to JS and only sent to the auth endpoints."""

from datetime import timedelta

from django.conf import settings

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_MAX_AGE = int(timedelta(days=7).total_seconds())


def set_refresh_cookie(response, token: str):
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,  # http localhost in dev; https in prod
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    return response


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    return response
```

---

## Task 3: Backend — cookie on register/login, refresh view, logout view

**Files:**
- Modify: `server/apps/accounts/views.py`
- Modify: `server/apps/accounts/serializers.py`
- Modify: `server/apps/accounts/urls.py`

- [ ] **Step 1: Update `AuthResponseSerializer`** (`serializers.py`) — drop `refresh`:

```python
class AuthResponseSerializer(serializers.Serializer):
    """Returned by register and login: the user plus a short-lived access token.
    The refresh token is set as an httpOnly cookie, not returned in the body."""

    user = UserSerializer(read_only=True)
    access = serializers.CharField(read_only=True)
```

- [ ] **Step 2: Rewrite `views.py`.** Replace the imports and the three view classes. Full file:

```python
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .cookies import REFRESH_COOKIE_NAME, clear_refresh_cookie, set_refresh_cookie
from .serializers import (
    AuthResponseSerializer,
    EmailTokenObtainPairSerializer,
    RegisterSerializer,
    TokenRefreshResponseSerializer,
    UserSerializer,
)


@extend_schema_view(
    post=extend_schema(
        operation_id="register",
        request=RegisterSerializer,
        responses={201: AuthResponseSerializer},
        tags=["auth"],
    )
)
class RegisterView(generics.CreateAPIView):
    """Create an account; return the user + access token, set the refresh cookie."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        response = Response(
            {"user": UserSerializer(user).data, "access": str(refresh.access_token)},
            status=201,
        )
        return set_refresh_cookie(response, str(refresh))


@extend_schema_view(
    post=extend_schema(
        operation_id="login",
        request=EmailTokenObtainPairSerializer,
        responses={200: AuthResponseSerializer},
        tags=["auth"],
    )
)
class LoginView(TokenObtainPairView):
    """Obtain an access token via email + password; set the refresh cookie."""

    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)  # move out of body → cookie
        if refresh:
            set_refresh_cookie(response, refresh)
        return response


@extend_schema_view(
    post=extend_schema(
        operation_id="refresh_token",
        request=None,
        responses=TokenRefreshResponseSerializer,
        tags=["auth"],
    )
)
class CookieTokenRefreshView(APIView):
    """Issue a new access token from the refresh cookie (non-rotating)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not token:
            return Response({"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({"access": serializer.validated_data["access"]})


@extend_schema_view(
    post=extend_schema(operation_id="logout", request=None, responses={204: None}, tags=["auth"])
)
class LogoutView(APIView):
    """Clear the refresh cookie."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        return clear_refresh_cookie(Response(status=status.HTTP_204_NO_CONTENT))


@extend_schema_view(get=extend_schema(operation_id="get_me", tags=["auth"]))
class MeView(generics.RetrieveAPIView):
    """Return the currently authenticated user."""

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
```

- [ ] **Step 3: Update `urls.py`.** Read the current file first (`server/apps/accounts/urls.py`) — it currently wraps `TokenRefreshView` with `extend_schema`. Replace so refresh routes to `CookieTokenRefreshView` and add logout. Result:

```python
from django.urls import path

from .views import (
    CookieTokenRefreshView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
)

urlpatterns = [
    path("register", RegisterView.as_view(), name="register"),
    path("login", LoginView.as_view(), name="login"),
    path("refresh", CookieTokenRefreshView.as_view(), name="refresh"),
    path("logout", LogoutView.as_view(), name="logout"),
    path("me", MeView.as_view(), name="me"),
]
```

(If the existing file uses different path spellings, keep those spellings — only the refresh target and the new logout line change.)

- [ ] **Step 4: Verify import/URL wiring.**

Run: `server/.venv/bin/python server/manage.py check`
Expected: no issues.

---

## Task 4: Backend — update + add auth tests

**Files:**
- Modify: `server/apps/accounts/tests/test_auth.py`

- [ ] **Step 1: Update the token-in-body assertions.** The refresh token is no longer in the body — it's a cookie. In `test_register_creates_user_and_returns_tokens` and `test_login_returns_tokens_and_user`, change the `body["refresh"]` assertions to assert the cookie is set and access is in the body:

```python
@pytest.mark.django_db
def test_register_creates_user_and_returns_tokens(client):
    res = client.post(REGISTER, VALID, format="json")
    assert res.status_code == 201
    body = res.json()
    assert body["access"]
    assert "refresh" not in body  # refresh is an httpOnly cookie now
    cookie = res.cookies.get("refresh_token")
    assert cookie is not None and cookie["httponly"]
    assert body["user"]["email"] == "maya@example.com"
    assert User.objects.filter(email="maya@example.com").exists()


@pytest.mark.django_db
def test_login_returns_access_and_sets_refresh_cookie(client):
    client.post(REGISTER, VALID, format="json")
    res = client.post(LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["access"] and "refresh" not in body
    assert res.cookies.get("refresh_token") is not None
    assert body["user"]["email"] == "maya@example.com"
```

(Rename `test_login_returns_tokens_and_user` → `test_login_returns_access_and_sets_refresh_cookie` as above.)

- [ ] **Step 2: Add refresh + logout tests** at the end of the file:

```python
@pytest.mark.django_db
def test_refresh_uses_cookie_and_returns_access(client):
    client.post(REGISTER, VALID, format="json")
    login = client.post(LOGIN, {"email": VALID["email"], "password": VALID["password"]}, format="json")
    # APIClient persists cookies across requests, so the refresh cookie is sent automatically.
    res = client.post("/api/auth/refresh")
    assert res.status_code == 200
    assert res.json()["access"]
    assert login.cookies.get("refresh_token") is not None


@pytest.mark.django_db
def test_refresh_without_cookie_is_unauthorized(client):
    assert client.post("/api/auth/refresh").status_code == 401


@pytest.mark.django_db
def test_logout_clears_the_cookie(client):
    client.post(REGISTER, VALID, format="json")
    res = client.post("/api/auth/logout")
    assert res.status_code == 204
    # delete_cookie sets the cookie to empty with a past expiry.
    assert res.cookies["refresh_token"].value == ""
```

- [ ] **Step 3: Run the auth suite.**

Run: `cd server && .venv/bin/python -m pytest apps/accounts -q`
Expected: all pass (the throttle-disabling root `conftest.py` from WS1 keeps the `auth` scope off).

- [ ] **Step 4: Run the full server suite.**

Run: `cd server && .venv/bin/python -m pytest -q`
Expected: all pass.

---

## Task 5: Frontend — regenerate the OpenAPI client + axios credentials

**Files:**
- Modify: `client/src/api/axios.ts`
- Regenerated: `client/src/api/generated/**`, `client/openapi.yaml`

- [ ] **Step 1: Add `withCredentials`.** Read `client/src/api/axios.ts`; on the `axios.create({...})` config for `AXIOS_INSTANCE`, add `withCredentials: true`. (Keep the existing `baseURL`/other options.)

- [ ] **Step 2: Regenerate the client.**

Run: `cd client && npm run gen:api`
Expected: success; `AuthResponse` no longer has `refresh`; a `logout` operation exists. Verify:
`grep -rn "refresh" client/src/api/generated/model/authResponse.ts` → no match;
`grep -rln "logout" client/src/api/generated/auth/auth.ts` → matches.

---

## Task 6: Frontend — memory-only auth store with status

**Files:**
- Modify: `client/src/stores/auth.ts`
- Test: `client/src/stores/auth.test.ts` (create)

- [ ] **Step 1: Write the store test.**

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore, isAuthenticated } from "./auth";

const user = { id: "u1", email: "a@b.c", name: "A", is_admin: false } as never;

describe("auth store", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "loading" }));

  it("starts in the loading state (bootstrap not yet resolved)", () => {
    expect(useAuthStore.getState().status).toBe("loading");
    expect(isAuthenticated()).toBe(false);
  });

  it("setSession authenticates", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().accessToken).toBe("tok");
    expect(isAuthenticated()).toBe(true);
  });

  it("logout clears tokens and marks unauthenticated", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.status).toBe("unauthenticated");
  });
});
```

- [ ] **Step 2: Run it (fails — old store shape).**

Run: `cd client && npx vitest run src/stores/auth.test.ts`
Expected: FAIL (`status` undefined / `setSession` signature).

- [ ] **Step 3: Rewrite the store.** Full `client/src/stores/auth.ts`:

```ts
import { create } from "zustand";

import type { User } from "@/api/generated/model";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: User | null;
  /** Access token — in memory only (never persisted). */
  accessToken: string | null;
  status: AuthStatus;
  setSession: (session: { user: User; access: string }) => void;
  setAccessToken: (access: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

/** Auth/session store. Nothing persists — the refresh token is an httpOnly cookie,
 * and the session is restored on load via bootstrapAuth(). */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  status: "loading",
  setSession: ({ user, access }) => set({ user, accessToken: access, status: "authenticated" }),
  setAccessToken: (access) => set({ accessToken: access }),
  setUser: (user) => set({ user }),
  logout: () => set({ user: null, accessToken: null, status: "unauthenticated" }),
}));

/** Non-reactive auth check for interceptors outside React. */
export const isAuthenticated = () => useAuthStore.getState().status === "authenticated";
```

- [ ] **Step 4: Run it (passes).**

Run: `cd client && npx vitest run src/stores/auth.test.ts`
Expected: PASS.

---

## Task 7: Frontend — cookie-based refresh interceptor

**Files:**
- Modify: `client/src/api/interceptors.ts`

- [ ] **Step 1: Rewrite `refreshAccessToken`** to post with no body (cookie carries the token) and drop `refreshToken`:

```ts
async function refreshAccessToken(): Promise<string | null> {
  const { setAccessToken, logout } = useAuthStore.getState();
  try {
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>("/api/auth/refresh");
    setAccessToken(data.access);
    return data.access;
  } catch {
    logout();
    return null;
  }
}
```

The request interceptor (adds `Authorization` from `store.accessToken`), `AUTH_ENDPOINTS`, and the single-flight 401 handler stay unchanged.

- [ ] **Step 2: Typecheck.**

Run: `cd client && npm run typecheck`
Expected: no errors from `interceptors.ts` (Login/Register still reference old `setSession` — fixed in Task 9; run typecheck again after Task 9).

---

## Task 8: Frontend — bootstrap + guards splash

**Files:**
- Create: `client/src/features/auth/bootstrap.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/routes/guards.tsx`
- Test: `client/src/routes/guards.test.tsx`

- [ ] **Step 1: Write `bootstrap.ts`.**

```ts
import type { User } from "@/api/generated/model";

import { AXIOS_INSTANCE } from "@/api/axios";
import { useAuthStore } from "@/stores/auth";

/** Restore the session on load: exchange the refresh cookie for an access token,
 * then load the user. On failure, mark unauthenticated. Runs once at app start. */
export async function bootstrapAuth(): Promise<void> {
  const { setAccessToken, setSession, logout } = useAuthStore.getState();
  try {
    const { data } = await AXIOS_INSTANCE.post<{ access: string }>("/api/auth/refresh");
    setAccessToken(data.access); // so the /me request carries the Authorization header
    const me = await AXIOS_INSTANCE.get<User>("/api/auth/me");
    setSession({ user: me.data, access: data.access });
  } catch {
    logout();
  }
}
```

- [ ] **Step 2: Run bootstrap once in `App.tsx`.** Read `client/src/App.tsx`; add an effect that runs on mount:

```tsx
import { useEffect } from "react";
import { bootstrapAuth } from "@/features/auth/bootstrap";
// ...inside the App component body, before the routes render:
useEffect(() => {
  void bootstrapAuth();
}, []);
```

(If `App` is currently a component returning routes without a body, convert it to a function body with the effect. Keep all existing route JSX.)

- [ ] **Step 3: Write the guards test.**

```tsx
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
          <Route path="/dashboard" element={<div>DASH</div>} />
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
    expect(screen.queryByText("DASH")).not.toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "t" });
    renderAt("/dashboard");
    expect(screen.getByText("DASH")).toBeInTheDocument();
  });

  it("redirects protected → login when unauthenticated", () => {
    useAuthStore.setState({ status: "unauthenticated" });
    renderAt("/dashboard");
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it (fails — guards read a boolean, no splash / no `role="status"`).**

Run: `cd client && npx vitest run src/routes/guards.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Rewrite `guards.tsx`.** Full file:

```tsx
import { Navigate, Outlet } from "react-router-dom";

import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth";

function AuthSplash() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center bg-background">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <AuthSplash />;
  return status === "authenticated" ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);
  if (status === "loading") return <AuthSplash />;
  return status === "authenticated" ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
```

Verify `Spinner` renders a `role="status"` container OR the `AuthSplash` div's `role="status"` covers it (it does, above).

- [ ] **Step 6: Run it (passes).**

Run: `cd client && npx vitest run src/routes/guards.test.tsx`
Expected: PASS.

---

## Task 9: Frontend — login / register / logout wiring

**Files:**
- Modify: `client/src/features/auth/LoginPage.tsx`, `client/src/features/auth/RegisterPage.tsx`
- Modify: the logout caller (find it), e.g. `client/src/components/AppHeader.tsx`
- Modify: `client/src/features/auth/LoginPage.test.tsx`

- [ ] **Step 1: Update `setSession` calls.** In `LoginPage.tsx` and `RegisterPage.tsx`, the success handler currently calls `setSession({ user, access, refresh })`. The generated response type no longer has `refresh`; change to `setSession({ user: res.user, access: res.access })`. (Read each file to match the exact variable names.)

- [ ] **Step 2: Wire server logout.** Find the logout trigger: `grep -rn "logout" client/src/features client/src/components`. In that handler, call the generated logout mutation (or `AXIOS_INSTANCE.post("/api/auth/logout")`) and then `useAuthStore.getState().logout()`, then navigate to `/login`. Example:

```ts
import { AXIOS_INSTANCE } from "@/api/axios";
// ...
const onLogout = async () => {
  try {
    await AXIOS_INSTANCE.post("/api/auth/logout");
  } finally {
    useAuthStore.getState().logout();
    navigate("/login");
  }
};
```

- [ ] **Step 3: Update `LoginPage.test.tsx`.** Wherever the mocked login response / `setSession` expectation includes `refresh`, drop it. Read the file and adjust the mock resolved value to `{ user, access }` and any `toHaveBeenCalledWith` accordingly.

- [ ] **Step 4: Typecheck + lint.**

Run: `cd client && npm run typecheck && npm run lint`
Expected: clean.

---

## Task 10: Frontend — full test pass

- [ ] **Step 1: Run the client suite.**

Run: `cd client && npm run test`
Expected: all pass (auth store, guards, LoginPage updated; other suites unaffected).

---

## Task 11: Verification (whole feature)

- [ ] **Step 1: Static checks.**

Run: `npm run build && npm run lint && npm run typecheck` (repo root)
Expected: build succeeds (pre-existing chunk-size warning OK), lint/typecheck clean.

- [ ] **Step 2: Full test suite.**

Run: `npm run test` (repo root)
Expected: client + server green.

- [ ] **Step 3: Prod-shaped manual check (same-origin — the real target topology).**

```bash
docker compose --profile prod up --build app   # serves SPA + API on one origin
```
Then in a browser:
1. Register/login → DevTools → Application → Cookies: `refresh_token` present, **HttpOnly** ✓, `SameSite=Lax`, `Path=/api/auth`. No tokens in `localStorage`.
2. **Reload the page** → you stay signed in (brief splash, then dashboard) — confirms memory-only access token + bootstrap.
3. Let the access token expire (or wait) and hit a protected action → network shows a `/api/auth/refresh` then the retried call — confirms interceptor refresh.
4. Logout → `refresh_token` cookie cleared; reload lands on `/login`.

- [ ] **Step 4: Dev check.** `npm run dev`, repeat the login → reload → logout flow through the Vite proxy. If the cookie isn't sent on `/api/auth/refresh` in dev, add `cookiePathRewrite`/`cookieDomainRewrite` to the `/api` proxy in `client/vite.config.ts` and re-test.

- [ ] **Step 5: Changelog.** Add a `### Security` entry under `[Unreleased]` in `CHANGELOG.md` describing the refresh-token→httpOnly-cookie + memory-only access token change.

- [ ] **Step 6: STOP.** Do not commit. Report results to James for review → commit → PR into `dev` (branch `refresh-token-cookie`).

---

## Notes / gotchas
- **Throttling in tests:** the WS1 root `server/conftest.py` disables the `auth`/`ai-burst` scopes suite-wide, so the new auth tests won't 429. Don't re-enable.
- **`response.data.pop("refresh")` in `LoginView.post`** works because DRF hasn't rendered the response yet at that point.
- **`delete_cookie` must pass the same `path`** (`/api/auth`) used to set it, or the browser won't clear it — the helper handles this.
- **`/refresh` is non-rotating:** `TokenRefreshSerializer.validated_data` contains only `access` (no new `refresh`), so nothing else to set.
