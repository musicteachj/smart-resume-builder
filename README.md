# Smart Resume Builder

An AI-powered resume builder. Create multiple resumes in a split-screen editor with live preview,
sharpen bullets and tailor your resume to any job description with Claude, and export a clean,
ATS-safe PDF.

**Live:** https://resume.jameslittlefield.net *(after deploy)*

## Features

- **Split-screen editor** — structured form on the left, live document preview on the right, autosave
- **AI assist (Claude)** — improve bullets, generate a professional summary, and tailor to a job
  description with an ATS match score and missing-keyword suggestions
- **PDF export** — one click, pixel-identical to the preview
- **Multiple resumes & templates** — Classic (serif) ATS-safe template, per-user dashboard
- **Accounts** — email/password (JWT); Google sign-in planned
- **Cost protection** — per-user AI usage tracking with daily/monthly limits

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form + Zod |
| Backend | Django 5, Django REST Framework, SimpleJWT, drf-spectacular (OpenAPI) |
| Database | PostgreSQL 15 (Docker locally, AWS RDS in production) |
| AI | Anthropic Claude (Python SDK) |
| Infra | Docker, AWS ECS Fargate + ECR + ALB + Secrets Manager, GitHub Actions CI/CD |

## Repository layout

```
client/   React + Vite + Tailwind frontend
server/   Django + DRF API
docs/     DESIGN.md (design system), DEPLOYMENT.md (AWS runbook)
screens/  High-fidelity design mockups (visual reference)
PLAN.md   Implementation plan
CHANGELOG.md  Phase-by-phase change history
```

## Local development

Prereqs: Node 18+, Python 3.12, Docker.

```bash
# 1. Install everything (root + client deps, server venv)
npm run install:all

# 2. Environment
cp .env.example .env   # then fill in values as needed

# 3. Start Postgres
docker compose up -d

# 4. Migrate
server/.venv/bin/python server/manage.py migrate

# 5. Run client (5173) + server (8000) together
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:8000 (OpenAPI docs at `/api/schema/swagger-ui/` once Phase 2 lands)

## Scripts (root)

| Command | What it does |
|---|---|
| `npm run dev` | Client + server concurrently |
| `npm run build` | Production client build |
| `npm run test` | Client (Vitest) + server (pytest) tests |
| `npm run lint` / `npm run typecheck` | Client lint / TS check |

## Design

The UI follows the **"Editorial Ink"** design system — Newsreader + Inter, a reserved forest-green
accent on warm paper, hairline borders, engineered restraint. See [`docs/DESIGN.md`](docs/DESIGN.md)
(source of truth) and `screens/` (visual reference mockups).
