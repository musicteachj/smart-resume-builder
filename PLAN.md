# Smart Resume Builder — Implementation Plan

> Design system lives in [`docs/DESIGN.md`](docs/DESIGN.md) ("Editorial Ink").

## Context

James is building a new **portfolio-grade, AI-powered Smart Resume Builder** to sit alongside his two
existing AWS-hosted fullstack apps (`barcode-crud`, `employee-management-system`). The goal is a polished,
professional application that demonstrates a *third, distinct* backend stack (Django, vs. his existing
Express and FastAPI apps) and a memorable AI feature.

The repo was wiped to start fresh; a prior Node/Express + Prisma + pnpm-workspace design (still in git
history) is **explicitly abandoned**. This plan starts from zero with a new stack.

**Fixed requirements (from James):** React + Tailwind, Django backend, PostgreSQL, AWS-hosted in the same
style as his other two apps, monorepo in the same `client/` + `server/` shape as those apps.

**Agreed product:** Dashboard of resumes → split-screen editor (form + live preview, autosave) →
switchable ATS-friendly templates → Claude-powered AI → one-click PDF export → per-user accounts.

**Agreed AI feature set (the "Smart" headline), all via Claude (a Claude 4.x model, e.g. `claude-opus-4-8`):**
1. **Improve a bullet** — rewrite a weak bullet into a strong, metric-oriented one.
2. **Tailor to a job description (centerpiece)** — paste a JD; suggest rewritten/reordered bullets,
   surface missing keywords, show an ATS-style match score.
3. **Generate a professional summary** from the rest of the resume.
With **cost protection**: per-user usage tracking + daily/monthly rate limits; admins unlimited.
Build the AI features in order **easy → hard**: improve-bullet → generate-summary → tailor-to-JD (structured
JSON output, the most advanced) — so the first AI integration is the simplest possible slice.

## Locked technical decisions

| Area | Decision |
|---|---|
| Repo layout | Single-repo monorepo: `client/` + `server/` + root `package.json` (matches his other apps; **no** pnpm workspaces / shared package) |
| Frontend | React 18 + Vite + TypeScript + **Tailwind CSS** + React Router + React Hook Form + Zod + TanStack Query + Axios |
| UI components | shadcn/ui primitives on Tailwind (professional polish; themed to Editorial Ink) |
| Backend | **Django 5 + Django REST Framework** |
| Auth | DRF **SimpleJWT** (email/password) first; **Google OAuth via `django-allauth` in scope**, built after core flows work |
| API typing | `drf-spectacular` emits OpenAPI → **Orval** generates a typed axios + TanStack Query client into `client/src/api/generated/` (Zod gen OFF; JWT attached via a custom axios mutator). Recovers cross-stack type safety. Keep the schema clean: `@extend_schema` on SimpleJWT views, explicit `operation_id`s, and a nested serializer for the Resume `content` JSONField. |
| Database | **PostgreSQL 15** — local via docker-compose, prod via **AWS RDS** |
| AI | Anthropic Python SDK; Claude 4.x model |
| PDF export | **Client-side `react-to-print`** (PDF = exact live preview; zero backend weight) |
| Hosting | ECS Fargate on shared `portfolio-cluster`, ECR, shared `portfolio-alb`, Secrets Manager, GitHub Actions, RDS → `resume.jameslittlefield.net` |
| Container | Multi-stage Dockerfile: Node builds React → Django (gunicorn) serves API + built SPA via WhiteNoise |
| Design | **"Editorial Ink" — a distinct, app-specific identity, deliberately NOT the portfolio "Professional Navy" brand.** Fraunces serif headlines + Inter body, reserved forest-green accent `#0F5132` on warm paper `#FBFAF8`. Full spec in `docs/DESIGN.md`. Quality bar (professional, distinctive-not-outlandish) + external craft references (Linear, Stripe, Vercel) apply. |

## Target repo structure

```
smart-resume-builder/
├── client/                       # React + Vite + TS + Tailwind
│   ├── src/
│   │   ├── api/                  # axios instance + generated OpenAPI client + TanStack Query hooks
│   │   ├── components/           # shared UI (shadcn/ui-based), layout, editor form sections
│   │   ├── features/
│   │   │   ├── auth/             # login/register, JWT handling, route guards
│   │   │   ├── dashboard/        # resume list, create/duplicate/delete
│   │   │   ├── editor/           # split-screen form + live preview, autosave
│   │   │   ├── templates/        # resume template components (the preview === the PDF)
│   │   │   └── ai/               # improve-bullet, tailor-to-JD, generate-summary modals + usage UI
│   │   ├── lib/                  # zod schemas, utils, react-to-print export
│   │   ├── stores/               # lightweight client state (auth/session) — Zustand
│   │   └── routes/               # React Router config
│   ├── tailwind.config.ts        # Editorial Ink tokens (see docs/DESIGN.md)
│   └── package.json
├── server/                       # Django + DRF
│   ├── config/                   # settings, urls, wsgi/asgi
│   ├── apps/
│   │   ├── accounts/             # custom User, auth (SimpleJWT), AI usage counters, admin flag
│   │   ├── resumes/              # Resume model (JSONB content), CRUD viewsets, serializers
│   │   └── ai/                   # Claude integration, rate-limit middleware/permission, AIUsageLog
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile.dev
├── Dockerfile                    # multi-stage prod build
├── docker-compose.yml            # local Postgres (+ optional adminer)
├── package.json                  # root: concurrently dev/build orchestration
├── .github/workflows/deploy-aws.yml
├── docs/DESIGN.md                # Editorial Ink design system
├── .env.example
└── README.md
```

## Data model (Django, Postgres)

- **User** (custom `AbstractUser`): `email` (unique login), `name`, `is_admin`,
  `ai_calls_today`, `ai_calls_this_month`, `last_ai_call_date`, `last_month_reset`,
  optional `google_id`. Admins bypass AI limits.
- **Resume**: `user` (FK, cascade), `title`, `template` (slug, default `classic`),
  `content` (**JSONB**), `created_at`, `updated_at`. Indexed on `user`.
- **AIUsageLog**: `user` (FK), `feature` (`improve-bullet` | `tailor-jd` | `generate-summary`),
  `input_length`, `output_length`, `success`, `created_at`. Indexed on `(user, created_at)`.

**Resume `content` JSON shape:** `personalInfo` (name, email, phone?, location?, linkedin?, github?),
`summary?`, `workExperience[]` (company, position, location?, startDate `YYYY-MM`, endDate?, bullets[]),
`education[]` (school, degree, field, graduationDate, gpa?), `skills[]`, `projects[]`
(name, description, technologies[], url?). Validated by **Zod on the client** and **DRF serializers on the server**.

## AI design (server/apps/ai)

- Single service wrapping the Anthropic SDK; one function per feature with tailored system prompts.
  Prompts live in `server/apps/ai/prompts.py`, documented inline (no separate prompt doc).
- **Rate-limit gate** (DRF permission/throttle): admin or `DEBUG` → bypass; else reset daily/monthly
  counters as needed, enforce limits (10/day, 50/month), return `429` with a clear message when over,
  increment counters + write `AIUsageLog` on success.
- **Tailor-to-JD** returns: rewritten/reordered bullet suggestions, missing-keyword list, and a 0–100
  match score, rendered in a review modal (accept / regenerate / cancel). Use Claude **tool use / structured
  output** for reliable JSON.
- `ANTHROPIC_API_KEY` from env locally, **AWS Secrets Manager** in prod.

## Implementation phases (each ends green + committed)

1. **Scaffold monorepo** — `client/` (Vite React TS + Tailwind + shadcn/ui, Editorial Ink tokens per
   `docs/DESIGN.md`), `server/` (Django + DRF skeleton), root `package.json` with `concurrently` dev/build,
   `docker-compose.yml` (Postgres), `.env.example`, README, `CLAUDE.md`.
2. **Backend core** — custom User, DRF, SimpleJWT auth endpoints (register/login/me/refresh),
   `drf-spectacular` OpenAPI, CORS, health-check endpoint (`/health`) for the ALB.
3. **Resumes API** — Resume model + serializers + viewset (CRUD, duplicate), JSON content validation.
4. **Client foundation** — routing, auth flow + JWT storage + guards, axios + generated TS client +
   TanStack Query hooks, dashboard (list/create/duplicate/delete).
5. **Editor** — split-screen form (RHF + Zod) ↔ live preview, autosave (debounced mutation),
   template components, template switcher.
6. **PDF export** — `react-to-print` on the preview component; print-optimized CSS; one-click download.
7. **AI features** — `ai` app + Claude service + rate-limit gate + `AIUsageLog`; client modals for
   improve-bullet, generate-summary, and tailor-to-JD (with match score + keywords); usage indicator UI.
   Build easy → hard (improve-bullet → generate-summary → tailor-to-JD).
8. **Tests** — server: `pytest` + `pytest-django` (auth, resume CRUD, AI rate-limit logic w/ mocked Claude);
   client: Vitest + React Testing Library (editor, auth guard, AI modal).
9. **Containerize** — multi-stage Dockerfile (Node build → gunicorn + WhiteNoise serving SPA), verify
   `docker compose` end-to-end locally.
10. **AWS deploy** — ECR repo `smart-resume-builder`; ECS Fargate service on `portfolio-cluster` + target
    group on `portfolio-alb`; **RDS Postgres** instance; Secrets Manager entries (DB URL, JWT signing key,
    `ANTHROPIC_API_KEY`); `GitHub Actions` workflow (build → push ECR → update task def → deploy, mirroring
    `employee-management-system/.github/workflows/deploy-aws.yml`); Route 53 record `resume.jameslittlefield.net`.
11. **Google OAuth (in scope)** — `django-allauth` Google sign-in + account linking + admin-email detection,
    built once email/password auth and the core app are solid (it's free; adds real polish).
12. **(Stretch)** A second resume template; any further AI polish (streaming responses, etc.).

## Project documentation deliverables

A small, high-value doc set (no sprawl):
- **`CLAUDE.md`** (root, Phase 1) — Claude Code's operating manual: stack, repo map, dev/test/deploy
  commands, coding conventions, "definition of done," and a short AI-strategy + rate-limit note.
- **`docs/DESIGN.md`** (Phase 1, ✅ drafted) — the **Editorial Ink** design system: color tokens
  (warm paper / ink / reserved forest-green accent, light + dark), typography (Fraunces + Inter), spacing
  scale, component + motion conventions, accessibility, and an explicit **anti-patterns / forbidden list**.
  Tokens are the single source of truth in `client/tailwind.config.ts` + shadcn CSS variables.
- **`docs/DEPLOYMENT.md`** (Phase 10) — AWS runbook (ECS/ECR/ALB/RDS/Secrets Manager/GitHub Actions/
  Route 53), mirroring the `barcode-crud/DEPLOYMENT.md` convention.
- **`README.md`** — overview, features, stack, local-dev quickstart.

Deliberately **not** separate docs: API contract (the generated **OpenAPI schema** is the contract);
AI prompts (live in `server/apps/ai/prompts.py`, documented inline).

During UI build, lean on the available design skills (`ui-ux-pro-max`, `frontend-design`, `impeccable`),
fed by `docs/DESIGN.md`, to avoid a generic look on the dashboard and editor.

## Skills to use, by phase

- **`init`** → generate `CLAUDE.md` (Phase 1).
- **`impeccable`** → author/refine `docs/DESIGN.md` and the final UI polish/audit pass (Phase 1 + late phases).
- **`ui-ux-pro-max`** → UI ideation, palette/type/style references, and **shadcn/ui component sourcing via its
  MCP** (Phases 4–7, the dashboard/editor/templates/AI UI).
- **`frontend-design`** → generate distinctive, non-generic component code while building the client (Phases 4–7).
- **`claude-api`** → consult before writing any Claude integration; model IDs, pricing/token counting, and
  **tool use / structured output** for the tailor-to-JD JSON (match score + keywords) (Phase 7).
- **`verify`** / **`run`** → launch the app and confirm end-to-end flows during verification (Phase 8+).
- **`security-review`** → run before the first AWS deploy — JWT auth, user data, secrets, abusable AI
  endpoint (before Phase 10).
- **`code-review`** / **`simplify`** → per-phase bug-catch and cleanup before merging to `main`.

## Reuse / consistency notes

- Mirror **`employee-management-system`** closely for infra: same shared `portfolio-cluster` + `portfolio-alb`,
  same Secrets Manager + GitHub Actions ECR→ECS pattern, same two-stage Dockerfile shape (Node builder →
  Python runtime serving the built SPA), same `/health` endpoint convention.
- **Give this app its own visual identity (Editorial Ink) — deliberately distinct from `my-portfolio`.**
  Match the *quality bar*, not the look. After launch, add this project to the portfolio's `projects` store.

## Verification

- **Local:** `docker compose up` (Postgres) → `python manage.py migrate` → `npm run dev` (root) runs
  client + server concurrently. Manually walk: register → create resume → edit with live preview + autosave →
  run each AI feature (improve bullet, generate summary, tailor-to-JD shows score + keywords) → confirm
  rate-limit `429` after the cap → export PDF and confirm it matches the preview.
- **Automated:** `pytest` (server) green incl. AI rate-limit unit tests with a mocked Anthropic client;
  Vitest (client) green for editor + auth guard + AI modal.
- **Container parity:** build the prod Dockerfile and hit the running container at `/health`, the SPA, and an
  authed API call to confirm WhiteNoise serving + API both work from one image.
- **Deploy:** push to `main` → GitHub Actions deploys → `https://resume.jameslittlefield.net` loads, full
  flow works against RDS, secrets resolve from Secrets Manager.

## Resolved defaults

- **AI rate limits:** 10 calls/day, 50/month for free users; admins unlimited; bypassed when `DEBUG`.
- **Templates:** ship **one** highly-polished ATS template first; a second is a Phase 12 stretch.
- **Google OAuth:** in scope (Phase 11), built after the core email/password app is solid.
- **Database:** AWS RDS (`db.t4g.micro`, ~$13–15/mo) for the AWS-native story; Neon/Supabase free tier is a
  fallback only if James later wants to drop the recurring cost.
