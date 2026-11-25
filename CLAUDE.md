# CLAUDE.md: ResumeIQ

**ResumeIQ**, an AI resume builder: split-screen editor with live preview, Claude-assisted content
(improve bullets / generate summary / tailor-to-JD with ATS score), client-side PDF export. Formerly
"Smart Resume Builder"; the GitHub repo, local folder, and CI image tag keep the `smart-resume-builder` slug.
Logo and lockup: `<Brand />` / `BrandMark` in `components/layout/Brand.tsx`; rules in DESIGN.md §8.
Portfolio project deployed to AWS at `resumeiq.jameslittlefield.net` (after the demo plan's Phase 3 deploy).

## Hard rules

1. **NEVER `git commit` or `git push` unless James explicitly asks in that request.** Leave all
   changes in the working tree. (A global PreToolUse hook also enforces this.)
2. **Design source-of-truth hierarchy:**
   - `docs/DESIGN.md` ("Editorial Ink") is the **truth**: tokens, type, spacing, a11y, anti-patterns.
   - `screens/1`–`screens/5` mockups are the **authoritative visual/layout/behavior reference**:
     match them faithfully, but **never copy their code** (inline-styled `.dc.html` comps). Reimplement
     cleanly with Tailwind tokens + shadcn.
   - On conflict: DESIGN.md + accessibility/engineering judgment win.
   - "Correct" = looks/behaves like the mockup AND passes DESIGN.md (tokenized, accessible, no raw hex).
3. **No hardcoded hex in components**: use Tailwind token classes (`bg-accent`, `text-muted-foreground`…).
   Accent (forest green) is RESERVED: one primary CTA per view, active/focus states only.
4. **The resume document ≠ the app UI**: templates/preview use `font-document` (Georgia) /
   `font-document-sans` (Arial): never Newsreader/Inter. App chrome never uses document fonts.
5. **Viewports: desktop + tablet only (≥768px).** No mobile layouts.

## Stack

- **client/**: React 19 + Vite + TypeScript (strict) + Tailwind 3 (`tailwind.config.ts` maps
  Editorial Ink CSS vars from `src/index.css`) + shadcn-style components (`components.json`,
  `@/` alias) + React Router + TanStack Query + React Hook Form + Zod + Zustand + Axios + lucide-react.
- **API client**: **Orval** generates a typed axios + TanStack Query client from the backend OpenAPI
  schema into `client/src/api/generated/` (Phase 4). Rules: Zod generation OFF (we own form schemas);
  JWT/refresh attached via a custom axios mutator; the generated folder is regenerated, never hand-edited.
  Keep the DRF schema clean so output is good: `@extend_schema` on SimpleJWT views, explicit
  `operation_id`s, nested serializer for the Resume `content` JSONField.
- **server/**: Django 5.2 + DRF + SimpleJWT + drf-spectacular (OpenAPI) + django-cors-headers +
  WhiteNoise + psycopg3. Env-driven `config/settings.py` (loads repo-root `.env`).
  Local apps live in `server/apps/` (`accounts`, `resumes`, `ai`, `demo`, added Phase 2+).
- **DB**: Postgres 17: `docker compose up -d` locally (a non-superuser `resumeiq` role, like production), the shared
  Postgres 17 on the portfolio EC2 server in prod (no RDS).
- **AI**: Anthropic Python SDK (Phase 7); key via `ANTHROPIC_API_KEY`; per-user limits 10/day & 50/month
  (`AI_DAILY_LIMIT` / `AI_MONTHLY_LIMIT`, env-overridable; admins + DEBUG bypass those counts; admin is granted only
  with `manage.py set_admin <email>`, never by email at signup). Every call also goes through the dollar spend
  ledger (`apps/ai/pricing.py` prices, `apps/ai/ledger.py` reserves and settles against `AI_MONTHLY_BUDGET_USD`,
  `AI_PACING_MULTIPLIER`, `AI_DAILY_FLOOR_USD`, `AI_VISITOR_BUDGET_USD`); admins and DEBUG pay dollars too, and
  `AI_MONTHLY_BUDGET_USD=0` turns live AI off. Models: `claude-haiku-5-5` (bullet, summary) and
  `claude-sonnet-5-5` (tailor, cover letter, ATS check, import), all calls through `service._call` (explicit
  `effort`, refusal -> 422, cut-off reply -> error). These models reject forced `tool_choice`, so JSON comes from
  structured outputs (`output_config.format`): every field required, `additionalProperties: false` (the API caps a
  schema at 24 optional fields). Thinking is on by default and counts toward `max_tokens`.
- **Python**: use `python3.12` / `server/.venv`. System python3 is 3.9, too old; never use it.

## Commands (run from repo root)

| Command | What |
|---|---|
| `npm run dev` | client (5173) + server (8000) concurrently; Vite proxies `/api` → Django |
| `npm run install:all` | root + client npm deps, server venv + pip |
| `docker compose up -d` | local Postgres (user/pass/db: resume_user/resume_pass/resume_builder) |
| `server/.venv/bin/python server/manage.py migrate` | migrations |
| `server/.venv/bin/python server/manage.py set_admin <email>` | grant admin (unlimited AI); `--revoke` removes it |
| `server/.venv/bin/python server/manage.py cleanup_demo` | delete expired demo guests and prune the AI ledger (hourly in prod) |
| `docker compose --profile prod run --rm app python manage.py migrate --noinput`, then `up --build app` | production-like local run; the prod profile sets `RUN_MIGRATIONS=0`, so migrate first |
| `npm run screenshots` (in `client/`) | regenerate the landing screenshots of the sample resume |
| `npm run build` | production client build |
| `npm run test` / `test:client` / `test:server` | Vitest (Phase 8) / pytest |
| `npm run lint` / `npm run typecheck` | client ESLint / tsc |
| `npm run test:e2e` | Playwright (Chromium + WebKit) with axe accessibility scans in light and dark; boots Django 8012 + Vite 5181, AI mocked |

Server health check: `GET http://localhost:8000/health` → `{"status": "ok"}`.
Python deps: edit `server/requirements.in` (direct pins), then regenerate the hashed lock `server/requirements.txt`
with the `uv pip compile` command in its header. Everything installs from the lock with `--require-hashes`.

**CI** (`.github/workflows/`, runs on PRs and pushes to `dev`/`main`): `ci.yml` has seven jobs: client
(lint, typecheck, Vitest, build), server (`check`, `check --deploy`, `makemigrations --check`, pytest on
Postgres 17), API schema (`spectacular --validate --fail-on-warn`, then fails if the committed Orval client
differs from a fresh `gen:api`), Docker (build the image, boot it against Postgres, curl `/health` and the SPA),
dependency audit (`npm audit --omit=dev --audit-level=high` + `pip-audit`), and e2e (Playwright + axe on
Chromium and WebKit; not a required check), and deploy (only on a push to `main` or a run by hand on `main`, after
every other job passes, behind James's `production` environment approval; see `docs/DEPLOYMENT.md`). `codeql.yml` scans
JS/TS, Python, and the workflows (also weekly). `security.yml` runs gitleaks on every push and PR plus a weekly
dependency audit; actions are pinned to commit SHAs. Node version comes from `.nvmrc`. If the API schema job fails,
run `npm run gen:api` in `client/` and commit the result.

## Repo map

```
client/src/
  api/         axios + generated OpenAPI client + TanStack Query hooks (Phase 4)
  components/  shared UI (shadcn-style in components/ui/)
  features/    auth/ account/ dashboard/ editor/ templates/ ai/ legal/ marketing/
  lib/         utils (cn), zod schemas, print/export
  stores/      zustand (auth/session)
  routes/      React Router config
client/e2e/   Playwright specs + support (axe, AI mocks) + server/ (e2e settings, DB setup, reset-link helper)
server/
  config/      settings.py urls.py wsgi.py, env-driven
  apps/        accounts/ resumes/ ai/ demo/ (Django apps, Phase 2+; demo = guests, Turnstile, caps, cleanup)
docs/DESIGN.md design system (truth)   docs/DEPLOYMENT.md (deploy runbook values)
.github/       workflows/ci.yml (PR checks + deploy) + codeql.yml + security.yml
screens/       mockup references (1 editor, 2 tailor-JD modal, 3 dashboard, 4 template, 5 landing+auth)
PLAN.md        implementation plan + phase list + build punch-list
docs/qa/      manual pre-launch checklist (real Safari, VoiceOver, zoom, keyboard)
```

## Conventions

- TS strict; imports via `@/`; components PascalCase; hooks `useX`.
- Forms: RHF + Zod resolver; labels above inputs; validate on blur; errors below field with
  `role="alert"`; focus first invalid on submit.
- DRF: serializers validate everything; viewsets thin, logic in services; OpenAPI via drf-spectacular.
- Score bands: <50 `destructive`, 50–74 `warning`, ≥75 `success`, always paired with a text label,
  never color alone. `success` ≠ `accent` (accent = actions, success = outcomes).
- Destructive actions get a confirm dialog. Modals: Esc + explicit close; warn on unsaved AI suggestions
  (pass `confirmDiscard={{ when: ... }}` to `Modal` for X/Esc/overlay closes, and use `useDiscardConfirm` from
  `components/ui/` for in-modal actions that drop a result, like "New analysis" or "Start over").
- Motion: transform/opacity only, 150–300ms, gated behind `prefers-reduced-motion`.
- Form-field borders use the `input-border` token (3:1, WCAG 1.4.11); the hairline `border` token is for
  non-interactive dividers only. Every page renders inside `<main id="main">` (the skip link targets it).
- Python: Django app code under `apps.<name>`; pytest + pytest-django (`server/pytest.ini`).

## Definition of done (per phase)

Build green (`npm run build`), lint/typecheck clean, tests pass, feature verified running locally,
matches mockups + DESIGN.md, **`CHANGELOG.md` updated**: accumulate changes under `[Unreleased]`
during a phase, then on phase completion cut a new SemVer section (`[0.x.0] - YYYY-MM-DD`, one minor
per phase; `1.0.0` = first production deploy) and bump `package.json` `version`. Update the compare
links at the file bottom. Then STOP. James reviews and commits himself.

## Future hardening (tech debt)

The big pre-deploy security items are **done** (see the CHANGELOG Security sections):
refresh token in an `httpOnly` cookie + memory-only access token, refresh-token rotation/revocation,
login/register throttling (shared database cache), production CSP, prod AI-`502` masking, fail-closed `DEBUG`,
prod HTTPS/HSTS, `/health` answered before host validation, a 100s/no-retry Anthropic timeout, gthread workers,
stdout logging, and admin granted only by `manage.py set_admin`. The pre-launch batch (`0.15.0`) closed
account deletion, Privacy/Terms, password reset, the atomic AI quota, fail-closed CORS/`DATABASE_URL`, admin
off in prod, the accessibility audit, and automated WebKit coverage. Still open:

- Auth errors allow email enumeration ("email already exists"); acceptable for now, revisit if needed.
- Deferred from the 2026-10-18 pre-deploy review: email verification, a per-user résumé cap, server-side
  normalization of tailor suggestions.
- James's manual pass: `docs/qa/2026-11-prelaunch-checklist.md` (real Safari print/file picker/trackpad drag,
  VoiceOver, 200% zoom).
- **Deploy checklist**: moved to `docs/DEPLOYMENT.md` (the environment, one-off migrate and hourly cleanup tasks,
  service settings, smoke test, PostgreSQL 17 setup, Turnstile, rollback). Context: the portfolio-infra design
  (`portfolio-infra/docs/design/2026-11-18-portfolio-apps-aws-deployment-design.md`, sections 5.4, 5.5, 5.10) and
  `docs/superpowers/plans/2026-11-19-demo-mode-and-deploy-readiness.md`.

## Security invariants (preserve if you touch the code)

- **Never introduce `dangerouslySetInnerHTML`**: all résumé content is React-escaped today; keep it that way.
  The production CSP (`config/middleware.py`) is a second layer, not a substitute.
- **Every Anthropic call goes through `service._call` and the ledger** (`apps/ai/ledger.py`); never call the SDK
  directly, or the dollar budget and the per-visitor cap stop being true.
- **New account endpoints use `ClosedInDemoModeMixin`** (`apps/demo/closed.py`), so they answer 404 in demo mode.
- **The CSP allows only `challenges.cloudflare.com` beyond self and Google Fonts** (Turnstile); don't widen it.
- **Cloudflare Turnstile test keys are refused in production** unless every `ALLOWED_HOSTS` entry is `localhost` or
  `127.0.0.1` (the local prod-image check); a deployed demo must use real keys.
- Resume URL fields (linkedin/github/website) render in `ResumeDocument` as **labeled clickable links**
  (LinkedIn / GitHub / Website) via the `DocumentLinks` helper, which links **only** `http(s)` URLs
  (validated with `new URL()`); any other scheme (`javascript:`/`data:`) falls back to plain label text,
  a stored-XSS guard. The server-side `URLField` is a second check. Keep both if this code is touched.
- **Password reset links** are built only from `settings.CLIENT_URL` (never the request `Host`, which would allow
  reset poisoning), and the uid/token travel in the URL **fragment** (`/reset-password#uid=...&token=...`) so they
  never reach access logs; the reset page strips them from history. The request endpoint always answers 202.
- **WhiteNoise must stay just inside `ContentSecurityPolicyMiddleware`** (inserted right after it in settings), so
  files it serves itself (`index.html`, assets, SVGs) still get the CSP header.

## Phase status

- ✅ Phase 1: scaffold (root files, client toolchain + tokens, Django skeleton, /health, docker Postgres)
- ✅ Phase 2: backend core: custom User (`accounts.User`, email login), SimpleJWT auth API under
  `/api/auth/` (register/login/refresh/me), OpenAPI + Swagger UI, pytest auth suite. DB was reset for
  the custom User. WhiteNoise is now production-only.
- ✅ Phase 3: resumes API: `Resume` model (UUID pk, JSONB content), nested content serializers
  (validates + rich Orval type), user-scoped `ResumeViewSet` (CRUD + duplicate, ownership isolation)
  under `/api/resumes/`, pytest suite.
- ✅ Phase 4: client foundation: Orval client (`gen:api` → `client/src/api/generated/`, never hand-edit),
  auth flow (Zustand store + localStorage, axios JWT/refresh interceptors), router + guards, Editorial Ink
  UI primitives (incl. Radix DropdownMenu/Dialog), landing + login + register + dashboard. Backend auth
  endpoints now have typed request/response schemas; `ai_usage` typed.
- ✅ Phase 5: split-screen editor at `/resumes/:id`: RHF + Zod form ↔ live `ResumeDocument` preview,
  debounced autosave (`useAutosave`), shared ATS-safe template (Classic Georgia / Modern Arial), top bar
  with save indicator + template switcher. Content validation is draft-friendly. Added `personalInfo.headline`.
- ✅ Phase 6: PDF export: `react-to-print` v3 on the `ResumeDocument` (preview === PDF), Letter @page +
  0.5in margins, Export PDF button wired, `print:p-0` on the document.
- ✅ Phase 7: AI features (`apps/ai`): Claude endpoints under `/api/ai/` (improve-bullet/generate-summary/
  tailor-jd), Haiku for simple + Sonnet for tailor (settings `AI_MODEL_SIMPLE`/`AI_MODEL_TAILOR`), tailor uses
  tool-use structured JSON, per-user usage gate + `AIUsageLog`, editor AI menu + per-bullet improve + tailor
  modal, pytest (Claude mocked). Live calls need `ANTHROPIC_API_KEY` in `.env` (absent → graceful 502).
- ✅ Phase 8: client test suite: Vitest + React Testing Library (jsdom), unit tests (format, editorSchema,
  ScoreMeter, aiError) + component tests (guards, LoginPage, ImproveBulletButton, mocked generated hooks).
  `npm run test` runs client (21) + server (28). Test files live alongside source as `*.test.ts(x)`.
- ✅ Phase 9: containerize: multi-stage `Dockerfile` (Node builds SPA → Python/gunicorn serves API + SPA),
  Django serves the built SPA (WhiteNoise assets + catch-all `index.html` in `config.urls`), `docker-entrypoint.sh`
  migrates then runs gunicorn, `.dockerignore` (excludes `.env`), `docker compose --profile prod up app` to run
  locally. ~384MB image, verified end-to-end against local Postgres.
- ✅ Feature A: editor polish (`0.10.0`): headline in the resume document (test coverage; render already
  existed), `@dnd-kit` drag-to-reorder (experience/education/projects entries + work bullets via a reusable
  `SortableList` in `components/ui/`), app-chrome dark-mode toggle (Zustand `theme` store → `.dark` on
  `<html>`, persisted `resumeiq-theme`, OS default; toggle in `AppHeader`). The document + exported PDF stay light.
- ✅ Feature C: templates (`0.11.0`): template registry (`features/templates/templates.ts`) replacing the
  `isModern` boolean, third **Banner** template (full-bleed navy header, Modern body, ATS-safe, prints), and a
  visual `TemplateGallery` modal with live scaled previews replacing the dropdown. Client-only, no migration.
- ✅ Feature B: import an existing résumé (`0.12.0`): client-side text extraction (`pdfjs-dist`/`mammoth`,
  lazy), Sonnet `parse-resume` tool-use endpoint → `ResumeContent` (entry UUIDs + email/URL normalization,
  usage-gated), and an `ImportResumeModal` (upload/paste → AI parse → in-modal review → create on confirm).
- ✅ Pre-deploy batch (`0.13.0`): 6 templates + per-résumé `document_font`, drag-to-reorder sections
  (`section_order`), DOCX/plain-text export (lazy `docx`), save a tailored copy (`applyTailoring`), AI cover
  letter + ATS health check, saved cover letters (`CoverLetter` model + `/api/cover-letters/`, editor manager
  with regenerate-from-stored-JD), httpOnly refresh cookie + rotation, security audit fixes, per-user `writes`
  throttle on résumé/cover-letter CRUD, the discard-AI-suggestions guard (`Modal` `confirmDiscard` prop), and
  CI (GitHub Actions PR checks + CodeQL, required on `dev`/`main` via branch protection).
- ✅ Résumé version history (`0.14.0`): `ResumeVersion` model + `apps/resumes/versions.py` (automatic
  checkpoint before the first change of an editing session, saved versions capped at 20, undoable restore,
  newest 30 automatic kept; row-locked), `/api/resume-versions/`, and the editor **History** modal
  (`VersionHistoryModal`, preview + save/rename/delete/restore). Restore remounts the form via the
  `EditorPage` revision key; top-bar modals reach autosave through the `EditorSession` context
  (`flush` before any snapshot). Tailor "Apply" saves a "Before tailoring" checkpoint.
  Spec/plan: `docs/superpowers/{specs,plans}/2026-10-18-resume-version-history*`.
- ✅ Pre-launch batch (`0.15.0`): password reset (Django token generator, console email in dev), password-confirmed
  account deletion + `/account` page, `/privacy` + `/terms` with real footer links, similarity validator on email
  and name, query cache cleared on sign-out; production settings fail closed (CORS, `DATABASE_URL`, admin, JSON-only
  DRF, `section_order` choices, CSP on WhiteNoise responses) and an atomic AI quota reserve with scoped refunds;
  Playwright + axe e2e on Chromium and WebKit (`client/e2e/`, CI `e2e` job) with the a11y fixes it found (skip link,
  focus return, labels, `input-border` token). PRs #42, #43, and the QA PR.
- ✅ Models and polish (`0.16.0`): AI on `claude-haiku-5-5` / `claude-sonnet-5-5` via `service._call` (structured
  outputs, explicit effort, refusal -> 422), today's date in the résumé prompt text, keyboard reorder one slot per
  press (`SortableList` coordinate getter), README refreshed. PRs #45, #46, #47 and the README/version PR.
- ⬜ Streaming AI responses (last of the post-audit batch; needs async-capable gunicorn workers, so it's tied to
  the deploy setup).
- ✅ Demo mode and deploy readiness (`0.17.0`, PR #49):
  dollar spend ledger + friendly AI refusals, `apps.demo` (`DEMO_MODE`, `/api/demo/status`, `/api/demo/start` behind
  Turnstile, per-guest caps, `cleanup_demo`), session refresh with a 30 s two-tab grace, client demo mode, demo e2e +
  `npm run screenshots`, `/health/ready`, Postgres 17 locally and in CI, the production-like compose `prod` profile,
  CI hardening (`security.yml`), and demo Privacy/Terms. Spec/plan: `docs/superpowers/plans/2026-11-19-demo-mode-and-deploy-readiness.md`.
- 🟡 Phase 10 (`1.0.0`): AWS deploy, now per the portfolio-infra design: ECS on the shared EC2 server behind the shared ALB,
  shared Postgres 17 (role `resumeiq`), SSM Parameter Store secrets, hourly cleanup via EventBridge Scheduler, host
  `resumeiq.jameslittlefield.net`. No RDS, no Fargate. Values in `docs/DEPLOYMENT.md`; run `check --deploy`.
  Deploy files in `deploy/` (ECS JSON, `deploy.sh`, `smoke.sh`); the `deploy` job in `ci.yml` runs them on `main` after approval.
- ⬜ Phase 11 Google OAuth · 12 stretch

Client notes: regenerate the API client with `npm run gen:api` after any backend API change (writes
`client/openapi.yaml` + `client/src/api/generated/`). Lint ignores the generated dir. Pages are lazy-loaded
per route (`React.lazy` in `App.tsx`, `LoadingSplash` fallback); the shared framework chunk is ~426kB (139kB gzip).
