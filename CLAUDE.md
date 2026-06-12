# CLAUDE.md — Smart Resume Builder

AI-powered resume builder: split-screen editor with live preview, Claude-assisted content
(improve bullets / generate summary / tailor-to-JD with ATS score), client-side PDF export.
Portfolio project deployed to AWS at `resume.jameslittlefield.net`.

## Hard rules

1. **NEVER `git commit` or `git push` unless James explicitly asks in that request.** Leave all
   changes in the working tree. (A global PreToolUse hook also enforces this.)
2. **Design source-of-truth hierarchy:**
   - `docs/DESIGN.md` ("Editorial Ink") is the **truth** — tokens, type, spacing, a11y, anti-patterns.
   - `screens/1`–`screens/5` mockups are the **authoritative visual/layout/behavior reference** —
     match them faithfully, but **never copy their code** (inline-styled `.dc.html` comps). Reimplement
     cleanly with Tailwind tokens + shadcn.
   - On conflict: DESIGN.md + accessibility/engineering judgment win.
   - "Correct" = looks/behaves like the mockup AND passes DESIGN.md (tokenized, accessible, no raw hex).
3. **No hardcoded hex in components** — use Tailwind token classes (`bg-accent`, `text-muted-foreground`…).
   Accent (forest green) is RESERVED: one primary CTA per view, active/focus states only.
4. **The resume document ≠ the app UI**: templates/preview use `font-document` (Georgia) /
   `font-document-sans` (Arial) — never Fraunces/Inter. App chrome never uses document fonts.
5. **Viewports: desktop + tablet only (≥768px).** No mobile layouts.

## Stack

- **client/** — React 19 + Vite + TypeScript (strict) + Tailwind 3 (`tailwind.config.ts` maps
  Editorial Ink CSS vars from `src/index.css`) + shadcn-style components (`components.json`,
  `@/` alias) + React Router + TanStack Query + React Hook Form + Zod + Zustand + Axios + lucide-react.
- **API client** — **Orval** generates a typed axios + TanStack Query client from the backend OpenAPI
  schema into `client/src/api/generated/` (Phase 4). Rules: Zod generation OFF (we own form schemas);
  JWT/refresh attached via a custom axios mutator; the generated folder is regenerated, never hand-edited.
  Keep the DRF schema clean so output is good: `@extend_schema` on SimpleJWT views, explicit
  `operation_id`s, nested serializer for the Resume `content` JSONField.
- **server/** — Django 5.2 + DRF + SimpleJWT + drf-spectacular (OpenAPI) + django-cors-headers +
  WhiteNoise + psycopg3. Env-driven `config/settings.py` (loads repo-root `.env`).
  Local apps live in `server/apps/` (`accounts`, `resumes`, `ai` — added Phase 2+).
- **DB** — Postgres 15: `docker compose up -d` locally, AWS RDS in prod.
- **AI** — Anthropic Python SDK (Phase 7); key via `ANTHROPIC_API_KEY`; limits 10/day & 50/month
  (constants `AI_DAILY_LIMIT` / `AI_MONTHLY_LIMIT` in settings; admins + DEBUG bypass).
- **Python**: use `python3.12` / `server/.venv`. System python3 is 3.9 — too old; never use it.

## Commands (run from repo root)

| Command | What |
|---|---|
| `npm run dev` | client (5173) + server (8000) concurrently; Vite proxies `/api` → Django |
| `npm run install:all` | root + client npm deps, server venv + pip |
| `docker compose up -d` | local Postgres (user/pass/db: resume_user/resume_pass/resume_builder) |
| `server/.venv/bin/python server/manage.py migrate` | migrations |
| `npm run build` | production client build |
| `npm run test` / `test:client` / `test:server` | Vitest (Phase 8) / pytest |
| `npm run lint` / `npm run typecheck` | client ESLint / tsc |

Server health check: `GET http://localhost:8000/health` → `{"status": "ok"}`.

## Repo map

```
client/src/
  api/         axios + generated OpenAPI client + TanStack Query hooks (Phase 4)
  components/  shared UI (shadcn-style in components/ui/)
  features/    auth/ dashboard/ editor/ templates/ ai/
  lib/         utils (cn), zod schemas, print/export
  stores/      zustand (auth/session)
  routes/      React Router config
server/
  config/      settings.py urls.py wsgi.py — env-driven
  apps/        accounts/ resumes/ ai/ (Django apps, Phase 2+)
docs/DESIGN.md design system (truth)   docs/DEPLOYMENT.md (Phase 10)
screens/       mockup references (1 editor, 2 tailor-JD modal, 3 dashboard, 4 template, 5 landing+auth)
PLAN.md        implementation plan + phase list + build punch-list
```

## Conventions

- TS strict; imports via `@/`; components PascalCase; hooks `useX`.
- Forms: RHF + Zod resolver; labels above inputs; validate on blur; errors below field with
  `role="alert"`; focus first invalid on submit.
- DRF: serializers validate everything; viewsets thin, logic in services; OpenAPI via drf-spectacular.
- Score bands: <50 `destructive`, 50–74 `warning`, ≥75 `success` — always paired with a text label,
  never color alone. `success` ≠ `accent` (accent = actions, success = outcomes).
- Destructive actions get a confirm dialog. Modals: Esc + explicit close; warn on unsaved AI suggestions.
- Motion: transform/opacity only, 150–300ms, gated behind `prefers-reduced-motion`.
- Python: Django app code under `apps.<name>`; pytest + pytest-django (`server/pytest.ini`).

## Definition of done (per phase)

Build green (`npm run build`), lint/typecheck clean, tests pass, feature verified running locally,
matches mockups + DESIGN.md, **`CHANGELOG.md` updated**: accumulate changes under `[Unreleased]`
during a phase, then on phase completion cut a new SemVer section (`[0.x.0] - YYYY-MM-DD`, one minor
per phase; `1.0.0` = first production deploy) and bump `package.json` `version`. Update the compare
links at the file bottom. Then STOP — James reviews and commits himself.

## Future hardening (tech debt)

- **JWTs (access + refresh) are stored in `localStorage`** (`client/src/stores/auth.ts`) — convenient and
  standard, but exposed to any XSS, and the long-lived **refresh** token is the higher-value target.
  **Fix later:** move the refresh token to an `httpOnly` cookie (immune to JS), keep only the short-lived
  access token in JS/memory. Requires adding CSRF handling on the cookie path — treat as a deliberate
  change (good to pair with the Phase 10 deploy hardening). Until then: never introduce
  `dangerouslySetInnerHTML`, and add a CSP at deploy.
- Login/register have no rate-limiting yet — add a DRF throttle (anti-brute-force) in a later phase.
- Auth errors allow email enumeration ("email already exists") — acceptable for now; revisit if needed.
- Resume URL fields (linkedin/github/website) currently render as **plain text** in `ResumeDocument` (safe).
  **If they ever become clickable `<a href>`** (document or PDF), validate the scheme (allow only http/https;
  reject `javascript:`/`data:`) to prevent stored XSS via a malicious URL.

## Phase status

- ✅ Phase 1 — scaffold (root files, client toolchain + tokens, Django skeleton, /health, docker Postgres)
- ✅ Phase 2 — backend core: custom User (`accounts.User`, email login), SimpleJWT auth API under
  `/api/auth/` (register/login/refresh/me), OpenAPI + Swagger UI, pytest auth suite. DB was reset for
  the custom User. WhiteNoise is now production-only.
- ✅ Phase 3 — resumes API: `Resume` model (UUID pk, JSONB content), nested content serializers
  (validates + rich Orval type), user-scoped `ResumeViewSet` (CRUD + duplicate, ownership isolation)
  under `/api/resumes/`, pytest suite.
- ✅ Phase 4 — client foundation: Orval client (`gen:api` → `client/src/api/generated/`, never hand-edit),
  auth flow (Zustand store + localStorage, axios JWT/refresh interceptors), router + guards, Editorial Ink
  UI primitives (incl. Radix DropdownMenu/Dialog), landing + login + register + dashboard. Backend auth
  endpoints now have typed request/response schemas; `ai_usage` typed.
- ✅ Phase 5 — split-screen editor at `/resumes/:id`: RHF + Zod form ↔ live `ResumeDocument` preview,
  debounced autosave (`useAutosave`), shared ATS-safe template (Classic Georgia / Modern Arial), top bar
  with save indicator + template switcher. Content validation is draft-friendly. Added `personalInfo.headline`.
- ✅ Phase 6 — PDF export: `react-to-print` v3 on the `ResumeDocument` (preview === PDF), Letter @page +
  0.5in margins, Export PDF button wired, `print:p-0` on the document.
- ⬜ Phase 7 — AI features (`apps/ai`): Claude service + rate-limit gate + `AIUsageLog`; build easy→hard
  (improve-bullet → generate-summary → tailor-to-JD with ATS score + keywords). Consult the `claude-api`
  skill first; use tool-use/structured output for the JD JSON. Wire the editor AI menu + usage pill.
- ⬜ Phase 8 tests · 9 container · 10 AWS deploy · 11 Google OAuth · 12 stretch

Client notes: regenerate the API client with `npm run gen:api` after any backend API change (writes
`client/openapi.yaml` + `client/src/api/generated/`). Lint ignores the generated dir. Bundle is one chunk
(~540kB) — route-level code-splitting is a future optimization.
