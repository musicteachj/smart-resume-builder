# Deployment

Runbook values for deploying Resume IQ as the public demo. Source of truth for the infrastructure is the
portfolio-infra design (`portfolio-infra/docs/design/2026-11-18-portfolio-apps-aws-deployment-design.md`, sections
5.4, 5.5, 5.10); this file holds the values the deploy copies.

## Where it runs

ECS on the shared EC2 server behind the shared ALB, per the portfolio-infra design. Host:
`resumeiq.jameslittlefield.net`. The image is built for `linux/amd64`.

The deploy files live in `deploy/`: `ecs/web.json`, `ecs/setup.json`, `ecs/cleanup.json` and `ecs/service.json` hold
the values below, `deploy.sh` registers them, runs the setup task, and creates or updates the service, `smoke.sh` runs
the smoke test, and `head-of-main.sh` refuses a run that is not for the head of `main`. The `deploy` job in
`.github/workflows/ci.yml` runs it all on `main`, after every other job passes and James approves the `production`
environment. `server/tests/test_deploy.py` tests the files and the scripts.

## Environment

The service, the setup (migrate) task, and the cleanup task share one environment and one list of secrets: the
settings refuse to start in demo mode in production without the secret key, the database URL and both Turnstile keys,
and `manage.py` loads them for every task.

SSM parameters under `/portfolio/resumeiq/`, injected through each container's `secrets`:

| Name | Value |
|---|---|
| `SECRET_KEY` | generated |
| `DATABASE_URL` | `postgres://resumeiq:<password>@172.17.0.1:5432/resumeiq` |
| `ANTHROPIC_API_KEY` | the Resume IQ workspace key (workspace monthly limit $12, alerts at $5 and $9) |
| `TURNSTILE_SITE_KEY` | the Turnstile site key (public, but kept here so one list serves all three tasks) |
| `TURNSTILE_SECRET_KEY` | the Turnstile site's secret |
| `AI_MONTHLY_BUDGET_USD` | a String parameter holding the monthly dollar budget; starts at `0` (live AI off); raised to `10` at go-live by James |

Plain environment variables:

| Name | Value |
|---|---|
| `ALLOWED_HOSTS` | `resumeiq.jameslittlefield.net` |
| `CLIENT_URL` | `https://resumeiq.jameslittlefield.net` |
| `DEMO_MODE` | `true` |
| `RUN_MIGRATIONS` | `0` |
| `AI_PACING_MULTIPLIER` | `3` |
| `AI_DAILY_FLOOR_USD` | `0.50` |
| `AI_VISITOR_BUDGET_USD` | `0.15` |
| `DEMO_STARTS_PER_HOUR` | `15` |
| `DEMO_STARTS_PER_DAY` | `50` |

Leave `DEBUG`, `DJANGO_ADMIN_ENABLED`, and `SECURE_SSL_REDIRECT` unset. Proxy trust is `NUM_PROXIES = 1` in
`settings.py`, with no environment variable.

The budget lives in SSM, not in the task definition, and starts at `0`, so live AI stays off until James raises it (raised to `10` at go-live by James).
Off switch for live AI: set the `AI_MONTHLY_BUDGET_USD` parameter to `0` and force a new deployment of the service
(no commit needed).

## One-off migrate task

The task definition family `resumeiq-setup` (container `resumeiq-setup`). It runs before every service update; the
deploy waits for it and stops before the service if it does not exit 0.

- Command: `["python", "manage.py", "migrate", "--noinput"]` (the entrypoint `exec`s the command).
- The shared environment, which already has `RUN_MIGRATIONS=0`.
- Memory: 256 MiB hard limit.
- Migrations stay backward compatible with the previous image during the two-copy overlap (new columns use
  `db_default`).

## Hourly cleanup task

Scheduled by EventBridge Scheduler. The task definition family is `resumeiq-cleanup` (container `resumeiq-cleanup`).

- Command: `["python", "manage.py", "cleanup_demo"]`.
- The shared environment, which already has `RUN_MIGRATIONS=0`.
- Memory: 256 MiB hard limit until it is measured under load (Django plus the cleanup queries; lower it only after a measured run).
- A non-zero exit raises the failed-task alarm.

## Service

- Container port 8000.
- Target group health check: `/health` (interval 15 s, timeout 5 s, healthy 2, unhealthy 3). The container has its own
  health check on `http://127.0.0.1:8000/health` (interval 15 s, timeout 5 s, 3 retries, start period 30 s).
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

If a smoke check fails, the new release keeps serving (the load balancer and the container check only `/health`),
the deploy exits 1, and no cleanup revision is written. Follow portfolio-infra's `docs/runbooks/incident.md`, "A
deploy's smoke test failed", which rolls back by hand.

## Deploy job

- **Build and push time:** not yet measured for this repo. The deploy builds with no layer cache; the CI docker job's
  partly cached build took 49 seconds. Record the first release's figure here and in the build step's comment in
  `ci.yml` (the step's limit is 8 minutes).
- **After each release:** `deploy.sh` only writes `/portfolio/resumeiq/cleanup-revision`. The hourly cleanup keeps
  running the old revision until the next `PortfolioApps` deploy in portfolio-infra. So after each release, run
  portfolio-infra's revision check (its Phase 3 plan, Task 1, Interfaces) and then a `PortfolioApps` deploy. That
  way the schedule never trails a migration or points at an image that has aged out of ECR (each repository keeps 5).

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

Redeploy the previous image. Migrations are additive, so the previous image runs against the migrated schema. For a
failed smoke test, follow portfolio-infra's `docs/runbooks/incident.md`, "A deploy's smoke test failed".
