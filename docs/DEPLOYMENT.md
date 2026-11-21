# Deployment

Runbook values for deploying Resume IQ as the public demo. Source of truth for the infrastructure is the
portfolio-infra design (`portfolio-infra/docs/design/2026-11-18-portfolio-apps-aws-deployment-design.md`, sections
5.4, 5.5, 5.10); this file holds the values the deploy copies.

## Where it runs

ECS on the shared EC2 server behind the shared ALB, per the portfolio-infra design. Host:
`resumeiq.jameslittlefield.net`. The image is built for `linux/amd64`.

## Environment

The service, the migrate task, and the cleanup task share one environment.

SSM SecureString parameters under `/portfolio/resumeiq/`:

| Name | Value |
|---|---|
| `SECRET_KEY` | generated |
| `DATABASE_URL` | `postgres://resumeiq:<password>@172.17.0.1:5432/resumeiq` |
| `ANTHROPIC_API_KEY` | the Resume IQ workspace key (workspace monthly limit $12, alerts at $5 and $9) |
| `TURNSTILE_SECRET_KEY` | the Turnstile site's secret |

Plain environment variables:

| Name | Value |
|---|---|
| `ALLOWED_HOSTS` | `resumeiq.jameslittlefield.net` |
| `CLIENT_URL` | `https://resumeiq.jameslittlefield.net` |
| `DEMO_MODE` | `true` |
| `TURNSTILE_SITE_KEY` | `<site key>` |
| `RUN_MIGRATIONS` | `0` |
| `AI_MONTHLY_BUDGET_USD` | `10` |
| `AI_PACING_MULTIPLIER` | `3` |
| `AI_DAILY_FLOOR_USD` | `0.50` |
| `AI_VISITOR_BUDGET_USD` | `0.15` |
| `DEMO_STARTS_PER_HOUR` | `15` |
| `DEMO_STARTS_PER_DAY` | `50` |

Leave `DEBUG`, `DJANGO_ADMIN_ENABLED`, and `SECURE_SSL_REDIRECT` unset. Off switch for live AI:
`AI_MONTHLY_BUDGET_USD=0`.

## One-off migrate task

Runs before every service update; the deploy waits for exit 0.

- Command: `["python", "manage.py", "migrate", "--noinput"]` (the entrypoint `exec`s the command).
- The shared environment, with `RUN_MIGRATIONS=0`.
- Migrations stay backward compatible with the previous image during the two-copy overlap (new columns use
  `db_default`).

## Hourly cleanup task

Scheduled by EventBridge Scheduler.

- Command: `["python", "manage.py", "cleanup_demo"]`.
- The shared environment, with `RUN_MIGRATIONS=0`.
- Memory: 256 MiB until it is measured under load (Django plus the cleanup queries; lower it only after a measured run).
- A non-zero exit raises the failed-task alarm.

## Service

- Container port 8000.
- Target group health check: `/health` (interval 15 s, timeout 5 s, healthy 2, unhealthy 3).
- Readiness `/health/ready` is for the deploy smoke test.
- Health-check grace 60 s; `stopTimeout` 120; deregistration delay 120 s (AI calls run up to 100 s; gunicorn's
  graceful timeout is 110 s).
- Memory reservation 320 MiB, hard limit 640 MiB.
- User 1000; `readonlyRootFilesystem: true` with a tmpfs at `/tmp`; drop all capabilities; `no-new-privileges`;
  not privileged.

## Smoke test after deploy

- `GET /` returns 200 with `id="root"`.
- `GET /health/ready` returns 200.
- `POST /api/auth/login` returns 404 (account routes are closed in demo mode).
- `GET /api/demo/status` returns 200 with `"demo_mode":true`.

## WAF expensive-paths rule

Rate-limit `/api/ai/*` and `POST /api/demo/start`. The app's own start limits key IPv4 per address and IPv6 per /64.

## PostgreSQL 17 setup

Once, as the init superuser: run the three statements from `docker/postgres-init/01-resumeiq-role.sql` (create the
`resumeiq` login role, create the `resumeiq` database owned by it, revoke `CONNECT` from `PUBLIC`) with a generated
password instead of the local one. Use `scram-sha-256` authentication.

Connection budget: up to 16 connections per task (2 workers x 8 threads, `CONN_MAX_AGE` 60), 32 during a rolling
deploy, plus the two one-off tasks.

## Turnstile

One site covering the four hostnames; action `start-demo`. The app refuses Cloudflare's test keys in production
unless every `ALLOWED_HOSTS` entry is `localhost` or `127.0.0.1`.

## Rollback

Redeploy the previous image. Migrations are additive, so the previous image runs against the migrated schema.
