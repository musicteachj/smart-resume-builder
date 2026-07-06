# Design — Move the refresh JWT to an httpOnly cookie (+ memory-only access token)

**Date:** 2026-07-06
**Status:** Approved (brainstorming)

## Context

Today both JWTs (access + refresh) are stored in `localStorage` (`client/src/stores/auth.ts`,
Zustand `persist` under `srb-auth`). The long-lived **refresh** token is the high-value XSS
target. This is the deferred hardening called out in `CLAUDE.md`: move the refresh token to an
`httpOnly` cookie and keep only the short-lived access token in JS memory. Doing it **before the
first AWS deploy** means launching `v1.0.0` with the stronger posture and no production sessions
to migrate. It ships as its own PR into `dev`; Phase 10 then deploys that.

The app is **same-origin in production** (Django serves the SPA + API) and same-origin in dev
via the Vite proxy (`5173` → `/api` → `8000`), which is what makes the cookie approach clean.

## Decisions (locked)

1. **Access token in memory only.** Nothing auth-related persists in `localStorage`. On every load
   the app performs a silent `/refresh` (cookie) to obtain a fresh access token — requires an
   auth "bootstrap" phase in the client.
2. **CSRF: `SameSite` cookie only.** Every mutating API call is `Bearer`-authed (header, so
   CSRF-immune); the only cookie-authed endpoint is `/refresh`, whose response is unreadable
   cross-origin. `SameSite=Lax` is proportionate. No double-submit CSRF token.
3. **Lifetimes / rotation:** access **15 min**, refresh **7 days**, **non-rotating** (no SimpleJWT
   `token_blacklist` app). Rotation is noted as a future hardening.

## Backend

### SimpleJWT + CORS (`server/config/settings.py`)
- `SIMPLE_JWT = {"ACCESS_TOKEN_LIFETIME": timedelta(minutes=15), "REFRESH_TOKEN_LIFETIME": timedelta(days=7)}`.
- `CORS_ALLOW_CREDENTIALS = True` (harmless; flows are same-origin).

### Refresh cookie helper (`server/apps/accounts/cookies.py`)
`set_refresh_cookie(response, token)` / `clear_refresh_cookie(response)` with:
`name="refresh_token"`, `httponly=True`, `secure=not settings.DEBUG`, `samesite="Lax"`,
`path="/api/auth"` (sent only to auth endpoints), `max_age = 7 days`.

### Endpoints (`server/apps/accounts/views.py`, `urls.py`)
- `register`, `login`: unchanged logic; set the refresh cookie on the response and **remove
  `refresh` from the JSON body** → `{ user, access }`. (`LoginView` overrides `post` to lift
  `refresh` out of the parent's `response.data` into the cookie; `RegisterView` already builds
  its response dict.)
- `refresh`: replace the wrapped `TokenRefreshView` with `CookieTokenRefreshView` — reads the
  token from `request.COOKIES["refresh_token"]`, feeds it to SimpleJWT's `TokenRefreshSerializer`,
  returns `{ access }`; missing/invalid → `401`.
- **`logout` (new)** `POST /api/auth/logout`: clears the refresh cookie, returns `204`.

### Serializers (`server/apps/accounts/serializers.py`)
`AuthResponseSerializer` drops `refresh` (→ `{ user, access }`); keep `TokenRefreshResponseSerializer`
(`{ access }`); the logout endpoint has no response body.

### CSRF note
No CSRF machinery is added: DRF `APIView`s are Django-CSRF-exempt and only enforce CSRF under
`SessionAuthentication`; we use `JWTAuthentication`. `SameSite=Lax` is the CSRF defense.

## Frontend

### Auth store (`client/src/stores/auth.ts`)
- Remove `persist` and `refreshToken`. Access token in memory.
- Add `status: "loading" | "authenticated" | "unauthenticated"` (initial `"loading"`).
- `setSession({ user, access })`, `setAccessToken`, `setUser`, `logout` set `status` accordingly.

### Bootstrap-on-load (`<AuthBootstrap>` at app root)
On mount: `POST /api/auth/refresh` (cookie). Success → `setAccessToken`, then `GET /api/auth/me`
→ `setUser`, `status="authenticated"`. Failure → `status="unauthenticated"`.

### Guards (`client/src/routes/guards.tsx`)
Both read `status`: `loading` → render a splash/spinner (no redirect); otherwise behave as today
(`ProtectedRoute` → Outlet vs `/login`; `PublicOnlyRoute` → Outlet vs `/dashboard`).

### Axios / interceptors (`client/src/api/axios.ts`, `interceptors.ts`)
- `withCredentials: true` on the instance.
- Refresh call becomes a **bodyless** `POST /api/auth/refresh` (cookie carries the token); remove
  all `refreshToken` references; keep the single-flight guard. Refresh failure → `logout()`.

### Auth pages / logout
`setSession` now takes `{ user, access }` (server sets the cookie). Logout calls
`POST /api/auth/logout` then clears the store. Regenerate the OpenAPI client (`AuthResponse`
change + new logout endpoint).

### Dev detail
Vite proxies `/api` to Django (same-origin), so the cookie works; verify the proxy forwards
`Set-Cookie` and adjust `client/vite.config.ts` proxy config if needed. `Secure` is off under
`DEBUG`, so http localhost works.

## Testing

- **Backend:** login/register set an `HttpOnly` refresh cookie and omit `refresh` from the body;
  `/refresh` reads the cookie (→ `access`) and 401s without it; `/logout` clears the cookie.
  Update the existing tests asserting `body["refresh"]`.
- **Frontend:** store bootstrap transitions (loading → authenticated / unauthenticated); guards
  render the splash while `loading` then route correctly; interceptor performs a cookie-based
  refresh; update `LoginPage.test` for the new `setSession` signature and add a bootstrap test.

## Verification
- `npm run build`, `lint`, `typecheck` clean; `npm run test` (client + server) green.
- Run the prod-shaped container (`docker compose --profile prod up app`) — same-origin SPA+API —
  and confirm end-to-end: register/login sets the cookie, reload silently re-auths (memory-only
  access token), a protected API call refreshes on 401, logout clears the cookie. Repeat in dev
  via the Vite proxy.
- Update `CHANGELOG.md` under `[Unreleased]` (Security).

## Out of scope
- Refresh-token rotation / `token_blacklist` (future hardening).
- Google OAuth (Phase 11), Phase 10 deploy transport settings (HSTS / SSL-redirect / secure
  session+CSRF cookies) — those belong with the deploy.
