# Changelog

All notable changes to Smart Resume Builder are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/). Until the first production deploy, each completed
implementation phase (see `PLAN.md`) cuts a `0.x.0` version; `1.0.0` marks the first release to
`resume.jameslittlefield.net`.

## [Unreleased]

_Phase 5 — split-screen resume editor (form + live preview, autosave) next._

## [0.4.0] - 2026-06-11

Phase 4 — client foundation.

### Added
- **Orval-generated API client** (`client/src/api/generated/`) from the Django OpenAPI schema —
  typed axios + TanStack Query hooks (`useLogin`/`useRegister`/`useListResumes`/`useCreateResume`/…);
  Zod generation off; `npm run gen:api` regenerates schema + client
- **Auth flow:** Zustand store (tokens persisted to localStorage), axios interceptors (Bearer attach +
  single-flight token refresh on 401), React Router with protected/public-only route guards
- **UI primitives** (Editorial Ink, token-driven): Button, Input, Label, Field, Card, Spinner,
  DropdownMenu + ConfirmDialog (Radix-based, accessible), UsagePill
- **Pages:** landing, login, register (React Hook Form + Zod, password toggle, API error mapping),
  and a dashboard (list/create/duplicate/delete with confirm dialog, empty state, resume cards) — built
  against `screens/5` and `screens/3`. Placeholder editor route for Phase 5.
- App shell/header (brand, AI-usage pill, account menu + sign out)

### Changed
- Auth endpoints now declare typed request/response schemas (`AuthResponse`, refresh response) and the
  `ai_usage` field is typed (`AIUsage`) — so the generated client has correct types
- TanStack-friendly token config (Tailwind colors use `<alpha-value>` for opacity utilities)

## [0.3.0] - 2026-06-11

Phase 3 — resumes API.

### Added
- `Resume` model: UUID pk, `user` FK (cascade), `title`, `template` slug (default `classic`), JSONB
  `content`, timestamps, `user` index; Django admin registration
- Nested `content` serializers (PersonalInfo / WorkExperience / Education / Project / ResumeContent) —
  validates the resume structure server-side and produces a rich generated TS type via Orval; includes
  `YYYY-MM` month validation for dates
- `ResumeViewSet` under `/api/resumes/`: user-scoped CRUD + `duplicate` action, with strict ownership
  isolation (another user's resume returns 404)
- Trimmed list serializer (`ResumeList`) for the dashboard — returns skills + metadata but omits the heavy
  `content` blob (full `content` only on retrieve/create/update)
- OpenAPI operationIds (`list_resumes`/`create_resume`/`get_resume`/`update_resume`/`patch_resume`/
  `delete_resume`/`duplicate_resume`)
- pytest resume suite (10 tests: CRUD, owner assignment, duplicate, ownership isolation, content
  validation, oversized-content rejection)

### Security
- Resume queries are strictly scoped to the authenticated user (IDOR-safe: others' resumes → 404); `user`
  is server-assigned, never client-settable; UUID primary keys are non-enumerable
- Caps on `content` list sections (workExperience ≤20, education ≤10, projects ≤20) to bound payload size

## [0.2.0] - 2026-06-11

Phase 2 — backend core (authentication).

### Added
- Custom `User` model: email-as-login, `name`, `is_admin` (app-level, unlimited AI),
  AI-usage counters (`ai_calls_today`/`ai_calls_this_month`/`last_ai_call_date`/`last_month_reset`),
  optional `google_id`, email-based manager; `AUTH_USER_MODEL = accounts.User`; Django admin registration
- JWT auth API under `/api/auth/`: `register` (creates user, returns user + access/refresh, applies
  `ADMIN_EMAILS` → `is_admin`), `login` (email/password, returns user + tokens, syncs admin flag),
  `refresh`, `me` (auth-required)
- DRF serializers with Django password validation + case-insensitive email-uniqueness
- OpenAPI schema at `/api/schema/` and Swagger UI at `/api/schema/swagger-ui/` (drf-spectacular) with
  clean operationIds (`register`/`login`/`get_me`/`refresh_token`) for Orval client generation
- pytest auth suite (8 tests)

### Changed
- WhiteNoise middleware is now production-only (dev uses Django's runserver for static)
- Lengthened the dev-fallback `SECRET_KEY` (clears the JWT HMAC key-length warning)

### Security
- `SECRET_KEY` is now required when `DEBUG=False` — fails loudly instead of silently falling back to a
  placeholder key in production (which would let anyone with repo access forge JWTs)

## [0.1.0] - 2026-06-11

Project planning and Phase 1 scaffold.

### Added
- Monorepo structure: `client/` + `server/` with root `package.json` orchestration
  (`npm run dev` runs both via concurrently; Vite proxies `/api` → Django)
- **Client:** Vite 8 + React 19 + TypeScript (strict), Tailwind 3 with the full Editorial Ink
  token set from `docs/DESIGN.md` (light + dark CSS variables, Fraunces/Inter app fonts,
  Georgia/Arial document fonts, bespoke shadows/radii/z-index), shadcn-ready setup
  (`components.json`, `cn()` util, `@/` alias), `prefers-reduced-motion` gate
- **Server:** Django 5.2 + DRF + SimpleJWT + drf-spectacular + django-cors-headers + WhiteNoise,
  env-driven `config/settings.py` (repo-root `.env`), `/health` endpoint, `apps/` package for
  future Django apps, pytest configuration
- **Infra:** `docker-compose.yml` (Postgres 15 with healthcheck), `.env.example`, `.gitignore`
- **Docs:** `README.md` (features, stack, quickstart), `CLAUDE.md` (operating manual), this changelog,
  `PLAN.md` (12-phase implementation plan), `docs/DESIGN.md` ("Editorial Ink" design system),
  `screens/1`–`screens/5` (high-fidelity mockup references with agreed source-of-truth hierarchy)
- Local toolchain: Python 3.12 (Homebrew) + `server/.venv`

### Removed
- Abandoned prior scaffold (pnpm workspaces, `packages/shared`, Prisma schema, implementation
  guide) — superseded by the fresh Django + React plan in `PLAN.md`

[Unreleased]: https://github.com/musicteachj/smart-resume-builder/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/musicteachj/smart-resume-builder/releases/tag/v0.1.0
