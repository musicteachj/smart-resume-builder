# Changelog

All notable changes to Smart Resume Builder are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/). Until the first production deploy, each completed
implementation phase (see `PLAN.md`) cuts a `0.x.0` version; `1.0.0` marks the first release to
`resume.jameslittlefield.net`.

## [Unreleased]

_Phase 10 — AWS deploy (ECS Fargate + ECR + ALB + RDS + Secrets Manager + GitHub Actions) next._

## [0.11.0] - 2026-06-29

Feature C — templates (client-only; no backend/schema changes).

### Added
- **Visual template gallery** replacing the dropdown: a modal showing each template as a live, scaled-down
  preview of the user's actual résumé (reuses `ResumeDocument`), click-to-select with an accent ring + check.
- **Third template — "Banner"**: a full-bleed navy header band with the name/headline/contacts reversed out
  in white; the body reuses Modern's ATS-safe single-column layout. Real selectable text on color (ATS-safe),
  prints in the PDF (`print-color-adjust: exact`), and stays light in dark mode.
- **Template registry** (`features/templates/templates.ts`): templates are now data (id/label/description +
  style config) instead of an `isModern` boolean; one source of truth for the document, the gallery, and the
  dashboard card label.
- Tests: registry/`getTemplate` fallback, `ResumeDocument` Banner header, `TemplateGallery` select-and-close.

### Changed
- Dashboard résumé cards show the template's display label (e.g. "Banner template") instead of the raw slug.
- Removed `TemplateSwitcher` (superseded by the gallery).

## [0.10.0] - 2026-06-29

Feature A — editor & document polish (client-only; no backend/schema changes).

### Added
- **Drag-to-reorder** with `@dnd-kit`: a reusable `SortableList` (render-prop drag handle, pointer +
  keyboard sensors, vertical-axis modifier) powers reordering of Work Experience, Education, and
  Projects entries (RHF `useFieldArray.move()`) and bullets within a work experience (stable
  per-bullet ids over the `string[]` value). Existing autosave persists the new order.
- **Dark-mode toggle** for the app chrome: a Zustand + `persist` `theme` store (`srb-theme`, defaults
  to the OS preference) toggles the `.dark` class on `<html>`; a sun/moon button in `AppHeader`. The
  resume document and exported PDF stay light (explicit paper/ink colors, not theme tokens).
- Tests: theme store (toggle/persist/OS-default/apply), `ResumeDocument` headline present/absent,
  `SortableList` render + labeled handles.

### Notes
- The resume document already rendered `personalInfo.headline` under the name (Classic-centered /
  Modern-left); this cycle adds its test coverage.
- Drag handles are keyboard-operable and labeled; the drag transition is gated behind
  `prefers-reduced-motion`.

## [0.9.0] - 2026-06-13

Phase 9 — containerization.

### Added
- **Multi-stage `Dockerfile`**: stage 1 (Node) builds the React SPA; stage 2 (Python 3.12) installs the
  server, copies the built SPA, runs `collectstatic`, and serves everything via **gunicorn** (~384 MB image)
- **Single-container serving**: Django + WhiteNoise serve the API (`/api/*`), the hashed SPA assets, Django/
  admin/Swagger static, and a catch-all that returns `index.html` for client-side routes (deep-link safe)
- `docker-entrypoint.sh` runs `migrate` on start, then gunicorn (`--timeout 120` so long Claude calls
  aren't killed by the 30s default; access logs to stdout for CloudWatch)
- `.dockerignore` excludes `node_modules`/`.venv`/**`.env`**/caches/build output — keeps the dev API key and
  cruft out of the image (the Phase 7 security follow-up)
- `docker-compose.yml` gains an opt-in `app` service (`--profile prod`) to run the production container locally
  against the Postgres service; default `docker compose up -d` still runs only the db

### Security
- Production image carries no secrets; `.env` files are git- and docker-ignored, so the dev `ANTHROPIC_API_KEY`
  never ships in the image (Secrets Manager supplies prod values in Phase 10)

## [0.8.0] - 2026-06-13

Phase 8 — client test suite.

### Added
- **Vitest + React Testing Library** harness (jsdom, jest-dom matchers, setup/cleanup) wired into
  `npm run test:client` / root `npm run test`
- Unit tests: `format` (initials, relative time), `editorSchema` (draft-friendly validation, YYYY-MM,
  email), `ScoreMeter` (band labels, a11y progressbar), `aiError` (429/502/generic mapping + usage sync)
- Component tests (mocked generated hooks): route guards (protected/public redirects), `LoginPage`
  (validation + submit), `ImproveBulletButton` (suggestion → Accept flow)
- 21 client tests across 7 files; full suite (`npm run test`) now runs 21 client + 28 server green

## [0.7.0] - 2026-06-13

Phase 7 — AI features (Claude).

### Added
- **`apps/ai`** — Claude-powered endpoints under `/api/ai/`: `improve-bullet`, `generate-summary`, `tailor-jd`.
  Model split (env-overridable `AI_MODEL_SIMPLE`/`AI_MODEL_TAILOR`): **Haiku 4.5** for the simple rewrites,
  **Sonnet 4.6** for tailor-to-JD. Opus/Fable are not used.
- **Tailor-to-JD** returns structured JSON via Claude tool-use: 0–100 match score, missing keywords, and
  per-bullet rewrites (each noting which keywords it "adds").
- **Usage gate / cost protection** — per-user daily (10) + monthly (50) counters with automatic reset;
  admins and `DEBUG` bypass; over-limit returns `429`; every call recorded in `AIUsageLog` (success/failure).
  Failed calls don't consume quota. AI not configured → graceful `502`.
- **Editor UI** — per-bullet "Improve with AI" (before/after, Accept/Regenerate); AI menu → Generate summary
  (before/after) + Tailor-to-JD modal (banded score meter with text labels, missing-keyword chips that add to
  Skills, suggestion cards that apply to bullets); usage shown in the menu + header pill; friendly 429/502.
- Orval-generated AI hooks (`useImproveBullet`/`useGenerateSummary`/`useTailorJd`) + types.
- pytest AI suite (9 tests, Anthropic client mocked — no key needed to build/verify).

### Security
- AI endpoints are auth-required and user-scoped; the API key and system prompts stay server-side (never sent
  to the browser); cost is bounded by the per-user gate plus an external workspace spend cap.

## [0.6.0] - 2026-06-12

Phase 6 — PDF export.

### Added
- **Client-side PDF export** (`react-to-print`): the editor's Export PDF button prints the live
  `ResumeDocument` (so the PDF is exactly the preview) to the browser's print / Save-as-PDF dialog —
  Letter page, 0.5in margins, filename derived from the resume title

### Changed
- `ResumeDocument` padding moved to a utility class with `print:p-0` so the printed page relies on the
  `@page` margins rather than the on-screen padding

## [0.5.0] - 2026-06-12

Phase 5 — split-screen resume editor.

### Added
- **Editor** at `/resumes/:id` (full-screen, own top bar): structured form (React Hook Form + Zod) on the
  left ↔ **live document preview** on the right, with **debounced autosave** (validates, then PATCHes).
  Autosave keeps the query cache coherent (writes saved data back to the `getResume` cache + invalidates the
  dashboard list) and **flushes on unmount**, so navigating away and back always shows your latest edits
- **Shared `ResumeDocument` template** (Classic = Georgia / Modern = Arial, ATS-safe, Letter width) — the
  single source for both the live preview and the Phase 6 PDF
- Collapsible form sections: Personal Info (incl. professional title), Summary, Work Experience (with a
  bullet editor), Education, Skills + Projects (tag inputs); reusable TagInput / BulletEditor / Textarea
- Editor top bar: inline-editable title, **save indicator** (Saved / Saving… / Unsaved / Couldn't save),
  template switcher, and AI + Export PDF placeholders (Phases 6–7)
- `personalInfo.headline` field added to the resume content

### Changed
- Resume content validation is now **draft-friendly**: blank fields are allowed while editing so autosave
  never fails on partial input; formats (email, URL, `YYYY-MM`) are still enforced when a value is present,
  and the structure + list caps still hold

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

[Unreleased]: https://github.com/musicteachj/smart-resume-builder/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/musicteachj/smart-resume-builder/releases/tag/v0.1.0
