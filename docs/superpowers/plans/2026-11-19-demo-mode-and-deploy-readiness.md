# Demo Mode and Deploy Readiness (Resume IQ, Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Resume IQ ready for a public, no-sign-up demo on AWS: every Anthropic call is paid from a paced monthly dollar budget, visitors start a 24-hour guest in one click behind Turnstile, every refusal points at a free path, and the image, CI, and docs are ready for Phase 2. Everything is built and verified on James's machine with Docker.

**Architecture:** A dollar ledger (`apps/ai/pricing.py`, `apps/ai/ledger.py`, two new tables with no foreign key to `User`) reserves the worst case before each model attempt inside `service._call` and settles from real usage after it, in short autocommit-safe statements. A new `apps.demo` Django app owns demo mode (`DEMO_MODE`), the public status flag, guest start (Turnstile plus per-IP throttles), per-guest caps, and the hourly `cleanup_demo` command. The SPA reads `DEMO_MODE` and the Turnstile site key at runtime from `GET /api/demo/status`, hides account screens in demo mode, and shows friendly copy for every refusal.

**Tech Stack:** Django 5.2, DRF 3.18, SimpleJWT 5.5.1, anthropic 0.109.1, Postgres 17 (`pgvector/pgvector:pg17`), React 19 + Vite + TanStack Query + Orval, Vitest, Playwright + axe, gunicorn gthread, Docker Compose, GitHub Actions.

**Spec:** `/Users/jameslittlefield/Documents/github_things/portfolio-infra/docs/design/2026-11-18-portfolio-apps-aws-deployment-design.md` (v2.1), sections 5.1, 5.2, 5.3, 5.4 (Resume IQ), 5.10, 10. Master plan and shared conventions: `/Users/jameslittlefield/Documents/github_things/portfolio-infra/PLAN.md`. Repo rules: `CLAUDE.md` at the repo root. Read all three before starting.

---

## Global Constraints

- **Approvals.** James approves every commit, push, merge, and PR, one at a time. Every commit step says: "Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing." Approval never carries over to the next commit.
- **No paid API calls.** Server tests monkeypatch the service functions (`server/apps/ai/tests/conftest.py:46-91`) or use the fake client in `server/apps/ai/tests/fakes.py` (Task 4). Playwright mocks every `/api/ai/` route (`client/e2e/support/aiMocks.ts`) and the Turnstile script (Task 12). The local production run uses `AI_MONTHLY_BUDGET_USD=0` and a placeholder key.
- **Writing.** American English everywhere. No em dashes anywhere: code, comments, visitor copy, docs, commit messages, PR text.
- **Names and values** (exact; all env-driven in `server/config/settings.py`):

  | Setting | Default | Notes |
  |---|---|---|
  | `DEMO_MODE` | `False` | `true` in production; served to the SPA by `GET /api/demo/status`, never a Vite variable |
  | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | `""` | required when `DEMO_MODE` and not `DEBUG` |
  | `DEMO_STARTS_PER_HOUR`, `DEMO_STARTS_PER_DAY` | `15`, `50` | per client IP, guest start only |
  | `DEMO_GUEST_TTL_HOURS` | `24` | guest lifetime, and its refresh token's |
  | `DEMO_MAX_LIVE_GUESTS` | `300` | site-wide cap on unexpired guests |
  | `DEMO_GUEST_MAX_RESUMES` | `20` | per guest |
  | `DEMO_GUEST_MAX_CONTENT_BYTES` | `65536` | one résumé's `content` as UTF-8 JSON |
  | `DEMO_GUEST_MAX_STORAGE_BYTES` | `5242880` | everything one guest stores (`pg_column_size`) |
  | `AI_MONTHLY_BUDGET_USD` | `10` | `0` means live AI off |
  | `AI_PACING_MULTIPLIER` | `3` | |
  | `AI_DAILY_FLOOR_USD` | `0.50` | |
  | `AI_VISITOR_BUDGET_USD` | `0.15` | per guest, lifetime, counting billed failures |
  | `AI_STALE_RESERVATION_MINUTES` | `10` | sweeper age |
  | `AI_DAILY_LIMIT`, `AI_MONTHLY_LIMIT` | `10`, `50` | existing per-account call caps, now env (were constants at `settings.py:352-353`) |
  | `AI_GUEST_CALL_LIMIT` | `30` | lifetime call cap per guest |
  | `AI_SERVER_SIDE_FALLBACK` | `True` | turns the `server-side-fallback-2026-07-01` beta on or off |
  | `REFRESH_REUSE_GRACE_SECONDS` | `30` | two-tab refresh grace |
- **Turnstile test keys** (Cloudflare "Testing" page; Open Door read it on 2026-11-11, `open-door/apps/api/app/core/config.py:42-67`): always-pass site key `1x00000000000000000000AA`; secrets `1x0000000000000000000000000000000AA` (passes the dummy token `XXXX.DUMMY.TOKEN.XXXX`), `2x0000000000000000000000000000000AA` (always fails), `3x0000000000000000000000000000000AA` (spent token). Before relying on them, re-read developers.cloudflare.com/turnstile/troubleshooting/testing/ and record the date in a comment.
- **Prices** per million tokens (USD), pinned in `apps/ai/pricing.py` and copied from `open-door/apps/api/app/ai/pricing.py` with its source comment: Sonnet 5.5 (`claude-sonnet-5-5`) $2 input, $2.50 cache write, $0.10 cache read, $10 output; Sonnet 5 (`claude-sonnet-5`, the fallback) $2 / $2.50 / $0.20 / $10; Haiku 5.5 (`claude-haiku-5-5`) $0.10 / $0.125 / $0.01 / $0.50, and above 100,000 prompt tokens $0.50 / $0.625 / $0.05 / $2.50. A rate of $X per million tokens is X micro-dollars per token.
- **Pacing (UTC):** `allowance_today = min(left, max(multiplier x left / days_left_including_today, floor))`, where `left = max(0, budget - (settled + open reservations on days before today in this month))`. Admit a reservation only if today's settled + open + the reservation is at most `allowance_today`. Round the even share down to whole micro-dollars.
- **Ledger rules:** own tables, no foreign key to `User`, not in the cache, integer micro-dollars. Reserve and settle are each a few short UPDATE/INSERT statements, optionally inside one `transaction.atomic()` that contains nothing else; no transaction, row lock, or `select_for_update` is ever open while a model call runs. Lock order is always: the reservation row, then the visitor's `User` row, then the `AIBudgetDay` row. Record each reservation's UTC day and settle against it. Keep the full reservation on a timeout, connection error, or unknown outcome; settle to $0 only on 401, 403, 402, a 400 workspace or organization usage-limit error, a 429 carrying `enforced_spend_limit_reached`, and 529 overloaded. Never refund on an exception. The dollar ledger applies to admins and `DEBUG` too.
- **Health:** liveness `/health` (no database) and readiness `/health/ready` (`SELECT 1`, 2 s statement timeout, 503 on failure), both answered in `HealthCheckMiddleware` before host validation and the SSL redirect.
- **Copy:** retention sentence (Privacy): "Your demo and everything in it is removed from the app after 24 hours. Daily server backups keep copies for up to 7 days. Server logs (including IP addresses) are kept for 14 days." Processors: Anthropic, Cloudflare, Amazon Web Services (plus the existing Google Fonts note). Keep the notice "Please don't upload a real resume." (it does not exist in the code today; this plan adds it).
- **Commands** (repo root unless stated; start the database first with `docker compose up -d`):
  - Server tests: `cd server && .venv/bin/python -m pytest <path> -v`; full suite `npm run test:server`.
  - Client: `npm run test:client`, `npm run lint`, `npm run typecheck`, `npm run build`.
  - E2E: `npm run test:e2e` (boots its own Django and Vite; AI and Turnstile mocked).
  - Django checks: `server/.venv/bin/python server/manage.py check --fail-level WARNING` and `server/.venv/bin/python server/manage.py makemigrations --check --dry-run`.
  - API client: after any API change run `npm run gen:api` in `client/`, then `server/.venv/bin/python server/manage.py spectacular --validate --fail-on-warn --file /tmp/openapi-check.yaml`, and commit `client/openapi.yaml` plus `client/src/api/generated/` with the change. Never hand-edit the generated folder.
- **CHANGELOG** (`CHANGELOG.md`): each task adds its bullets under `## [Unreleased]` (Added, Changed, Fixed, Security). Task 17 cuts `[0.17.0]`, bumps the version, and updates the compare links. `1.0.0` stays reserved for the first production deploy.
- **Never stage** `.claude/` or any `.env` file. Stage exact paths only.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each has a test in the task named after it.

1. **A guest's 24 hours end while the editor is open.** The next autosave or AI call must land the visitor on the landing page with "Your demo ended", never "Couldn't save" forever, a retry loop, or a 500. Test: Task 12, `autosave after the demo ends lands on the ended notice`.
2. **A model call straddles UTC midnight or month end.** It settles on the day it reserved; the new day and month start with their full allowance. Test: Task 3, `test_a_call_that_crosses_midnight_settles_on_its_reservation_day`.
3. **The settle write fails after Anthropic has billed the call** (database blip). The visitor still gets the answer, the reservation stays open, and the sweeper charges it in full. Test: Task 4, `test_settle_failure_still_returns_the_answer`.
4. **Résumé or job text in emoji or CJK at the input caps.** The reservation never undercounts (it bounds by UTF-8 bytes, not characters), and a refusal it causes is the friendly one. Tests: Task 2, `test_input_bound_counts_bytes_not_characters`; Task 5, `test_refusals_are_friendly_in_production`.
5. **Cloudflare siteverify is slow or down.** Guest start fails closed within about 5 s with the friendly 503, never a 500 and never a pass. Test: Task 7, `test_siteverify_timeout_is_unavailable` and `test_start_when_the_bot_check_is_unavailable`.

## Decisions this plan makes (the spec left them open)

1. **Visitor allowance admits while room is left.** A guest's reservation is admitted when the guest's settled plus open spend is below `AI_VISITOR_BUDGET_USD`, not when the worst case fits. One worst-case Sonnet reservation (about $0.35 for tailor-jd, $0.38 for parse-resume) is larger than $0.15, so "worst case fits" would refuse every Sonnet action. Overshoot per guest is bounded by one reservation; the site budget still bounds total money.
2. **Input bound = UTF-8 bytes + 2,000 tokens of overhead, no `count_tokens` call.** It assumes no Claude token is shorter than one byte. It adds no network round trip or failure mode. Settle logs a warning if any attempt's real input tokens exceed the bound.
3. **Reservation per call = primary attempt + fallback attempt** (both at full input and `max_tokens`), when the fallback is on. The fallback entry gets `max_tokens` equal to the route's own (`fallbacks=[{"model": "claude-sonnet-5", "max_tokens": N}]`), so quality is unchanged and the second pass is bounded explicitly.
4. **No automatic Haiku retry.** `max_retries=0`; the visitor's next click is the retry, under its own reservation. This also removes the 3 x 30 s plus backoff wall clock.
5. **Other 400s and 500s keep the full reservation** (the spec's "unknown outcome"); only the listed unbilled cases settle to $0. Any 429, plain rate limits included, is on that list (shared rule update 2026-11-19 in `portfolio-infra/PLAN.md`).
6. **Per-guest spend lives on the `User` row** (`demo_ai_spent_micros`); site totals live in `AIBudgetDay` and `AIReservation` with no foreign key. Guest deletion can't erase site spend.
7. **Guests keep a lifetime call cap** (`AI_GUEST_CALL_LIMIT=30`, no daily reset) beside the dollar allowance; the per-account daily and monthly caps are unchanged. The usage pill and the AI menu's usage line are hidden for guests.
8. **Status flag:** `GET /api/demo/status`, cached 60 s. "Today's budget is used" means less than $0.25 of room today (constant `STATUS_MIN_ROOM_MICROS = 250_000`).
9. **Turnstile:** action `start-demo`; hostname must equal an `ALLOWED_HOSTS` entry; test secrets are answered locally without a network call (Open Door's pattern, because Cloudflare's test answers carry hostname `example.com` and no action); production settings refuse test keys unless every `ALLOWED_HOSTS` entry is `localhost` or `127.0.0.1`. The widget script loads only when the visitor clicks "Try the live demo". Siteverify uses stdlib `urllib` (no new dependency).
10. **Guest identity:** email `guest-<uuid hex>@demo.invalid` (a reserved TLD), name "Demo guest", unusable password, `is_guest=True`, `guest_expires_at = now + 24 h`, plus one sample résumé. The guest lands in the editor on that résumé.
11. **Two-tab grace:** on rotation the server stores `refresh-successor:<old jti> -> <new jti>` in the existing database cache for 30 s. A just-rotated token is accepted only while a live, unrevoked successor exists; the answer is an access token with no new cookie. Losing a cache entry only brings back today's sign-out, never a bypass.
12. **Session-ended signal:** refresh answers 401 with `code: "no_session"` (no cookie) or `code: "session_ended"` (cookie unusable, cookie cleared). The client shows "Your demo ended" when a session that was in use ends, or when a cookie is refused at load.
13. **End demo replaces sign-out for guests.** The guest menu has one item, "Sign out and end demo", with a confirm dialog; it calls `delete-account` with no password and deletes the guest's data at once. `/account` redirects to `/` in demo mode.
14. **Per-guest storage cap** measured with `pg_column_size` across résumés, versions, and cover letters (5 MiB), on top of the 20-résumé count and the 64 KB content cap. With 300 live guests the worst case is about 1.5 GB.
15. **Cleanup command** `cleanup_demo`: deletes expired guests in batches of 100, sweeps stale reservations, runs `flushexpiredtokens`, prunes settled reservation rows older than 35 days. `AIBudgetDay` rows are kept forever.
16. **Local Postgres 17 uses a new volume** (`postgres17_data`), and an init script creates a non-superuser `resumeiq` role owning a `resumeiq` database, so the production role setup is rehearsed locally. The compose `prod` profile becomes a production-like run (demo mode, budget 0, read-only root, 640 MiB, all capabilities dropped).
17. **E2E demo coverage** runs as two extra Playwright projects (`demo-chromium`, `demo-webkit`) against a second Django (port 8013, `DEMO_MODE=True`, database `resume_builder_e2e_demo`) and Vite (port 5182).
18. **Landing screenshots** are captured by a dedicated Playwright project (`npm run screenshots`, AI mocked) into `client/src/features/marketing/screenshots/`; the tailoring shot is captioned as an illustrative example.
19. **ProtectedRoute** redirects to `/` in demo mode and keeps `/login` outside it, so the account e2e suite stays as it is.
20. **This phase cuts `0.17.0`.**

## File map

Server (`server/`):
- `apps/ai/pricing.py` (new): prices, input bound, reservation and cost math.
- `apps/ai/ledger.py` (new): pacing, reserve, settle, sweep, prune, room today.
- `apps/ai/models.py`: add `AIBudgetDay`, `AIReservation`; migration `apps/ai/migrations/0003_ai_budget_ledger.py`.
- `apps/ai/service.py`: `_call` reserves and settles; error classes; Haiku retries off; fallback setting and `max_tokens`.
- `apps/ai/refusals.py` (new): refusal codes and copy.
- `apps/ai/views.py`, `apps/ai/usage.py`: friendly refusals, guest lifetime cap, resilience when a guest disappears.
- `apps/accounts/models.py`: `is_guest`, `guest_expires_at`, `demo_ai_spent_micros`; migration `apps/accounts/migrations/0003_user_guest_fields.py`.
- `apps/accounts/tokens.py`, `apps/accounts/refresh.py` (new): guest-capped refresh tokens, rotation with grace.
- `apps/accounts/views.py`, `serializers.py`, `cookies.py`: closed routes, end demo, refresh view.
- `apps/demo/` (new app): `closed.py`, `views.py` (status, start), `serializers.py`, `turnstile.py`, `throttles.py`, `sample.py`, `messages.py`, `quotas.py`, `management/commands/cleanup_demo.py`, `tests/`.
- `apps/resumes/views.py`, `serializers.py`: per-guest caps.
- `config/settings.py`, `config/middleware.py`, `config/urls.py`: env settings, CSP, readiness, schema closure, SPA regex.
- `conftest.py`: `guest` and `at` fixtures, throttle scopes.

Client (`client/`):
- `src/features/demo/` (new): `useDemoStatus.ts`, `turnstile.ts`, `StartDemoButton.tsx`, `EndDemoDialog.tsx`, `DemoNotices.tsx`, `Screenshots.tsx`, `screenshots.ts`, tests.
- `src/App.tsx`, `src/routes/guards.tsx`, `src/stores/auth.ts`, `src/features/auth/bootstrap.ts`, `src/api/interceptors.ts`, `src/features/marketing/LandingPage.tsx`, `src/components/layout/AppHeader.tsx`, `src/features/ai/AiMenu.tsx`, `src/features/ai/aiError.ts`, `src/features/dashboard/DashboardPage.tsx`, `src/features/dashboard/ImportResumeModal.tsx`, `src/features/editor/useAutosave.ts`, `src/features/editor/components/SaveIndicator.tsx`, `src/features/legal/*`, `src/lib/site.ts`, `index.html`.
- `e2e/demo/*.spec.ts`, `e2e/screenshots/landing.spec.ts`, `e2e/support/turnstileMock.ts`, `e2e/server/expire_guests.py`, `playwright.config.ts`, `e2e/support/env.ts`, `e2e/support/fixtures.ts`, `package.json` (`screenshots` script).

Repo root: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/postgres-init/01-resumeiq-role.sql` (new), `docker-entrypoint.sh` (comment), `.github/workflows/{ci,codeql,security}.yml`, `docs/DEPLOYMENT.md` (new), `CLAUDE.md`, `README.md`, `PLAN.md`, `.env.example`, `CHANGELOG.md`, `package.json`, `package-lock.json`.

---

### Task 1: Set up the work branch

**Files:** commits only this plan file.

- [x] **Step 1: Confirm the start state**

Run: `cd /Users/jameslittlefield/Documents/github_things/smart-resume-builder && git fetch origin && git status --short && git log --oneline -1 && git rev-list --left-right --count origin/dev...readme-and-0-16-0 && git rev-parse origin/readme-and-0-16-0`
Expected: untracked `.claude/` and `docs/superpowers/plans/2026-11-19-demo-mode-and-deploy-readiness.md` only; HEAD `bbd8bb2 docs: bring the README up to date and cut 0.16.0`; counts `0	1`; the remote branch is at `bbd8bb2...`. If `origin/dev` moved past `a298cf7` or the remote branch differs, stop and tell James.

- [x] **Step 2: Check for an existing PR**

Run: `gh pr list --head readme-and-0-16-0 --state all`
Expected: none. If one exists, use it in the next steps instead of opening another.

- [x] **Step 3: Open the PR into `dev`**

The repo merges into `dev` through PRs with required CI checks (`CLAUDE.md:67-72`, `CLAUDE.md:216-218`).
Stop: show James the PR title and body, and wait for his explicit OK before running:
```bash
gh pr create --base dev --head readme-and-0-16-0 \
  --title "docs: bring the README up to date and cut 0.16.0" \
  --body "Brings the README up to date with the pre-launch batch and cuts 0.16.0 (CHANGELOG, package.json). No code changes."
```
(Add the PR attribution line your harness requires.)

- [x] **Step 4: Wait for CI**

Run: `gh pr checks <number> --watch`
Expected: every required check passes (the e2e job is not required).

- [x] **Step 5: Merge**

Stop: wait for James's explicit OK to merge. Then:
```bash
gh pr merge <number> --merge
git switch dev && git pull --ff-only origin dev
git log --oneline -2
```
Expected: the merge commit on top of `bbd8bb2`; `git status --short` still shows only the two untracked items.

- [x] **Step 6: Create the work branch**

Stop: wait for James's explicit OK. Then `git switch -c feat/portfolio-demo-readiness`.

- [x] **Step 7: Baseline is green**

Run: `docker compose up -d && npm run test:server && npm run test:client && npm run lint && npm run typecheck`
Expected: all pass. Write the test counts in the session notes.

Done 2026-11-19: PR #48 had already been merged into `dev` (`37495bd`, same tree as `bbd8bb2`), so Steps 2 to 5 were complete before this session. Baseline on `37495bd`: server 182 passed, client 182 passed (43 files), lint and typecheck clean (after `npm ci` in `client/` restored a missing `@playwright/test`).

- [x] **Step 8: Commit the plan**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add docs/superpowers/plans/2026-11-19-demo-mode-and-deploy-readiness.md
git commit -m "docs: add the demo mode and deploy readiness plan"
```

---

### Task 2: Pricing and a safe input bound

**Files:**
- Create: `server/apps/ai/pricing.py`
- Test: `server/apps/ai/tests/test_pricing.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Price(input_usd_per_mtok, cache_write_5m_usd_per_mtok, cache_read_usd_per_mtok, output_usd_per_mtok)` (frozen dataclass of `Decimal`), `PRICES: Mapping[str, Price]`.
  - `INPUT_OVERHEAD_TOKENS = 2_000`
  - `def input_token_bound(*, system: str, messages: list[dict], output_config: dict | None = None) -> int`
  - `@dataclass(frozen=True) class Attempt: model: str; max_tokens: int`
  - `def reservation_micros(attempts: Sequence[Attempt], input_tokens: int) -> int`
  - `def cost_micros(model: str, *, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0, cache_write_tokens: int = 0) -> int`
  - `def served_cost_micros(resp, *, requested_model: str) -> int`
  - `def usd_to_micros(usd: Decimal) -> int`

- [x] **Step 1: Write the failing tests**

```python
from decimal import Decimal
from types import SimpleNamespace

from apps.ai import pricing
from apps.ai.pricing import Attempt


def _usage(model=None, inp=0, out=0, kind="message"):
    return SimpleNamespace(type=kind, model=model, input_tokens=inp, output_tokens=out,
                           cache_read_input_tokens=0, cache_creation_input_tokens=0)


def test_prices_match_the_design():
    s55, s5, h = (pricing.PRICES[m] for m in ("claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-5-5"))
    assert (s55.input_usd_per_mtok, s55.output_usd_per_mtok) == (Decimal("2.00"), Decimal("10.00"))
    assert (s5.input_usd_per_mtok, s5.output_usd_per_mtok) == (Decimal("2.00"), Decimal("10.00"))
    assert (h.input_usd_per_mtok, h.output_usd_per_mtok) == (Decimal("0.10"), Decimal("0.50"))


def test_cost_is_whole_micro_dollars():
    assert pricing.cost_micros("claude-sonnet-5-5", input_tokens=3_000, output_tokens=1_500) == 21_000
    assert pricing.cost_micros("claude-haiku-5-5", input_tokens=1_000, output_tokens=200) == 200
    # Haiku's long-prompt tier above 100,000 prompt tokens
    assert pricing.cost_micros("claude-haiku-5-5", input_tokens=120_000, output_tokens=100) == 60_250


def test_an_unknown_model_is_priced_at_the_dearest_rates(caplog):
    unknown = pricing.cost_micros("claude-mystery", input_tokens=1_000, output_tokens=1_000)
    assert unknown >= pricing.cost_micros("claude-sonnet-5-5", input_tokens=1_000, output_tokens=1_000)
    assert "claude-mystery" in caplog.text


def test_reservation_covers_every_attempt_at_its_worst():
    both = [Attempt("claude-sonnet-5-5", 8_000), Attempt("claude-sonnet-5", 8_000)]
    assert pricing.reservation_micros(both, input_tokens=37_000) == 345_000  # 2 x (37,000 x 2.50 + 8,000 x 10)
    assert pricing.reservation_micros([Attempt("claude-haiku-5-5", 1_024)], input_tokens=5_500) == 1_200


def test_served_cost_sums_fallback_iterations():
    usage = SimpleNamespace(input_tokens=3_000, output_tokens=1_500, cache_read_input_tokens=0,
                            cache_creation_input_tokens=0, iterations=[
                                _usage("claude-sonnet-5-5", 3_000, 400),
                                _usage("claude-sonnet-5", 3_000, 1_500, kind="fallback_message")])
    resp = SimpleNamespace(model="claude-sonnet-5", usage=usage)
    assert pricing.served_cost_micros(resp, requested_model="claude-sonnet-5-5") == 31_000


def test_served_cost_without_iterations_uses_the_serving_model():
    usage = SimpleNamespace(input_tokens=1_000, output_tokens=200, cache_read_input_tokens=None,
                            cache_creation_input_tokens=None, iterations=None)
    resp = SimpleNamespace(model="claude-haiku-5-5", usage=usage)
    assert pricing.served_cost_micros(resp, requested_model="claude-haiku-5-5") == 200


def test_input_bound_counts_bytes_not_characters():  # Review Focus 4
    text = "\U0001d49c" * 20_000  # four UTF-8 bytes each
    bound = pricing.input_token_bound(system="", messages=[{"role": "user", "content": text}])
    assert bound >= 80_000 + pricing.INPUT_OVERHEAD_TOKENS
    assert pricing.input_token_bound(system="ab", messages=[]) >= 2 + pricing.INPUT_OVERHEAD_TOKENS
```

- [x] **Step 2: Run the tests to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests/test_pricing.py -v`
Expected: FAIL, `ImportError: cannot import name 'pricing'`.

- [x] **Step 3: Implement `apps/ai/pricing.py`**

Copy the `Price` table, `HAIKU_LONG_PROMPT_PRICE`, the dearest-price fallback with its warning, and the source comment from `open-door/apps/api/app/ai/pricing.py:24-238`, keeping only the three models above. Money is `Decimal`; results are whole micro-dollars: `cost_micros` rounds half to even, `reservation_micros` rounds up. A reservation prices input at `max(input, cache_write_5m)` and output at the full `max_tokens`, summed over attempts. `served_cost_micros` sums every entry of `resp.usage.iterations` at that entry's `model` (falling back to `resp.model`) when the list is non-empty, else prices `resp.usage` at `resp.model` (falling back to `requested_model`); treat `None` token counts as 0. `input_token_bound` returns the UTF-8 byte length of `system`, `json.dumps(messages, ensure_ascii=False)`, and `json.dumps(output_config or {}, ensure_ascii=False)` plus `INPUT_OVERHEAD_TOKENS`; its docstring states the assumption that no token is shorter than one byte.

- [x] **Step 4: Run the tests to see them pass**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests/test_pricing.py -v`
Expected: 7 passed.

- [x] **Step 5: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/ai/pricing.py server/apps/ai/tests/test_pricing.py
git commit -m "feat: price Claude calls in micro-dollars with a byte-safe input bound"
```

---

### Task 3: Budget ledger, daily pacing, and the guest flag

**Files:**
- Modify: `server/apps/ai/models.py` (add two models), `server/apps/accounts/models.py:8-42` (three fields, one index), `server/config/settings.py:350-365` (budget settings), `server/conftest.py` (fixtures)
- Create: `server/apps/ai/ledger.py`, migrations `server/apps/ai/migrations/0003_ai_budget_ledger.py` and `server/apps/accounts/migrations/0003_user_guest_fields.py` (generated)
- Test: `server/apps/ai/tests/test_ledger.py`, `server/apps/accounts/tests/test_prod_settings.py`

**Interfaces:**
- Consumes: `pricing.usd_to_micros`.
- Produces:
  - Models: `AIBudgetDay(day: DateField primary_key, settled_micros: BigIntegerField default 0, reserved_micros: BigIntegerField default 0)`; `AIReservation(id: UUID pk, day: DateField db_index, amount_micros: BigIntegerField, actual_micros: BigIntegerField null, visitor_id: BigIntegerField null (a User pk, deliberately no FK), feature: CharField(32), model: CharField(64), created_at: DateTimeField (set by `reserve`, no auto_now), settled_at: DateTimeField null, settled_how: CharField(10, choices usage/unbilled/kept/swept, blank))` with a partial index on `created_at` where `settled_at IS NULL`.
  - `User.is_guest = BooleanField(default=False, db_default=False)`, `User.guest_expires_at = DateTimeField(null=True, blank=True)`, `User.demo_ai_spent_micros = BigIntegerField(default=0, db_default=0)`, partial index `accounts_guest_expiry_idx` on `guest_expires_at` where `is_guest`.
  - `apps/ai/ledger.py`: `def utcnow() -> datetime` (the patch point for tests); `class BudgetRefused(Exception)` with `.scope: Literal["off", "daily", "visitor"]`; `@dataclass(frozen=True) class Reservation: id: UUID; day: date; amount_micros: int; visitor_id: int | None`; `def allowance_today_micros(*, budget: int, multiplier: Decimal, floor: int, spent_before_today: int, today: date) -> int`; `def live_ai_off() -> bool`; `def reserve(*, amount_micros: int, feature: str, model: str, visitor_id: int | None) -> Reservation`; `def settle(reservation: Reservation, actual_micros: int, *, how: Literal["usage", "unbilled", "kept", "swept"]) -> None`; `def sweep_stale(*, older_than: timedelta) -> int`; `def prune_settled(*, older_than: timedelta) -> int`; `def room_today_micros() -> int`.
  - Settings: `AI_MONTHLY_BUDGET_USD`, `AI_DAILY_FLOOR_USD`, `AI_VISITOR_BUDGET_USD` (`Decimal`, at least 0), `AI_PACING_MULTIPLIER` (`Decimal`, at least 1), `AI_STALE_RESERVATION_MINUTES` (`int`); a bad value raises `ImproperlyConfigured`.
  - Fixtures in `server/conftest.py`: `guest` (a `User` with `is_guest=True`, `guest_expires_at=now+24h`, email `guest-test@demo.invalid`, name "Demo guest"), `guest_client` (an `APIClient` with `force_authenticate(guest)`), and `at` (returns `set_now(moment: datetime)`, which monkeypatches `apps.ai.ledger.utcnow`).

- [x] **Step 1: Write the failing tests** in `server/apps/ai/tests/test_ledger.py`

```python
import threading
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from django.db import connection

from apps.ai import ledger
from apps.ai.ledger import BudgetRefused
from apps.ai.models import AIBudgetDay, AIReservation

pytestmark = pytest.mark.django_db
DAY = dict(feature="ats-check", model="claude-sonnet-5-5", visitor_id=None)


@pytest.mark.parametrize("today, spent_before, expected", [
    (date(2026, 11, 1), 0, 1_000_000),           # 3 x $10 / 30 days
    (date(2026, 11, 20), 9_000_000, 500_000),    # even share below the floor: floor
    (date(2026, 11, 30), 9_800_000, 200_000),    # never more than is left
    (date(2026, 11, 30), 10_500_000, 0),         # already over: nothing
    (date(2026, 12, 1), 0, 967_741),             # 31-day month, rounded down
])
def test_allowance_today_follows_the_pacing_formula(today, spent_before, expected):
    assert ledger.allowance_today_micros(budget=10_000_000, multiplier=Decimal(3), floor=500_000,
                                         spent_before_today=spent_before, today=today) == expected


def test_reserve_admits_up_to_the_allowance_and_no_further(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=999_999, **DAY)
    ledger.reserve(amount_micros=1, **DAY)
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1, **DAY)
    assert refused.value.scope == "daily"
    assert AIBudgetDay.objects.get(day=date(2026, 11, 1)).reserved_micros == 1_000_000


def test_budget_zero_is_off(at, settings):
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    assert ledger.live_ai_off()
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1, **DAY)
    assert refused.value.scope == "off"


def test_open_reservations_from_earlier_days_count_against_the_month(at):
    AIBudgetDay.objects.create(day=date(2026, 11, 19), settled_micros=8_000_000, reserved_micros=1_000_000)
    at(datetime(2026, 11, 20, 9, tzinfo=UTC))   # left $1.00 -> allowance is the $0.50 floor
    ledger.reserve(amount_micros=500_000, **DAY)
    with pytest.raises(BudgetRefused):
        ledger.reserve(amount_micros=1, **DAY)


def test_last_months_spend_does_not_count(at):
    AIBudgetDay.objects.create(day=date(2026, 10, 31), settled_micros=10_000_000)
    at(datetime(2026, 11, 1, 0, 5, tzinfo=UTC))
    ledger.reserve(amount_micros=1_000_000, **DAY)


def test_settle_moves_the_reservation_to_its_actual_cost_once(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    r = ledger.reserve(amount_micros=300_000, **DAY)
    ledger.settle(r, 21_000, how="usage")
    ledger.settle(r, 21_000, how="usage")  # a second settle is a no-op
    day = AIBudgetDay.objects.get(day=r.day)
    assert (day.reserved_micros, day.settled_micros) == (0, 21_000)
    row = AIReservation.objects.get(pk=r.id)
    assert (row.actual_micros, row.settled_how) == (21_000, "usage")


def test_a_call_that_crosses_midnight_settles_on_its_reservation_day(at):  # Review Focus 2
    at(datetime(2026, 11, 30, 23, 59, 30, tzinfo=UTC))
    r = ledger.reserve(amount_micros=300_000, **DAY)
    at(datetime(2026, 12, 1, 0, 0, 40, tzinfo=UTC))
    ledger.settle(r, 21_000, how="usage")
    nov30 = AIBudgetDay.objects.get(day=date(2026, 11, 30))
    assert (nov30.reserved_micros, nov30.settled_micros) == (0, 21_000)
    ledger.reserve(amount_micros=967_741, **DAY)  # December's first day has its full allowance
    with pytest.raises(BudgetRefused):
        ledger.reserve(amount_micros=1, **DAY)


def test_visitor_allowance_admits_while_room_is_left(at, guest, settings):
    settings.AI_VISITOR_BUDGET_USD = Decimal("0.15")
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    first = ledger.reserve(amount_micros=345_000, feature="tailor-jd", model="claude-sonnet-5-5", visitor_id=guest.pk)
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1_200, feature="improve-bullet", model="claude-haiku-5-5", visitor_id=guest.pk)
    assert refused.value.scope == "visitor"
    ledger.settle(first, 31_000, how="usage")
    ledger.reserve(amount_micros=1_200, feature="improve-bullet", model="claude-haiku-5-5", visitor_id=guest.pk)
    guest.refresh_from_db()
    assert guest.demo_ai_spent_micros == 32_200


def test_a_daily_refusal_leaves_the_visitor_untouched(at, guest):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    with pytest.raises(BudgetRefused) as refused:
        ledger.reserve(amount_micros=1_000_001, feature="tailor-jd", model="claude-sonnet-5-5", visitor_id=guest.pk)
    assert refused.value.scope == "daily"
    guest.refresh_from_db()
    assert guest.demo_ai_spent_micros == 0


def test_sweeper_charges_reservations_older_than_ten_minutes(at):
    at(datetime(2026, 11, 1, 12, 0, tzinfo=UTC)); old = ledger.reserve(amount_micros=300_000, **DAY)
    at(datetime(2026, 11, 1, 12, 5, tzinfo=UTC)); ledger.reserve(amount_micros=100_000, **DAY)
    at(datetime(2026, 11, 1, 12, 11, tzinfo=UTC))
    assert ledger.sweep_stale(older_than=timedelta(minutes=10)) == 1
    assert AIReservation.objects.get(pk=old.id).settled_how == "swept"
    day = AIBudgetDay.objects.get(day=date(2026, 11, 1))
    assert (day.settled_micros, day.reserved_micros) == (300_000, 100_000)


def test_prune_removes_only_old_settled_rows(at):
    at(datetime(2026, 9, 1, tzinfo=UTC)); kept_open = ledger.reserve(amount_micros=1, **DAY)
    settled = ledger.reserve(amount_micros=1, **DAY); ledger.settle(settled, 1, how="usage")
    at(datetime(2026, 11, 1, tzinfo=UTC))
    assert ledger.prune_settled(older_than=timedelta(days=35)) == 1
    assert AIReservation.objects.filter(pk=kept_open.id).exists()
    assert AIBudgetDay.objects.filter(day=date(2026, 9, 1)).exists()


def test_room_today(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=400_000, **DAY)
    assert ledger.room_today_micros() == 600_000


@pytest.mark.django_db(transaction=True)
def test_two_reservations_racing_for_the_last_room_admit_one(at):
    at(datetime(2026, 11, 1, 12, tzinfo=UTC))
    ledger.reserve(amount_micros=600_000, **DAY)
    barrier, results = threading.Barrier(2), []

    def worker():
        barrier.wait()
        try:
            ledger.reserve(amount_micros=300_000, **DAY); results.append("ok")
        except BudgetRefused:
            results.append("refused")
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    [t.start() for t in threads]; [t.join() for t in threads]
    assert sorted(results) == ["ok", "refused"]
```

Add to `test_prod_settings.py`, following `_import_settings` (`test_prod_settings.py:42-60`): `AI_MONTHLY_BUDGET_USD="-1"` and `AI_PACING_MULTIPLIER="0.5"` fail with `ImproperlyConfigured`; `AI_MONTHLY_BUDGET_USD="25"` reads back as `Decimal("25")`.

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests/test_ledger.py -v`
Expected: FAIL on import (`ledger`, `AIBudgetDay`) and the missing `guest` and `at` fixtures.

- [x] **Step 3: Add the settings, model fields, and fixtures; generate migrations**

Run: `server/.venv/bin/python server/manage.py makemigrations ai --name ai_budget_ledger && server/.venv/bin/python server/manage.py makemigrations accounts --name user_guest_fields && server/.venv/bin/python server/manage.py sqlmigrate accounts 0003`
Expected: the SQL shows `ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL` and `ADD COLUMN "demo_ai_spent_micros" bigint DEFAULT 0 NOT NULL` (database defaults, so a running 0.16.0 copy keeps inserting users during the deploy overlap; Postgres adds these without a table rewrite).

- [x] **Step 4: Implement `apps/ai/ledger.py`**

```text
reserve(amount, feature, model, visitor_id):
  budget = micros(AI_MONTHLY_BUDGET_USD); if budget == 0: raise BudgetRefused("off")
  now = utcnow(); today = now.date()
  spent_before = sum(settled + reserved) over AIBudgetDay with first-of-month <= day < today
  allowance = allowance_today_micros(...)
  with transaction.atomic():                         # milliseconds; never wraps a model call
      AIBudgetDay bulk_create([AIBudgetDay(day=today)], ignore_conflicts=True)
      if visitor_id is not None:                     # lock 1: the visitor row
          n = User.filter(pk=visitor_id, demo_ai_spent_micros < micros(AI_VISITOR_BUDGET_USD))
                  .update(demo_ai_spent_micros = F + amount)
          if n == 0: raise BudgetRefused("visitor")
      n = AIBudgetDay.filter(day=today, settled + reserved + amount <= allowance)   # lock 2: the day row
              .update(reserved_micros = F + amount)
      if n == 0: raise BudgetRefused("daily")       # rolls back the visitor increment
      row = AIReservation.create(day=today, amount, visitor_id, feature, model, created_at=now)
  return Reservation(row.id, today, amount, visitor_id)

settle(r, actual, how):
  with transaction.atomic():
      n = AIReservation.filter(pk=r.id, settled_at=None).update(settled_at=utcnow(), actual_micros=actual, settled_how=how)
      if n == 0: return                              # already settled or swept
      if r.visitor_id: User.filter(pk=r.visitor_id).update(demo_ai_spent_micros = F + (actual - r.amount))  # 0 rows if gone
      AIBudgetDay.filter(day=r.day).update(reserved_micros = F - r.amount, settled_micros = F + actual)

sweep_stale(older_than): settle(row, row.amount_micros, how="swept") for each open row created before utcnow() - older_than
prune_settled(older_than): delete settled rows created before utcnow() - older_than; never touch AIBudgetDay
room_today_micros(): max(0, allowance_today - (today's settled + reserved))
```
Module docstring: the rules from Global Constraints (no lock across the call, lock order, never refund on exception) and a pointer to `open-door/apps/api/app/ai/budget.py` as the pattern.

- [x] **Step 5: Run the tests to see them pass**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests/test_ledger.py apps/accounts/tests/test_prod_settings.py -v && cd .. && server/.venv/bin/python server/manage.py makemigrations --check --dry-run`
Expected: all pass; "No changes detected".

- [x] **Step 6: CHANGELOG** under `[Unreleased]` / Added: the AI spend ledger (monthly budget paced daily, per-guest allowance, its own tables).

- [x] **Step 7: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/ai/ledger.py server/apps/ai/models.py server/apps/ai/migrations/0003_ai_budget_ledger.py \
  server/apps/accounts/models.py server/apps/accounts/migrations/0003_user_guest_fields.py \
  server/config/settings.py server/conftest.py server/apps/ai/tests/test_ledger.py \
  server/apps/accounts/tests/test_prod_settings.py CHANGELOG.md
git commit -m "feat: add the AI spend ledger with daily pacing and a per-guest allowance"
```

---

### Task 4: Every model call goes through the ledger

**Files:**
- Modify: `server/apps/ai/service.py:25-93` (error classes, clients, `_FALLBACKS`, `_call`) and every feature function (`:194-526`), `server/apps/ai/views.py` (pass `visitor_id`), `server/config/settings.py:350-365`
- Create: `server/apps/ai/tests/fakes.py` (move `_response`, `_text`, `THINKING`, `_Messages`, `_FakeClient`, the `fake` fixture out of `test_service_requests.py`)
- Modify tests: `server/apps/ai/tests/test_service_requests.py`, `test_service_limits.py:25-31`, `conftest.py:46-91`, `server/apps/accounts/tests/test_prod_settings.py`
- Test: `server/apps/ai/tests/test_service_budget.py`

**Interfaces:**
- Consumes: Task 2 (`Attempt`, `input_token_bound`, `reservation_micros`, `served_cost_micros`), Task 3 (`ledger.reserve`, `ledger.settle`, `BudgetRefused`, `User.is_guest`).
- Produces:
  - `class AIBudgetRefusedError(AIServiceError)` with `.scope` (`"off" | "daily" | "visitor"`); `class AIProviderLimitError(AIServiceError)`; `class AIUnavailableError(AIServiceError)`.
  - `def _call(client, *, model: str, effort: str, feature: str, visitor_id: int | None, **kwargs)`.
  - Every feature function takes a keyword-only `visitor_id: int | None = None` and passes its route name as `feature` (`improve-bullet`, `generate-summary`, `tailor-jd`, `cover-letter`, `ats-check`, `parse-resume`).
  - `apps/ai/views.py`: `def _visitor_id(user) -> int | None` returns `user.pk if user.is_guest else None`; every view passes it.
  - Settings: `AI_SERVER_SIDE_FALLBACK: bool` (env, default `True`); `AI_DAILY_LIMIT`, `AI_MONTHLY_LIMIT` read from env.
  - `fakes.py`: `_response(*blocks, stop_reason="end_turn", category=None, usage=SONNET_USAGE, model="claude-sonnet-5-5")`; `SONNET_USAGE` (3,000 in, 1,500 out, no iterations); the `fake` fixture returns `install(response, *, on_call=None) -> _FakeClient`, whose `messages.create` and `beta.messages.create` record the kwargs, call `on_call(kwargs)` if given, then raise the response if it is an exception or return it. Re-export the fixture from `apps/ai/tests/conftest.py` so every AI test module can use it.
  - Every route keeps today's `max_tokens` (parse-resume stays at 12,000: no paid measurement before launch).

- [x] **Step 1: Write the failing tests** in `test_service_budget.py` (import the real feature functions before `mock_claude` replaces them, as `test_service_requests.py:11-21` does; `pytestmark = pytest.mark.django_db`)

```python
REQ = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
ATS_JSON = '{"score": 70, "issues": [], "recommendations": []}'

def status_error(code, message="error", body=None):
    return anthropic.APIStatusError(message, response=httpx.Response(code, request=REQ),
                                    body=body or {"type": "error", "error": {"type": "x", "message": message}})


def test_a_call_reserves_then_settles_from_usage(fake, content):
    fake(_response(_text(ATS_JSON)))
    real_ats_health_check(content)
    r = AIReservation.objects.get()
    assert (r.feature, r.settled_how, r.actual_micros) == ("ats-check", "usage", 21_000)
    assert r.amount_micros > 21_000


@pytest.mark.parametrize("stop_reason, error", [("refusal", AIRefusedError), ("max_tokens", AIServiceError)])
def test_billed_endings_are_settled_before_raising(fake, content, stop_reason, error):
    fake(_response(_text("partial"), stop_reason=stop_reason))
    with pytest.raises(error):
        real_ats_health_check(content)
    assert AIReservation.objects.get().settled_how == "usage"


def test_unreadable_json_is_still_charged(fake, content):
    fake(_response(_text("not json")))
    with pytest.raises(AIServiceError):
        real_ats_health_check(content)
    assert AIReservation.objects.get().actual_micros == 21_000


UNBILLED = [
    (status_error(401), AIUnavailableError), (status_error(403), AIUnavailableError),
    (status_error(402), AIProviderLimitError),
    (status_error(400, "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."), AIProviderLimitError),
    (status_error(400, "You have reached your specified organization API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."), AIProviderLimitError),
    (status_error(429, "limit", {"type": "error", "error": {"type": "rate_limit_error", "message": "limit", "error_code": "enforced_spend_limit_reached"}}), AIProviderLimitError),
    (status_error(529, "Overloaded"), AIUnavailableError),
]

@pytest.mark.parametrize("exc, error", UNBILLED)
def test_known_unbilled_failures_settle_to_zero(fake, content, exc, error):
    fake(exc)
    with pytest.raises(error):
        real_ats_health_check(content)
    r = AIReservation.objects.get()
    assert (r.settled_how, r.actual_micros) == ("unbilled", 0)


KEPT = [anthropic.APITimeoutError(request=REQ), anthropic.APIConnectionError(request=REQ),
        status_error(500), status_error(429, "Number of requests has exceeded your rate limit"),
        status_error(400, "messages: field required")]

@pytest.mark.parametrize("exc", KEPT)
def test_unknown_outcomes_keep_the_full_reservation(fake, content, exc):
    fake(exc)
    with pytest.raises(AIUnavailableError):
        real_ats_health_check(content)
    r = AIReservation.objects.get()
    assert (r.settled_how, r.actual_micros) == ("kept", r.amount_micros)


def test_budget_refusal_sends_nothing(fake, content, settings):
    client = fake(_response(_text(ATS_JSON))); settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    with pytest.raises(AIBudgetRefusedError) as refused:
        real_ats_health_check(content)
    assert refused.value.scope == "off"
    assert client.messages.calls + client.beta.messages.calls == []


def test_ledger_outage_fails_closed(fake, content, monkeypatch):
    client = fake(_response(_text(ATS_JSON)))
    monkeypatch.setattr(ledger, "reserve", Mock(side_effect=OperationalError("down")))
    with pytest.raises(AIUnavailableError):
        real_ats_health_check(content)
    assert client.beta.messages.calls == []


def test_settle_failure_still_returns_the_answer(fake, content, monkeypatch, at):  # Review Focus 3
    at(datetime(2026, 11, 1, 12, tzinfo=UTC)); fake(_response(_text(ATS_JSON)))
    monkeypatch.setattr(service.ledger, "settle", Mock(side_effect=OperationalError("blip")))
    assert real_ats_health_check(content)["score"] == 70
    assert AIReservation.objects.get().settled_at is None
    monkeypatch.undo(); at(datetime(2026, 11, 1, 12, 11, tzinfo=UTC))
    assert ledger.sweep_stale(older_than=timedelta(minutes=10)) == 1


def test_guest_deleted_during_the_call_still_settles(fake, content, guest):
    fake(_response(_text(ATS_JSON)), on_call=lambda _kw: User.objects.filter(pk=guest.pk).delete())
    real_ats_health_check(content, visitor_id=guest.pk)
    assert AIBudgetDay.objects.get().settled_micros == 21_000


@pytest.mark.django_db(transaction=True)
def test_no_transaction_is_open_during_the_model_call(fake, content):
    seen = []
    fake(_response(_text(ATS_JSON)), on_call=lambda _kw: seen.append(connection.in_atomic_block))
    real_ats_health_check(content)
    assert seen == [False]


def test_the_fallback_doubles_the_reservation_and_has_its_own_max_tokens(fake, content, settings):
    client = fake(_response(_text('{"match_score": 50, "missing_keywords": [], "suggestions": []}')))
    real_tailor_to_jd(content, "Python")
    call = client.beta.messages.calls[0]
    assert call["fallbacks"] == [{"model": "claude-sonnet-5", "max_tokens": 8000}]
    assert call["betas"] == ["server-side-fallback-2026-07-01"]
    with_fallback = AIReservation.objects.get().amount_micros
    settings.AI_SERVER_SIDE_FALLBACK = False
    real_tailor_to_jd(content, "Python")
    assert len(client.messages.calls) == 1 and "fallbacks" not in client.messages.calls[0]
    assert with_fallback == 2 * AIReservation.objects.exclude(amount_micros=with_fallback).get().amount_micros


def test_haiku_never_retries(settings):
    settings.ANTHROPIC_API_KEY = "test-key"; service._client.cache_clear()
    assert service._simple_client().max_retries == 0
```

Also: in `test_ai.py`, `test_views_charge_guests_to_their_own_allowance` (a recording mock for `improve_bullet` sees `visitor_id == guest.pk` for a guest and `None` for `user`); in `test_service_limits.py:25-31` assert `max_retries == 0` and `simple.timeout < 120`; in `test_prod_settings.py`, `AI_DAILY_LIMIT="3"`, `AI_MONTHLY_LIMIT="7"`, `AI_SERVER_SIDE_FALLBACK="False"` read back as `3`, `7`, `False`.

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests -v`
Expected: the new tests fail (no reservation rows, missing classes and kwargs).

- [x] **Step 3: Implement**

- `_simple_client()`: `max_retries=0`; comment why (a retry is a second paid attempt outside its reservation, and 3 x 30 s plus backoff could outlast the load balancer).
- `_FALLBACKS = {"claude-sonnet-5-5": "claude-sonnet-5"}`.
- `_call`, in this order:
```text
1. fallback_on = settings.AI_SERVER_SIDE_FALLBACK and model in _FALLBACKS
   attempts = [Attempt(model, max_tokens)] + ([Attempt(_FALLBACKS[model], max_tokens)] if fallback_on else [])
   bound = input_token_bound(system=..., messages=..., output_config=params["output_config"])
2. reserve(reservation_micros(attempts, bound), feature, model, visitor_id)
     BudgetRefused -> raise AIBudgetRefusedError(scope); DatabaseError -> log, raise AIUnavailableError (nothing sent)
3. call beta (betas=[_FALLBACK_BETA], fallbacks=[{"model": fb, "max_tokens": max_tokens}]) or plain
     on any exception: unbilled -> settle 0 "unbilled"; else settle amount "kept"; raise classified error from exc
4. actual = served_cost_micros(resp, requested_model=model) ("usage"); if that raises, settle the amount "kept"
   settle quietly: a DatabaseError is logged at error level and swallowed (the sweeper charges it later)
   log a warning if any attempt's input_tokens exceeds bound; log feature, model, reserved, actual, how (never text)
5. stop_reason refusal -> AIRefusedError; max_tokens -> AIServiceError (already settled)
```
- Unbilled: status 401, 402, 403, 529; any 429 (plain rate limit or the spend cap: both are rejected before any work is done; shared rule update 2026-11-19 in `portfolio-infra/PLAN.md`; add a test row for a plain 429 with no `error_code`); 400 whose message or body matches `You have reached your specified (?:workspace |organization )?API usage limits` or says the credit balance is too low. The `enforced_spend_limit_reached` code still decides the friendly message, not billing. Provider limit (`AIProviderLimitError`): 402, the 400 usage-limit, the 429 spend limit. Everything else: `AIUnavailableError`. Messages stay generic; the SDK error rides on `__cause__` for the existing logging in `views._ai_error`.
- Update `mock_claude` lambdas in `conftest.py` to accept `**_kw`; add `pytestmark = pytest.mark.django_db` to `test_service_requests.py`; update `test_sonnet_5_5_requests_carry_the_refusal_fallback` to the new `fallbacks` shape.

- [x] **Step 4: Run the tests to see them pass**

Run: `cd server && .venv/bin/python -m pytest apps/ai -v && cd .. && npm run test:server`
Expected: all pass.

- [x] **Step 5: CHANGELOG** under `[Unreleased]`: Security (every Claude call reserves its worst case before it runs and settles from real usage, admins and DEBUG included; Haiku no longer retries automatically); Changed (the refusal fallback can be turned off with `AI_SERVER_SIDE_FALLBACK`, and its second pass has an explicit `max_tokens`; AI call limits come from the environment).

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/ai/service.py server/apps/ai/views.py server/config/settings.py \
  server/apps/ai/tests/fakes.py server/apps/ai/tests/test_service_budget.py \
  server/apps/ai/tests/test_service_requests.py server/apps/ai/tests/test_service_limits.py \
  server/apps/ai/tests/conftest.py server/apps/ai/tests/test_ai.py \
  server/apps/accounts/tests/test_prod_settings.py CHANGELOG.md
git commit -m "feat: reserve and settle every Claude call in the spend ledger"
```

---

### Task 5: Friendly refusals that point at the free path

**Files:**
- Create: `server/apps/ai/refusals.py`
- Modify: `server/apps/ai/views.py:38-86` (`_gate`, `_ai_error`, `_AIView`), `client/src/features/ai/aiError.ts`
- Test: `server/apps/ai/tests/test_refusals.py`, `server/apps/ai/tests/test_ai.py:118-143` (update the masked-message assertions), `client/src/features/ai/aiError.test.ts`

**Interfaces:**
- Consumes: Task 4 error classes; `ledger.live_ai_off()`.
- Produces: `REFUSALS: dict[str, tuple[int, str]]` and `def refusal(code: str, *, headers: dict | None = None) -> Response` (body `{"detail": <copy>, "code": <code>}`). Codes and copy (exact):

  | Code | Status | `detail` |
  |---|---|---|
  | `ai_off` | 503 | "Live AI is off in this demo right now. You can still edit, switch templates, and export your resume as a PDF or Word file." |
  | `ai_daily_used` | 503 | "Today's live AI budget for the demo is used up. You can still edit, switch templates, and export your resume as a PDF or Word file." |
  | `ai_provider_limit` | 503 | same text as `ai_daily_used` |
  | `ai_visitor_used` | 429 | "You've used this demo's live AI allowance. You can still edit, switch templates, and export your resume as a PDF or Word file." |
  | `ai_rate_limited` | 429 | "That's a lot of AI requests in a short time. Please wait a few minutes. You can still edit, switch templates, and export your resume as a PDF or Word file." |
  | `ai_unavailable` | 502 | "The AI service isn't available right now. You can still edit, switch templates, and export your resume as a PDF or Word file." |

- [x] **Step 1: Write the failing tests**

```python
AI_ROUTES = [("improve-bullet", {"text": "Led a team."}), ("generate-summary", {"content": make_content()}),
             ("tailor-jd", {"content": make_content(), "job_description": "Python"}),
             ("cover-letter", {"content": make_content(), "job_description": "Python"}),
             ("ats-check", {"content": make_content()}), ("parse-resume", {"text": "Jordan Rivera, engineer"})]

@pytest.mark.parametrize("route, body", AI_ROUTES)
def test_budget_off_refuses_every_route_with_the_free_path(auth_client, user, settings, route, body):
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    res = auth_client.post(f"/api/ai/{route}", body, format="json")
    assert (res.status_code, res.json()["code"]) == (503, "ai_off")
    user.refresh_from_db()
    assert user.ai_calls_today == 0


@pytest.mark.parametrize("raised, status, code", [
    (AIBudgetRefusedError("daily"), 503, "ai_daily_used"), (AIBudgetRefusedError("visitor"), 429, "ai_visitor_used"),
    (AIProviderLimitError("limit"), 503, "ai_provider_limit"), (AIUnavailableError("down"), 502, "ai_unavailable")])
def test_refusals_are_friendly_in_production(auth_client, settings, monkeypatch, raised, status, code):  # Review Focus 4
    settings.DEBUG = False
    monkeypatch.setattr("apps.ai.service.improve_bullet", Mock(side_effect=raised))
    res = auth_client.post("/api/ai/improve-bullet", {"text": "\U0001d49c" * 2000}, format="json")
    assert (res.status_code, res.json()) == (status, {"detail": REFUSALS[code][1], "code": code})
    assert chr(0x2014) not in res.json()["detail"]  # no em dash


def test_burst_throttle_is_friendly(auth_client, monkeypatch):
    monkeypatch.setattr(SimpleRateThrottle, "THROTTLE_RATES", {**SimpleRateThrottle.THROTTLE_RATES, "ai-burst": "1/hour"})
    cache.clear()
    auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    res = auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()["code"]) == (429, "ai_rate_limited")
    assert "Retry-After" in res.headers


def test_admins_and_debug_still_pay_in_dollars(auth_client, user, settings):
    user.is_admin = True; user.save(); settings.DEBUG = True
    settings.AI_MONTHLY_BUDGET_USD = Decimal("0")
    assert auth_client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json").status_code == 503
```

Client (`aiError.test.ts`): a 503 with `detail` returns the detail; an `ECONNABORTED` returns "That took too long. You can keep editing, switching templates, and exporting, and try the AI again later."; a response with no body returns "Something went wrong with the AI. You can keep editing, switching templates, and exporting."

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/ai/tests/test_refusals.py -v` and `npm run test --prefix client -- aiError`
Expected: FAIL (no `refusals` module; client copy differs).

- [x] **Step 3: Implement**

`_gate` returns `refusal("ai_off")` when `ledger.live_ai_off()`, before touching the per-user counters. `_ai_error` keeps the 422 refusal path and maps `AIBudgetRefusedError` scopes `off`/`daily`/`visitor` to `ai_off`/`ai_daily_used`/`ai_visitor_used`, `AIProviderLimitError` to `ai_provider_limit` (logged at error level: "Anthropic spend limit reached"), and everything else to `ai_unavailable` (under `DEBUG` the `detail` stays `str(exc)` with the same code). `_AIView.handle_exception` turns `Throttled` into `refusal("ai_rate_limited", headers={"Retry-After": str(int(exc.wait or 60))})`. Client `aiErrorMessage` returns `detail` for 429, 502, and 503 and uses the two fallback strings above. Update any spec or test asserting the old strings: `grep -rn "took too long\|temporarily unavailable" client/src client/e2e server/apps`.

- [x] **Step 4: Run the tests to see them pass**

Run: `npm run test:server && npm run test:client && npm run lint && npm run typecheck`
Expected: all pass.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Changed: every AI refusal (budget off, daily budget used, demo allowance used, rate limit, Anthropic spend limit, outage) returns plain copy pointing at editing, templates, and export, with a `code`.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/ai/refusals.py server/apps/ai/views.py server/apps/ai/tests/test_refusals.py \
  server/apps/ai/tests/test_ai.py client/src/features/ai/aiError.ts client/src/features/ai/aiError.test.ts CHANGELOG.md
git commit -m "feat: friendly AI refusals that point at the free path"
```

---

### Task 6: Demo mode closes the account routes; public status flag

**Files:**
- Modify: `server/config/settings.py` (demo block after `:59`; `INSTALLED_APPS` adds `"apps.demo"`), `server/apps/accounts/views.py` (four views), `server/config/urls.py:28-37`
- Create: `server/apps/demo/__init__.py`, `apps.py`, `closed.py`, `urls.py`, `views.py`, `serializers.py`, `tests/__init__.py`, `tests/conftest.py` (autouse `cache.clear()`)
- Test: `server/apps/demo/tests/test_demo_mode.py`, `server/apps/demo/tests/test_status.py`, `server/apps/accounts/tests/test_prod_settings.py`
- Regenerate: `client/openapi.yaml`, `client/src/api/generated/`

**Interfaces:**
- Consumes: `ledger.live_ai_off()`, `ledger.room_today_micros()`, `User.is_guest`, `User.guest_expires_at`.
- Produces:
  - Settings: `DEMO_MODE`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `DEMO_GUEST_TTL_HOURS`, `DEMO_MAX_LIVE_GUESTS`, `DEMO_STARTS_PER_HOUR`, `DEMO_STARTS_PER_DAY` (values in Global Constraints). In production (`DEBUG` off), `DEMO_MODE` with `DJANGO_ADMIN_ENABLED` raises `ImproperlyConfigured`.
  - `class ClosedInDemoModeMixin` (`apps/demo/closed.py`): overrides `initial()` to raise `Http404` when `settings.DEMO_MODE`, before authentication, permissions, and throttles.
  - `GET /api/demo/status`, `operation_id="get_demo_status"`, tag `demo`, `AllowAny`, no authentication; response `DemoStatus {demo_mode: bool, turnstile_site_key: str, ai_available: bool, ai_reason: "ok" | "off" | "daily_used", guest_start_available: bool}`; cached 60 s under cache key `demo-status`; header `Cache-Control: public, max-age=60`. `STATUS_MIN_ROOM_MICROS = 250_000` in `apps/demo/views.py`. `guest_start_available` is `DEMO_MODE and TURNSTILE_SITE_KEY != "" and live guests < DEMO_MAX_LIVE_GUESTS`.
  - Generated client: `useGetDemoStatus`, types `DemoStatus`, `AiReasonEnum` (accept whatever name drf-spectacular emits without a warning).

- [x] **Step 1: Write the failing tests**

```python
CLOSED = ["/api/auth/register", "/api/auth/login", "/api/auth/password-reset", "/api/auth/password-reset/confirm"]

@pytest.mark.django_db
@pytest.mark.parametrize("path", CLOSED)
def test_account_routes_are_404_in_demo_mode(settings, path):
    settings.DEMO_MODE = True
    assert APIClient().post(path, {}, format="json").status_code == 404

@pytest.mark.django_db
@pytest.mark.parametrize("path", CLOSED)
def test_account_routes_still_answer_outside_demo_mode(path):
    assert APIClient().post(path, {}, format="json").status_code in (400, 401)

@pytest.mark.parametrize("path", ["/api/schema/", "/api/schema/swagger-ui/"])
def test_api_docs_are_404_in_demo_mode_even_for_a_guest(settings, guest, path):
    settings.DEMO_MODE = True
    client = APIClient(); client.force_authenticate(guest)
    assert client.get(path).status_code == 404

@pytest.mark.django_db
@pytest.mark.parametrize("method, path, expected", [("post", "/api/auth/refresh", 401),
                                                    ("post", "/api/auth/logout", 204), ("get", "/api/auth/me", 401)])
def test_session_routes_stay_open_in_demo_mode(settings, method, path, expected):
    settings.DEMO_MODE = True
    assert getattr(APIClient(), method)(path).status_code == expected
```

```python
def test_status_is_public_and_describes_the_demo(db, settings):
    settings.DEMO_MODE = True; settings.TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
    res = APIClient().get("/api/demo/status")
    assert res.json() == {"demo_mode": True, "turnstile_site_key": "1x00000000000000000000AA",
                          "ai_available": True, "ai_reason": "ok", "guest_start_available": True}
    assert res.headers["Cache-Control"] == "public, max-age=60"

def test_status_says_live_ai_is_off(db, settings): ...      # AI_MONTHLY_BUDGET_USD=0 -> ai_available False, ai_reason "off"
def test_status_says_todays_budget_is_used(db, at): ...      # Nov 1, reserve 750_001 -> room 249_999 -> "daily_used"
def test_status_is_cached_for_a_minute(db, monkeypatch): ... # two GETs call ledger.room_today_micros once
def test_status_outside_demo_mode_offers_no_guest_start(db): ...  # demo_mode False, guest_start_available False
def test_guest_start_is_unavailable_at_the_live_guest_cap(db, settings, guest): ...  # DEMO_MAX_LIVE_GUESTS=1 -> False; an expired guest does not count
```
In `test_prod_settings.py`: `DEMO_MODE="true", DJANGO_ADMIN_ENABLED="true"` in production fails.

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/demo apps/accounts/tests/test_prod_settings.py -v`
Expected: FAIL (no `apps.demo`, routes answer).

- [x] **Step 3: Implement** the settings block, the mixin on `RegisterView`, `LoginView`, `PasswordResetRequestView`, `PasswordResetConfirmView`, `DemoClosedSchemaView(ClosedInDemoModeMixin, SpectacularAPIView)` and `DemoClosedSwaggerView(ClosedInDemoModeMixin, SpectacularSwaggerView)` in `config/urls.py`, `path("api/demo/", include("apps.demo.urls"))`, and the status view. Both demo views set `authentication_classes = []`, so a stale Bearer can never 401 them and the client interceptors need no change.

- [x] **Step 4: Regenerate the API client and run everything**

Run: `cd client && npm run gen:api && cd .. && server/.venv/bin/python server/manage.py spectacular --validate --fail-on-warn --file /tmp/openapi-check.yaml && npm run test:server && npm run test:client && npm run typecheck`
Expected: all pass; `git status --short client/` shows the regenerated files.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Added: `DEMO_MODE` (register, login, password reset, and the API schema and Swagger pages answer 404; admin can't be enabled with it in production) and `GET /api/demo/status`.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/demo server/apps/accounts/views.py server/config/settings.py server/config/urls.py \
  server/apps/accounts/tests/test_prod_settings.py client/openapi.yaml client/src/api/generated \
  CHANGELOG.md
git commit -m "feat: demo mode closes the account routes and serves a public status flag"
```

---

### Task 7: Guest demos on the server

**Files:**
- Create: `server/apps/demo/turnstile.py`, `throttles.py`, `sample.py`, `messages.py`; `server/apps/accounts/tokens.py`
- Modify: `server/apps/demo/views.py`, `serializers.py`, `urls.py`; `server/apps/accounts/cookies.py:13-23`, `serializers.py:25-48` and `:113-119`, `views.py:305-336`; `server/apps/ai/usage.py:40-104`; `server/apps/ai/views.py:38-48`; `server/config/settings.py` (throttle rates at `:219-225`, `AI_GUEST_CALL_LIMIT`, production Turnstile checks); `server/config/middleware.py:16-28` (CSP); `server/conftest.py:17-21` (new throttle scopes set to `None`)
- Test: `server/apps/demo/tests/test_turnstile.py`, `test_start.py`, `test_sample.py`; `server/apps/accounts/tests/test_account.py`, `test_security.py:36-46`, `test_prod_settings.py`; `server/apps/ai/tests/test_ai.py`
- Regenerate: the API client

**Interfaces:**
- Consumes: Task 6 settings and mixin; `User` guest fields; `UserSerializer`.
- Produces:
  - `apps/demo/turnstile.py`: `ACTION = "start-demo"`, `SITEVERIFY_URL`, `TIMEOUT_SECONDS = 5`, `DUMMY_TOKEN`, `TEST_SITE_KEYS`, `TEST_SECRETS`, `class Verdict(StrEnum): PASSED, FAILED, UNAVAILABLE`, `def verify(token: str, remote_ip: str | None) -> Verdict`.
  - `apps/demo/throttles.py`: `DemoStartHourThrottle` (scope `demo-start-hour`) and `DemoStartDayThrottle` (scope `demo-start-day`), `SimpleRateThrottle` subclasses whose cache key is always the client IP from `get_ident` (`NUM_PROXIES=1`). Rates in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`: `f"{DEMO_STARTS_PER_HOUR}/hour"`, `f"{DEMO_STARTS_PER_DAY}/day"`.
  - `apps/demo/sample.py`: `SAMPLE_TITLE: str`, `SAMPLE_CONTENT: dict`.
  - `apps/demo/messages.py`: start refusal copy (below).
  - `POST /api/demo/start`, `operation_id="start_demo"`, request `GuestStartRequest {turnstile_token: str (max 2048)}`, 201 response `GuestStartResponse {user: User, access: str, resume_id: uuid}` plus the refresh cookie. Generated hook `useStartDemo`.
  - `apps/accounts/tokens.py`: `def issue_refresh(user) -> RefreshToken` (guests: exp capped at `guest_expires_at`, outstanding row written with that exp); `def refresh_cookie_max_age(user) -> int` (guests: whole seconds until `guest_expires_at`; others: 7 days).
  - `set_refresh_cookie(response, token: str, *, max_age: int | None = None)`.
  - `UserSerializer` adds read-only `is_guest`. `DeleteAccountSerializer.password` becomes optional; a guest needs none, an account still needs the right one.
  - `usage.reserve`: guests are capped at `AI_GUEST_CALL_LIMIT` lifetime calls (no daily or 30-day reset, no admin or DEBUG bypass) and raise `AIRateLimitError(..., scope="guest")`; `_gate` turns that into `refusal("ai_visitor_used")`.
  - CSP: `script-src 'self' https://challenges.cloudflare.com` and a new `frame-src https://challenges.cloudflare.com`.
  - Start refusal copy (`{"detail", "code"}`): `bot_check_failed` 403 "We couldn't confirm you're a person. Please try the check again."; `bot_check_unavailable` 503 "The bot check isn't available right now, so new demos can't start. The screenshots on this page show what the app does."; `demo_full` 503 "The demo is full right now. The screenshots on this page show what the app does. Please check back later."; `demo_rate_limited` 429 "A lot of demos have started from your network recently. Please try again later. The screenshots on this page show what the app does."

- [x] **Step 1: Write the failing tests**

```python
# test_turnstile.py
PASS, FAIL = "1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA"

def test_test_secrets_answer_without_a_network_call(settings, monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=AssertionError("no network")))
    settings.TURNSTILE_SECRET_KEY = PASS
    assert verify("XXXX.DUMMY.TOKEN.XXXX", None) is Verdict.PASSED
    assert verify("other", None) is Verdict.FAILED
    settings.TURNSTILE_SECRET_KEY = FAIL
    assert verify("XXXX.DUMMY.TOKEN.XXXX", None) is Verdict.FAILED

@pytest.mark.parametrize("body, expected", [
    ({"success": True, "hostname": "resumeiq.jameslittlefield.net", "action": "start-demo"}, Verdict.PASSED),
    ({"success": True, "hostname": "evil.example", "action": "start-demo"}, Verdict.FAILED),
    ({"success": True, "hostname": "resumeiq.jameslittlefield.net", "action": "other"}, Verdict.FAILED),
    ({"success": False, "error-codes": ["invalid-input-response"]}, Verdict.FAILED),
    ({"success": False, "error-codes": ["internal-error"]}, Verdict.UNAVAILABLE),
    ({"success": False, "error-codes": ["invalid-input-secret"]}, Verdict.UNAVAILABLE)])
def test_siteverify_answers(settings, siteverify, body, expected):  # siteverify fixture fakes urlopen with this JSON
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"; settings.ALLOWED_HOSTS = ["resumeiq.jameslittlefield.net"]
    assert verify("token", "203.0.113.7") is expected

def test_siteverify_timeout_is_unavailable(settings, monkeypatch):  # Review Focus 5
    settings.TURNSTILE_SECRET_KEY = "0x-real-secret"
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=TimeoutError()))
    assert verify("token", None) is Verdict.UNAVAILABLE

def test_an_empty_token_fails_without_a_request(settings, monkeypatch): ...  # Verdict.FAILED, urlopen not called
```

```python
# test_start.py  (settings.DEMO_MODE = True and TURNSTILE keys set by an autouse fixture)
START = "/api/demo/start"

def test_start_is_404_outside_demo_mode(settings): ...
def test_start_creates_a_guest_with_the_sample_resume(client, monkeypatch):
    monkeypatch.setattr("apps.demo.views.turnstile.verify", lambda token, ip: Verdict.PASSED)
    res = client.post(START, {"turnstile_token": "t"}, format="json")
    assert res.status_code == 201
    guest = User.objects.get(pk=res.json()["user"]["id"])
    assert guest.is_guest and guest.email.endswith("@demo.invalid") and not guest.has_usable_password()
    assert res.json()["user"]["is_guest"] is True
    resume = Resume.objects.get(pk=res.json()["resume_id"], user=guest)
    assert (resume.title, resume.content) == (SAMPLE_TITLE, SAMPLE_CONTENT)
    assert abs(int(res.cookies["refresh_token"]["max-age"]) - 86_400) <= 5
    exp = RefreshToken(res.cookies["refresh_token"].value)["exp"]
    assert exp <= guest.guest_expires_at.timestamp() + 1
def test_start_when_the_bot_check_fails(client, monkeypatch): ...         # 403, code bot_check_failed, no user created
def test_start_when_the_bot_check_is_unavailable(client, monkeypatch): ...  # Review Focus 5: 503, bot_check_unavailable
def test_start_when_the_demo_is_full(client, settings, guest): ...          # DEMO_MAX_LIVE_GUESTS=1 -> 503 demo_full, verify not called
def test_start_is_limited_per_ip(client, monkeypatch): ...                  # demo-start-hour "2/hour" -> third is 429 demo_rate_limited
```
- `test_sample.py`: `ResumeContentSerializer(data=SAMPLE_CONTENT).is_valid()` is `True`; `chr(0x2014) not in json.dumps(SAMPLE_CONTENT)` (no em dash); the email ends with `@example.com` and the phone starts with `555-01`.
- `test_account.py`: a guest posting `{}` to `/api/auth/delete-account` gets 204, is gone, and the cookie is cleared; an account posting `{}` gets 400 with a `password` error (existing wrong-password tests still pass).
- `test_ai.py`: a guest with `ai_calls_this_month = AI_GUEST_CALL_LIMIT` gets 429 `ai_visitor_used` even with `last_ai_call_date` yesterday and `DEBUG=True`.
- `test_security.py`: the CSP contains `script-src 'self' https://challenges.cloudflare.com` and `frame-src https://challenges.cloudflare.com`.
- `test_prod_settings.py`: production with `DEMO_MODE=true` and no Turnstile keys fails; with test keys and `ALLOWED_HOSTS=resumeiq.jameslittlefield.net` fails; with test keys and `ALLOWED_HOSTS=localhost,127.0.0.1` imports.

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/demo apps/accounts apps/ai -v`
Expected: the new tests fail.

- [x] **Step 3: Implement**

- `turnstile.verify`: follow `open-door/apps/api/app/modules/sandbox/turnstile.py:33-138` (codes, the test-secret branch, fail-closed rules), with stdlib `urllib.request.urlopen` (POST form `secret`, `response`, `remoteip`, `idempotency_key`; `timeout=5`). Expected hostnames are `ALLOWED_HOSTS` entries that are neither `*` nor start with `.`. Never log the token or secret.
- Start view order: 404 unless `DEMO_MODE`; validate; live-guest cap (503 `demo_full`); `verify(token, remote_ip=<throttle get_ident>)`; then in one `transaction.atomic()` create the guest (`create_user(email=f"guest-{uuid4().hex}@demo.invalid", name="Demo guest", password=None, is_guest=True, guest_expires_at=now + TTL)`) and the sample résumé (`template="classic"`); then `issue_refresh`, respond 201, set the cookie with `max_age=refresh_cookie_max_age(guest)`. `handle_exception` turns `Throttled` into `demo_rate_limited` with `Retry-After`. Log one line per start with the guest id, never the IP or token.
- `SAMPLE_CONTENT`: a fictional "Riley Chen, Senior Software Engineer" with every `personalInfo` field filled (email `riley.chen@example.com`, phone `555-0142`, `https://` LinkedIn and GitHub URLs on `example.com` paths are fine), a summary, three jobs with three or four metric bullets each, one degree, about ten skills, two projects; American English, no em dashes; title `SAMPLE_TITLE = "Sample resume: Riley Chen"`.

- [x] **Step 4: Regenerate the API client and run everything**

Run: `cd client && npm run gen:api && cd .. && server/.venv/bin/python server/manage.py spectacular --validate --fail-on-warn --file /tmp/openapi-check.yaml && npm run test:server && npm run test:client && npm run typecheck`
Expected: all pass. (The client's `DeleteAccountDialog` keeps requiring a password through its own Zod schema.)

- [x] **Step 5: CHANGELOG** under `[Unreleased]`: Added (guest demos behind Cloudflare Turnstile and per-IP limits, a sample résumé, a live-guest cap, password-free "end my demo" for guests, a lifetime AI call cap per guest); Security (CSP allows only `challenges.cloudflare.com` for the bot check).

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/demo server/apps/accounts server/apps/ai/usage.py server/apps/ai/views.py \
  server/apps/ai/tests/test_ai.py server/config/settings.py server/config/middleware.py server/conftest.py \
  client/openapi.yaml client/src/api/generated CHANGELOG.md
git commit -m "feat: start guest demos behind Turnstile with a sample resume"
```

---

### Task 8: Sessions that survive two tabs and an expired guest

**Files:**
- Create: `server/apps/accounts/refresh.py`
- Modify: `server/apps/accounts/views.py:113-145` (`CookieTokenRefreshView`), `server/config/settings.py` (`REFRESH_REUSE_GRACE_SECONDS`), `server/apps/ai/usage.py:107-143` (`refund`, `record_usage`), `server/apps/ai/views.py` (`_gate` handles a vanished user)
- Test: `server/apps/accounts/tests/test_refresh.py`, `server/apps/ai/tests/test_ai.py`, `server/apps/demo/tests/test_client_ip.py`

**Interfaces:**
- Consumes: `issue_refresh`, `refresh_cookie_max_age`, `set_refresh_cookie`, `clear_refresh_cookie`; the database cache.
- Produces:
  - `class SessionEnded(Exception)`; `@dataclass(frozen=True) class Refreshed: access: str; refresh: str | None; cookie_max_age: int | None`; `def refresh_session(raw: str) -> Refreshed`.
  - Refresh responses: 401 `{"detail": "No refresh token.", "code": "no_session"}` without a cookie; 401 `{"detail": "Your session ended.", "code": "session_ended"}` with the cookie cleared when it can't be used; 200 `{"access"}` (with a rotated cookie, or with no `Set-Cookie` on the grace path).
  - Cache key `refresh-successor:<old jti>` holding the new jti for `REFRESH_REUSE_GRACE_SECONDS`.

- [x] **Step 1: Write the failing tests**

Local fixtures in `test_refresh.py`: `signed_in_client` (an `APIClient` whose `refresh_token` cookie comes from `issue_refresh(user)`, for the existing `user` account) and `guest_cookie_client` (the same for `guest`).

```python
def _rotate(client):  # returns the old and new cookie values
    old = client.cookies["refresh_token"].value
    res = client.post(REFRESH); assert res.status_code == 200
    return old, res.cookies["refresh_token"].value

def test_refresh_for_a_deleted_user_is_session_ended(signed_in_client, user):   # was a 500 (DoesNotExist)
    user.delete()
    res = signed_in_client.post(REFRESH)
    assert (res.status_code, res.json()["code"]) == (401, "session_ended")
    assert res.cookies["refresh_token"].value == ""

def test_refresh_without_a_cookie_is_no_session(client): ...       # 401, code no_session
def test_an_expired_refresh_token_is_session_ended(...): ...      # token with exp in the past

def test_a_just_rotated_token_still_works_inside_the_grace_window(signed_in_client):
    old, _new = _rotate(signed_in_client)
    signed_in_client.cookies["refresh_token"] = old
    res = signed_in_client.post(REFRESH)
    assert res.status_code == 200 and "access" in res.json()
    assert "refresh_token" not in res.cookies

def test_grace_ends_after_the_window(signed_in_client, settings): ...   # REFRESH_REUSE_GRACE_SECONDS=0 -> session_ended
def test_grace_never_outlives_a_logout(signed_in_client): ...          # rotate, logout with the new cookie, reuse old -> 401
def test_grace_follows_a_second_rotation(signed_in_client): ...        # old -> new -> newer; old still gets 200
def test_a_guest_rotation_never_outlives_the_guest(guest_cookie_client, guest): ...
    # guest_expires_at = now + 2 h; rotated token exp <= guest_expires_at; cookie max-age <= 7200
```

```python
@pytest.mark.django_db(transaction=True)  # FK checks are deferred to commit; only autocommit shows the real error
def test_guest_removed_during_an_ai_call_gets_no_500(guest, monkeypatch):
    client = APIClient(); client.force_authenticate(guest)
    def improve(text, role="", **_):
        User.objects.filter(pk=guest.pk).delete(); return "Better."
    monkeypatch.setattr("apps.ai.service.improve_bullet", improve)
    res = client.post("/api/ai/improve-bullet", {"text": "Led a team."}, format="json")
    assert (res.status_code, res.json()["suggestion"]) == (200, "Better.")
    assert not AIUsageLog.objects.exists()
```

```python
def _key(xff):
    req = Request(APIRequestFactory().post("/api/demo/start", HTTP_X_FORWARDED_FOR=xff, REMOTE_ADDR="10.0.0.5"))
    return DemoStartHourThrottle().get_cache_key(req, None)

def test_a_forged_leftmost_forwarded_for_does_not_change_the_rate_limit_key():
    assert _key("6.6.6.6, 203.0.113.7") == _key("7.7.7.7, 8.8.8.8, 203.0.113.7") != _key("6.6.6.6, 203.0.113.8")

def test_rotating_the_forged_entry_does_not_dodge_the_start_limit(settings, monkeypatch): ...
    # demo-start-hour "3/hour"; four POSTs with leftmost 1.1.1.1..4.4.4.4 and rightmost 203.0.113.7 -> fourth is 429
```

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/accounts/tests/test_refresh.py apps/demo/tests/test_client_ip.py apps/ai/tests/test_ai.py -v`
Expected: the deleted-user test errors with `DoesNotExist` (today's 500); the grace tests get 401; the AI test raises `IntegrityError`.

- [x] **Step 3: Implement**

```text
refresh_session(raw):
  try: token = RefreshToken(raw)                    # signature, expiry, blacklist
  except TokenError: return _grace(raw)
  user = User.filter(pk=token[USER_ID_CLAIM], is_active=True).first() or raise SessionEnded
  old_jti = token["jti"]; token.blacklist()
  token.set_jti(); token.set_exp(lifetime=<7 days, or until guest_expires_at for a guest>); token.set_iat(); token.outstand()
  cache.set(f"refresh-successor:{old_jti}", token["jti"], REFRESH_REUSE_GRACE_SECONDS)
  return Refreshed(str(token.access_token), str(token), refresh_cookie_max_age(user))

_grace(raw):
  payload = token_backend.decode(raw, verify=True)   # TokenBackendError -> SessionEnded; must be a refresh token
  jti = payload["jti"]
  up to 5 times: jti = cache.get(f"refresh-successor:{jti}") or raise SessionEnded
                 live = OutstandingToken(jti=jti, expires_at > now, not blacklisted)
                 if live: its user must exist and be active, else SessionEnded
                          return Refreshed(str(AccessToken.for_user(live.user)), None, None)
  raise SessionEnded
```
`record_usage` wraps its insert in `transaction.atomic()` and logs and swallows `IntegrityError`; `refund` and `reserve` treat `User.DoesNotExist` on `refresh_from_db` as "nothing to do"; `_gate` answers 401 `session_ended` if the user vanished before the call. Update `CLAUDE.md:134-135` later (Task 16).

- [x] **Step 4: Run the tests to see them pass**

Run: `npm run test:server`
Expected: all pass, including the existing `test_auth.py` rotation tests.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Fixed: refreshing a removed user's session answers 401 instead of a 500; two tabs restoring at once no longer sign the visitor out (30-second reuse grace); an AI call whose guest is removed mid-call no longer fails with a 500. Security: a forged leftmost `X-Forwarded-For` can't change a rate-limit key (test).

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/accounts/refresh.py server/apps/accounts/views.py server/config/settings.py \
  server/apps/ai/usage.py server/apps/ai/views.py server/apps/accounts/tests/test_refresh.py \
  server/apps/ai/tests/test_ai.py server/apps/demo/tests/test_client_ip.py CHANGELOG.md
git commit -m "fix: keep sessions alive across tabs and end removed guests cleanly"
```

---

### Task 9: Hourly cleanup command

**Files:**
- Create: `server/apps/demo/management/__init__.py`, `server/apps/demo/management/commands/__init__.py`, `server/apps/demo/management/commands/cleanup_demo.py`
- Modify: `docker-entrypoint.sh:4-7` (comment only)
- Test: `server/apps/demo/tests/test_cleanup.py`

**Interfaces:**
- Consumes: `ledger.sweep_stale`, `ledger.prune_settled`, SimpleJWT `flushexpiredtokens`.
- Produces: `python manage.py cleanup_demo [--batch-size N]` (default 100). Prints exactly one line: `cleanup_demo: guests_deleted=<n> reservations_swept=<n> reservations_pruned=<n>`. Any error propagates (non-zero exit, so Phase 2's failed-task alarm fires).

- [x] **Step 1: Write the failing tests**

```python
def test_cleanup_removes_expired_guests_and_their_data(guest, user):   # user = an account
    stale = make_guest(expires=timezone.now() - timedelta(minutes=1))
    Resume.objects.create(user=stale, title="x", content=SAMPLE_CONTENT)
    out = StringIO(); call_command("cleanup_demo", stdout=out)
    assert not User.objects.filter(pk=stale.pk).exists() and not Resume.objects.filter(user_id=stale.pk).exists()
    assert User.objects.filter(pk__in=[guest.pk, user.pk]).count() == 2
    assert out.getvalue().strip() == "cleanup_demo: guests_deleted=1 reservations_swept=0 reservations_pruned=0"

def test_cleanup_sweeps_stale_reservations(at): ...              # a reservation 11 minutes old -> reservations_swept=1
def test_cleanup_flushes_expired_refresh_tokens(user): ...       # expired OutstandingToken gone, live one kept
def test_cleanup_prunes_settled_reservations_after_35_days(at): ...
def test_cleanup_works_in_batches(): ...                         # --batch-size 2 with 5 expired guests -> all 5 deleted
def test_a_second_run_finds_nothing(): ...                       # guests_deleted=0
```

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/demo/tests/test_cleanup.py -v`
Expected: FAIL, `Unknown command: 'cleanup_demo'`.

- [x] **Step 3: Implement** the command: expired guests (`is_guest=True, guest_expires_at__lte=now`) deleted in batches of primary keys (cascades remove résumés, versions, cover letters, usage logs); `sweep_stale(older_than=timedelta(minutes=settings.AI_STALE_RESERVATION_MINUTES))`; `call_command("flushexpiredtokens")`; `prune_settled(older_than=timedelta(days=35))`. Rewrite the entrypoint comment: production sets `RUN_MIGRATIONS=0` on the service, the one-off migrate task, and the hourly cleanup task (see `docs/DEPLOYMENT.md`); local compose relies on the default.

- [x] **Step 4: Run the tests to see them pass**

Run: `cd server && .venv/bin/python -m pytest apps/demo -v`
Expected: all pass.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Added: `manage.py cleanup_demo`, the hourly job.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/demo/management server/apps/demo/tests/test_cleanup.py docker-entrypoint.sh CHANGELOG.md
git commit -m "feat: add the hourly cleanup_demo command"
```

---

### Task 10: Per-guest caps so one guest can't fill the disk

**Files:**
- Create: `server/apps/demo/quotas.py`
- Modify: `server/config/settings.py` (three `DEMO_GUEST_MAX_*` settings), `server/apps/resumes/views.py:68-101` (`perform_create`, `perform_update`, `duplicate`), `:130-141` (`CoverLetterViewSet.perform_create`), `:196-208` (`ResumeVersionViewSet.create`), `server/apps/resumes/serializers.py:124-148` (`ResumeSerializer.validate_content`); client `src/features/editor/useAutosave.ts`, `src/features/editor/components/SaveIndicator.tsx`, `src/features/editor/EditorTopBar.tsx` (pass the detail), `src/features/dashboard/DashboardPage.tsx:42-63`
- Test: `server/apps/demo/tests/test_quotas.py`; `client/src/features/editor/components/SaveIndicator.test.tsx` (new), `client/src/features/dashboard/DashboardPage.test.tsx` (new)

**Interfaces:**
- Consumes: `User.is_guest`.
- Produces: `class DemoLimitReached(APIException)` (status 400, body `{"detail": <copy>, "code": "demo_limit"}`); `def guest_storage_bytes(user_id: int) -> int` (sum of `pg_column_size` over résumé and version `content` and cover-letter `body` and `job_description`); `def check_guest_write(user, *, adding_resume: bool = False) -> None` (no-op for accounts). Copy: résumé count "This demo can hold up to 20 resumes. Delete one to make room."; storage "This demo has reached its storage limit. Delete a resume or some saved versions to keep editing."; content size (a `content` field error) "This resume is larger than the demo allows. Remove some text to keep saving." Client: `useAutosave` returns `errorDetail: string | null`; `SaveIndicator` takes an optional `detail` and shows it in place of "Couldn't save".

- [x] **Step 1: Write the failing tests**

```python
def test_a_guest_can_hold_twenty_resumes(guest_client, guest, settings):
    for i in range(20):
        Resume.objects.create(user=guest, title=f"r{i}", content=SAMPLE_CONTENT)
    res = guest_client.post("/api/resumes/", {"title": "one more", "template": "classic", "content": SAMPLE_CONTENT}, format="json")
    assert (res.status_code, res.json()["code"]) == (400, "demo_limit")
    first = Resume.objects.filter(user=guest).first()
    assert guest_client.post(f"/api/resumes/{first.pk}/duplicate/").status_code == 400

def test_accounts_have_no_guest_caps(auth_client, user): ...       # 21st résumé for an account is 201
def test_oversized_content_is_refused_for_guests(guest_client, settings): ...  # DEMO_GUEST_MAX_CONTENT_BYTES=1000 -> 400 on "content"
def test_the_storage_budget_stops_updates_versions_and_letters(guest_client, guest, settings): ...
    # DEMO_GUEST_MAX_STORAGE_BYTES=1 with one résumé -> PATCH, POST /api/resume-versions/, POST /api/cover-letters/ all 400 demo_limit
def test_storage_counts_resumes_versions_and_letters(guest): ...   # guest_storage_bytes grows after each kind is added
```
Client: `SaveIndicator` with `status="error"` and `detail="This demo has reached its storage limit. ..."` renders the detail; `DashboardPage` shows a `role="alert"` with the server `detail` when "New resume" gets a 400 (mock `useCreateResume`).

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/demo/tests/test_quotas.py -v` and `npm run test --prefix client -- SaveIndicator DashboardPage`
Expected: FAIL.

- [x] **Step 3: Implement.** Call `check_guest_write(request.user, adding_resume=True)` in `perform_create` and `duplicate`; `check_guest_write(request.user)` before `perform_update`'s transaction, before a manual version `snapshot`, and in the cover letter `perform_create`. Content size: `len(json.dumps(value, ensure_ascii=False).encode())` against the setting, guests only. Dashboard: wrap `handleCreate` and `handleDuplicate` in try/catch and show `fieldErrors(err).detail ?? "We couldn't create a resume. Please try again."`.

- [x] **Step 4: Run the tests to see them pass**

Run: `npm run test:server && npm run test:client && npm run lint && npm run typecheck`
Expected: all pass.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Added: per-guest limits (20 résumés, 64 KB per résumé, 5 MiB in total), shown in the editor's save status and on the dashboard.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/apps/demo/quotas.py server/apps/demo/tests/test_quotas.py server/config/settings.py \
  server/apps/resumes/views.py server/apps/resumes/serializers.py \
  client/src/features/editor client/src/features/dashboard/DashboardPage.tsx \
  client/src/features/dashboard/DashboardPage.test.tsx CHANGELOG.md
git commit -m "feat: cap what one demo guest can store"
```

---

### Task 11: Demo mode in the client

**Files:**
- Create: `client/src/features/demo/useDemoStatus.ts`, `turnstile.ts`, `turnstile.test.ts`, `StartDemoButton.tsx`, `StartDemoButton.test.tsx`, `EndDemoDialog.tsx`, `EndDemoDialog.test.tsx`, `DemoNotices.tsx`, `Screenshots.tsx`, `screenshots.ts`; `client/src/features/marketing/LandingPage.test.tsx`; `client/src/App.test.tsx`
- Modify: `client/src/App.tsx:50-71`, `client/src/routes/guards.tsx:16-20` (+ `guards.test.tsx`), `client/src/stores/auth.ts` (+ test), `client/src/features/auth/bootstrap.ts:21-30` (+ test), `client/src/api/interceptors.ts:10-21` (+ test), `client/src/features/marketing/LandingPage.tsx`, `client/src/components/layout/AppHeader.tsx:45-78`, `client/src/features/ai/AiMenu.tsx:35-42`, `client/src/features/dashboard/DashboardPage.tsx:49`, `client/src/features/dashboard/ImportResumeModal.tsx`

**Interfaces:**
- Consumes: `useGetDemoStatus`, `useStartDemo`, `useDeleteAccount` (generated); `User.is_guest`; refresh `code` values from Task 8.
- Produces:
  - `useDemoStatus(): { status: DemoStatus | undefined; isLoading: boolean; demoMode: boolean }` (`demoMode` is `true` when the server says so or when the request fails: fail closed). `staleTime: 60_000`.
  - Auth store: `sessionEnded: boolean`; `logout(options?: { sessionEnded?: boolean })`; `clearSessionEnded(): void`.
  - `turnstile.ts`: `TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"`, `loadTurnstile(): Promise<TurnstileApi>`, `getTurnstileToken(container: HTMLElement, siteKey: string): Promise<string>` (action `start-demo`, `execution: "execute"`, `appearance: "interaction-only"`, 10 s script and 120 s token timeouts; modeled on `open-door/apps/web/src/lib/turnstile.ts`, which also documents why the script loads on click). One widget per start, removed when it answers.
  - `<StartDemoButton status={DemoStatus} />`, `<EndDemoDialog open onOpenChange />`, `<DemoNotices status={DemoStatus} />`, `<Screenshots />` (renders nothing while `SCREENSHOTS` is empty), `SCREENSHOTS: { src: string; alt: string; caption: string }[]` (empty until Task 12).
  - `AccountsOnlyRoute` in `guards.tsx` (splash while loading, `/` in demo mode, `<Outlet />` otherwise) wrapping `/login`, `/register`, `/forgot-password`, `/reset-password`, `/account`. `ProtectedRoute` sends the unauthenticated to `/` in demo mode and `/login` otherwise.
- Copy (exact):
  - CTA "Try the live demo"; under it "No sign-up. Your demo resumes are deleted after 24 hours. Please don't upload a real resume."
  - Demo ended (role `status`): "Your demo ended. Demos last 24 hours. You can start a new one anytime."
  - AI unavailable (role `status`, when `ai_available` is false): "Today's live AI budget is used up. The editor, templates, and PDF and Word export still work, and the screenshots below show the AI features."
  - Demo full (CTA disabled): "The demo is full right now. The screenshots below show what it does. Please check back later."
  - Bot check could not load: "The bot check couldn't load. Please try again, or look at the screenshots below."
  - Server errors from start: show the response `detail`.
  - Guest menu: label "Demo guest"; item "Sign out and end demo". Dialog title "End your demo?", body "Signing out ends this demo and deletes its resumes right away. You can start a new demo from the home page anytime.", buttons "End demo" (destructive) and "Keep working"; error "We couldn't end your demo. Please try again."
  - Import modal, guests: "Please don't upload a real resume."

- [x] **Step 1: Write the failing tests** (mock `@/features/demo/useDemoStatus` and the generated hooks with `vi.mock`)

```tsx
// guards.test.tsx
it("ProtectedRoute sends the unauthenticated to the landing page in demo mode", () => {
  mockDemo({ demoMode: true }); useAuthStore.setState({ status: "unauthenticated" });
  renderAt("/dashboard");
  expect(screen.getByText("LANDING")).toBeInTheDocument();
});
it("ProtectedRoute keeps /login outside demo mode", ...);

// App.test.tsx
it.each(["/login", "/register", "/forgot-password", "/reset-password", "/account"])(
  "%s redirects to the landing page in demo mode", async (path) => { /* render <App/> at path; expect the h1 */ });

// LandingPage.test.tsx
it("demo mode offers the live demo, the notice, and no sign-in", () => {
  renderLanding({ demo_mode: true, ai_available: true, ai_reason: "ok", guest_start_available: true, turnstile_site_key: "1x00000000000000000000AA" });
  expect(screen.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
  expect(screen.getByText(/Please don't upload a real resume\./)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
});
it("says when today's live AI budget is used, before any bot check", ...);  // ai_available false -> notice; no Turnstile script requested
it("disables the start when the demo is full", ...);
it("shows the demo-ended notice after a session ends", ...);                 // useAuthStore.setState({ sessionEnded: true })
it("keeps today's landing outside demo mode", ...);                          // Sign in and Build my resume links

// StartDemoButton.test.tsx
it("starts a guest and opens the sample resume", async () => {
  // getTurnstileToken resolves "XXXX.DUMMY.TOKEN.XXXX"; useStartDemo resolves { user, access, resume_id: "r1" }
  // click -> mutate called with { data: { turnstile_token: "XXXX.DUMMY.TOKEN.XXXX" } }; navigate("/resumes/r1"); store authenticated
});
it("shows the server's words when the start is refused", ...);   // 429 detail rendered in role="alert"
it("explains when the bot check can't load", ...);

// AppHeader.test.tsx / EndDemoDialog.test.tsx
it("a guest sees Demo guest, not the synthetic email, and no Account item", ...);
it("ending the demo deletes it without a password, then signs out", ...);  // mutateAsync({ data: {} })

// bootstrap.test.ts / interceptors.test.ts / auth.test.ts
it("a refused cookie at load marks the session ended", ...);    // 401 { code: "session_ended" } -> sessionEnded true
it("no cookie at load is a quiet sign-out", ...);               // 401 { code: "no_session" } -> sessionEnded false
it("a failed refresh mid-session marks the session ended", ...);
```
Also: the usage pill and the AI menu's usage line are absent for a guest; `DashboardPage` creates a guest's blank résumé with `personalInfo: { name: "", email: "" }`; `ImportResumeModal` shows the notice for a guest.

- [x] **Step 2: Run them to see them fail**

Run: `npm run test:client`
Expected: the new tests fail.

- [x] **Step 3: Implement** to `docs/DESIGN.md`: tokens only, the accent reserved for the one primary CTA ("Try the live demo"), notices as `role="status"`, errors as `role="alert"`, every page still inside `<main id="main">`. The Turnstile widget renders in a slot under the CTA. Starting a demo calls `clearSessionEnded()`.

- [x] **Step 4: Run everything**

Run: `npm run test:client && npm run lint && npm run typecheck && npm run build && npm run test:e2e`
Expected: all pass; the existing e2e suite (accounts mode) is unchanged.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Added: the demo landing (one-click live demo behind the bot check, budget and demo-full notices, the demo-ended notice), "Demo guest" in the header, and "Sign out and end demo". Changed: in demo mode the account pages redirect home.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add client/src CHANGELOG.md
git commit -m "feat: demo mode in the client with a one-click guest start"
```

---

### Task 12: End-to-end demo suite and landing screenshots

**Files:**
- Modify: `client/playwright.config.ts`, `client/e2e/support/env.ts`, `client/e2e/support/fixtures.ts`, `client/package.json` (script `"screenshots": "SCREENSHOTS=1 playwright test --project=screenshots"`), `client/src/features/demo/screenshots.ts`
- Create: `client/e2e/support/turnstileMock.ts`, `client/e2e/server/expire_guests.py`, `client/e2e/demo/start.spec.ts`, `client/e2e/demo/sessions.spec.ts`, `client/e2e/demo/refusals.spec.ts`, `client/e2e/demo/end.spec.ts`, `client/e2e/screenshots/landing.spec.ts`, `client/src/features/marketing/screenshots/{editor,templates,tailor}.jpg`

**Interfaces:**
- Consumes: Tasks 7 to 11.
- Produces:
  - `env.ts`: `DEMO_API_PORT = 8013`, `DEMO_CLIENT_PORT = 5182`, `DEMO_CLIENT_URL`, `DJANGO_DEMO_ENV` (= `DJANGO_ENV` plus `DEMO_MODE: "True"`, `TURNSTILE_SITE_KEY: "1x00000000000000000000AA"`, `TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA"`, `CLIENT_URL: DEMO_CLIENT_URL`, `E2E_DATABASE_URL` ending `/resume_builder_e2e_demo`).
  - Config: two more `webServer` entries (Django on 8013 running `ensure_db.py`, `migrate`, `runserver`; Vite on 5182 with `VITE_API_TARGET` 8013); projects `demo-chromium` and `demo-webkit` (`testMatch: /demo\/.*\.spec\.ts/`, `baseURL: DEMO_CLIENT_URL`); existing projects add `testIgnore` for `demo/` and `screenshots/`; a `screenshots` project only when `process.env.SCREENSHOTS === "1"` (Chromium, 1280 x 800, light theme).
  - `turnstileMock.ts`: `mockTurnstile(page)` fulfills `https://challenges.cloudflare.com/**` with a script defining `window.turnstile` whose `execute` calls the rendered widget's `callback("XXXX.DUMMY.TOKEN.XXXX")`.
  - `fixtures.ts`: `installMocks(page)` (AI plus Turnstile; the `page` fixture uses it), `startDemo(page): Promise<string>` (goes to `/`, clicks "Try the live demo", waits for `/resumes/<id>`, returns the id), `expireGuests()` (runs `expire_guests.py` with `DJANGO_DEMO_ENV`).
  - `expire_guests.py`: sets every guest's `guest_expires_at` to now and runs `call_command("cleanup_demo")`.

- [x] **Step 1: Write the specs**

```ts
// demo/start.spec.ts
test("one click starts a guest on the sample resume", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);
  await startDemo(page);
  await expect(page.getByText("Riley Chen").first()).toBeVisible();
  await expectAccessible(page);
});
test("account pages are closed in demo mode", async ({ page }) => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
});

// demo/sessions.spec.ts
test("two tabs reloading together both stay in the demo", async ({ page, context }) => {
  await startDemo(page);
  const second = await context.newPage(); await installMocks(second); await second.goto(page.url());
  await Promise.all([page.reload(), second.reload()]);
  for (const p of [page, second]) await expect(p).toHaveURL(/\/resumes\//);
});
test("an ended demo shows the notice, not an error", async ({ page }) => {
  await startDemo(page); expireGuests(); await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Your demo ended." })).toBeVisible();
});
test("autosave after the demo ends lands on the ended notice", async ({ page }) => {  // Review Focus 1
  await startDemo(page); expireGuests();
  await page.getByLabel("Summary").fill("Changed after the demo ended.");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("status").filter({ hasText: "Your demo ended." })).toBeVisible();
});

// demo/refusals.spec.ts
test("the landing says when today's live AI budget is used", ...);   // route /api/demo/status -> ai_available false
test("an AI refusal shows the free-path copy", ...);                   // route /api/ai/generate-summary -> 503 ai_daily_used body

// demo/end.spec.ts
test("sign out and end demo removes the demo", ...);                   // menu -> dialog -> End demo -> "/"; /dashboard -> "/"
```
Use the editor's real labels (check `SummarySection.tsx`); keep the axe scans in light and dark through `expectAccessible`.

- [x] **Step 2: Run the demo specs**

Run: `docker compose up -d && npm run test:e2e -- --project=demo-chromium --project=demo-webkit`
Expected: all pass. If a spec fails, fix the app, not the assertion, unless the copy changed on purpose.

- [x] **Step 3: Capture the landing screenshots**

`e2e/screenshots/landing.spec.ts` starts a demo and saves JPEG (quality 80) shots of the editor with the live preview, the open template gallery, and the tailoring modal with the mocked result, to `client/src/features/marketing/screenshots/`. Then fill `SCREENSHOTS` with imports, alt text ("The editor: the form on the left and the live resume preview on the right", "Choosing among six resume templates", "Tailoring a resume to a job description, with an ATS match score"), and captions (the tailoring one says "Illustrative example").
Run: `cd client && npm run screenshots && ls -l src/features/marketing/screenshots`
Expected: three files, each under 250 KB.

- [x] **Step 4: Run the whole suite**

Run: `npm run test:e2e && npm run test:client && npm run build`
Expected: all pass, including the landing page's axe scan with the screenshots.

- [x] **Step 5: CHANGELOG** under `[Unreleased]` / Added: Playwright demo-mode suite (Chromium and WebKit; guest start, two tabs, an ended demo, refusals, end demo) and landing screenshots that need no demo.

- [x] **Step 6: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add client/playwright.config.ts client/package.json client/e2e client/src/features/demo/screenshots.ts \
  client/src/features/marketing/screenshots CHANGELOG.md
git commit -m "test: end-to-end demo suite and landing screenshots"
```

---

### Task 13: Runtime and database: readiness, connections, gunicorn, Docker, Postgres 17

**Files:**
- Modify: `server/config/middleware.py:31-47`, `server/config/urls.py:40`, `server/config/settings.py:164-173`, `Dockerfile:52-55`, `.dockerignore`, `docker-compose.yml`, `.github/workflows/ci.yml:47,124,146-163,177`
- Create: `docker/postgres-init/01-resumeiq-role.sql`
- Test: `server/apps/accounts/tests/test_health.py`

**Interfaces:**
- Produces: `GET /health/ready` (200 `{"status": "ready"}`, 503 `{"status": "unavailable"}`); `CONN_MAX_AGE = 60`; `DATABASES["default"]["OPTIONS"]["connect_timeout"] = 5`; gunicorn `--max-requests 1000 --max-requests-jitter 100`; `.dockerignore` adds `**/.env*`; local role `resumeiq` (password `resumeiq_local_only`) owning database `resumeiq`.

- [x] **Step 1: Write the failing tests**

```python
@pytest.mark.django_db
@pytest.mark.parametrize("host", ["10.0.1.23:8000", "resumeiq.jameslittlefield.net"])
def test_readiness_answers_on_any_host(client, settings, host):
    settings.DEBUG = False; settings.ALLOWED_HOSTS = ["resumeiq.jameslittlefield.net"]
    res = client.get("/health/ready", HTTP_HOST=host)
    assert (res.status_code, res.json()) == (200, {"status": "ready"})

def test_readiness_is_503_when_the_database_is_down(client, monkeypatch):
    monkeypatch.setattr("config.middleware.connection", SimpleNamespace(cursor=Mock(side_effect=OperationalError("down"))))
    assert client.get("/health/ready").status_code == 503
    assert client.get("/health").status_code == 200   # liveness never touches the database

def test_no_health_path_falls_through_to_the_spa():
    with pytest.raises(Resolver404):
        resolve("/health/anything")

def test_database_connections_are_short_lived_and_fail_fast(settings):
    assert settings.DATABASES["default"]["CONN_MAX_AGE"] == 60
    assert settings.DATABASES["default"]["OPTIONS"]["connect_timeout"] == 5
```

- [x] **Step 2: Run them to see them fail**

Run: `cd server && .venv/bin/python -m pytest apps/accounts/tests/test_health.py -v`
Expected: FAIL (`/health/ready` reaches the SPA catch-all; `CONN_MAX_AGE` is 600).

- [x] **Step 3: Implement the server side.** Readiness runs `SET LOCAL statement_timeout = '2s'` and `SELECT 1` inside a short `transaction.atomic()` and maps `DatabaseError` to 503. SPA regex: `r"^(?!api/|admin/|static/|assets/|health(?:/|$)).*$"`. Add the gunicorn flags to the `CMD` with a comment (recycles workers to cap slow memory growth; restarts are graceful). Add `**/.env*` to `.dockerignore`.

- [x] **Step 4: Run the tests to see them pass**

Run: `npm run test:server`
Expected: all pass.

- [x] **Step 5: Move local Postgres to 17**

`docker/postgres-init/01-resumeiq-role.sql` (runs once, on a fresh volume):
```sql
-- Mirrors the shared production server (design 5.5): the runtime role is not a superuser and owns its database.
-- Since PostgreSQL 15, PUBLIC can't create in schema public, so the database must be owned by the app role.
CREATE ROLE resumeiq LOGIN PASSWORD 'resumeiq_local_only';
CREATE DATABASE resumeiq OWNER resumeiq;
REVOKE CONNECT ON DATABASE resumeiq FROM PUBLIC;
```
`docker-compose.yml`: `db.image: pgvector/pgvector:pg17`; volume `postgres17_data:/var/lib/postgresql/data` plus `./docker/postgres-init:/docker-entrypoint-initdb.d:ro`; top-level `volumes: postgres17_data:`. Make the `app` profile production-like: `DATABASE_URL: postgres://resumeiq:resumeiq_local_only@db:5432/resumeiq`, `DEMO_MODE: "true"`, the always-pass Turnstile site key and secret, `AI_MONTHLY_BUDGET_USD: "0"`, `ANTHROPIC_API_KEY: sk-ant-local-placeholder-never-sent`, `RUN_MIGRATIONS: "0"`, `mem_limit: 640m`, `read_only: true`, `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `stop_grace_period: 120s`; keep `DEBUG: "False"`, `SECURE_SSL_REDIRECT: "False"`, `ALLOWED_HOSTS: localhost,127.0.0.1`, `CLIENT_URL: http://localhost:8000`.

A PostgreSQL 17 server can't open the PostgreSQL 15 data in the old `postgres_data` volume, so the new volume starts empty and the old one is left untouched. Optional: if James wants his local dev data, dump it first (Step 5a), then restore it (Step 5d).
- [x] 5a (optional, before switching): `docker compose exec db pg_dump -U resume_user -d resume_builder -Fc -f /tmp/rb.dump && docker compose cp db:/tmp/rb.dump /tmp/resume_builder-pg15.dump`
- [x] 5b: `docker compose down && docker compose up -d db && docker compose exec db psql -U resume_user -d postgres -c "select version()" -c "\du resumeiq"`. Expected: PostgreSQL 17.x; `resumeiq` has no Superuser or Create DB attribute.
- [x] 5c: `server/.venv/bin/python server/manage.py migrate`. Expected: all migrations applied.
- [x] 5d (optional): `docker compose cp /tmp/resume_builder-pg15.dump db:/tmp/rb.dump && docker compose exec db pg_restore -U resume_user -d resume_builder --clean --if-exists --no-owner /tmp/rb.dump`, then migrate again.
- [x] 5e: `npm run test:server && npm run test:e2e`. Expected: all pass on 17. The old volume stays until James chooses to remove it.

- [x] **Step 6: CI on Postgres 17 and a demo-mode smoke test**

In `ci.yml`, change the three service images (`:47`, `:124`, `:177`) to `pgvector/pgvector:pg17`. In the Docker job, start the container with `-e DEMO_MODE=true -e TURNSTILE_SITE_KEY=1x00000000000000000000AA -e TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (loopback `ALLOWED_HOSTS`, so test keys are allowed) and add:
```bash
curl -fsS http://localhost:8000/health/ready | grep -q '"ready"'
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8000/api/auth/login)" = 404
curl -fsS http://localhost:8000/api/demo/status | grep -q '"demo_mode":true'
```

- [x] **Step 7: CHANGELOG** under `[Unreleased]`: Added (`/health/ready`); Changed (Postgres 17 locally and in CI, with a non-superuser app role in the local production run; database connections live 60 s and connect within 5 s; gunicorn recycles workers; the compose `prod` profile runs production-like); Security (`.dockerignore` excludes every `.env*` file).

- [x] **Step 8: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add server/config/middleware.py server/config/urls.py server/config/settings.py \
  server/apps/accounts/tests/test_health.py Dockerfile .dockerignore docker-compose.yml \
  docker/postgres-init/01-resumeiq-role.sql .github/workflows/ci.yml CHANGELOG.md
git commit -m "feat: readiness check, Postgres 17, and a production-like local run"
```

---

### Task 14: CI security hardening

**Files:**
- Create: `.github/workflows/security.yml`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml` (SHA pins, `persist-credentials: false` on checkouts)

**Interfaces:**
- Produces: workflow `Security` with job `secrets` ("Leaked secrets (gitleaks)") on push to `main` and `dev`, every PR, Mondays at 13:00 UTC, and manual runs; job `dependencies` ("Weekly dependency audit") on the schedule and manual runs only. The existing required `ci.yml` jobs keep their names.

- [x] **Step 1: Write `security.yml`**

Copy `open-door/.github/workflows/security.yml:1-41` (triggers, concurrency, top-level `permissions: contents: read`, the gitleaks 8.30.1 install with its checksum check, `fetch-depth: 0`, `./gitleaks git --redact --verbose --exit-code 1`). Add:
```yaml
  dependencies:
    name: Weekly dependency audit
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with: { persist-credentials: false }
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version-file: .nvmrc }
      - uses: actions/setup-python@<sha> # <tag>
        with: { python-version: "3.12" }
      - run: npm audit --omit=dev --audit-level=high
        working-directory: client
      - run: pip install pip-audit==2.10.1 && pip-audit -r server/requirements.txt --require-hashes
```

- [x] **Step 2: Pin every action to a commit SHA**

Known pins (from Open Door): `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`, `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`; the two `docker/*` actions are already pinned. Resolve the rest:
```bash
for repo in actions/setup-python github/codeql-action; do
  tag=$(gh api "repos/$repo/releases/latest" --jq .tag_name)
  read sha type < <(gh api "repos/$repo/git/ref/tags/$tag" --jq '"\(.object.sha) \(.object.type)"')
  [ "$type" = tag ] && sha=$(gh api "repos/$repo/git/tags/$sha" --jq .object.sha)
  echo "$repo $tag $sha"
done
```
Use the setup-python and codeql-action major versions the workflows use today (`v7`, `v4`); if `latest` is a different major, pick the newest tag of the current major instead. `codeql-action/init` and `/analyze` share one SHA.
Run: `grep -nE "uses: [^ ]+@" .github/workflows/*.yml | grep -vE "@[0-9a-f]{40} # v"`
Expected: no output. Dependabot's `github-actions` entry (`.github/dependabot.yml`) keeps the pins current.

- [x] **Step 3: Scan the full history once, locally**

Run: `docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact --verbose --exit-code 1`
Expected: "no leaks found". Any finding: stop and show James. Add a `.gitleaks.toml` allowlist (like `open-door/.gitleaks.toml`) only for a finding he confirms is not a secret.

- [x] **Step 4: CHANGELOG** under `[Unreleased]` / Security: gitleaks on every push and PR, a weekly dependency audit, every workflow action pinned to a commit SHA.

- [x] **Step 5: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add .github/workflows/security.yml .github/workflows/ci.yml .github/workflows/codeql.yml CHANGELOG.md
git commit -m "ci: add gitleaks and a weekly audit, and pin actions to commit SHAs"
```

---

### Task 15: Visitor-facing copy: Privacy, Terms, link previews, stale addresses

**Files:**
- Modify: `client/src/features/legal/PrivacyPage.tsx`, `TermsPage.tsx`, `LegalPages.test.tsx`; `client/src/lib/site.ts:5`; `client/index.html:27-28`; `server/config/settings.py:121,201`; `server/apps/accounts/tests/test_security.py:57-70`; `.github/workflows/ci.yml:78`

**Interfaces:** none new.

- [x] **Step 1: Write the failing tests** (`LegalPages.test.tsx`)

```tsx
it("privacy states the retention and names every processor", () => {
  const { container } = render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  for (const text of ["removed from the app after 24 hours", "up to 7 days", "(including IP addresses) are kept for 14 days",
                      "Anthropic", "Cloudflare", "Amazon Web Services", "Please don't upload a real resume."]) {
    expect(container.textContent).toContain(text);
  }
});
it.each([["Privacy", PrivacyPage], ["Terms", TermsPage]])("%s has no account language and no em dashes", (_n, Page) => {
  const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
  expect(container.textContent).not.toMatch(/Account page|creating an account|password reset/i);
  expect(container.textContent).not.toContain(String.fromCharCode(0x2014)); // no em dash
});
```

- [x] **Step 2: Run them to see them fail**

Run: `npm run test --prefix client -- LegalPages`
Expected: FAIL.

- [x] **Step 3: Rewrite the pages for the public demo**

Privacy (keep the draft-for-review header comment, the layout, and the contact section): the demo has no accounts (no name, email, or password); what's stored (a random guest ID, the résumés, versions, and cover letters made in the demo, AI usage logs without text, AI spend records with amounts and model names only); the retention sentence from Global Constraints, plus "Ending your demo (Sign out and end demo) deletes it from the app right away."; processors: Anthropic (only when an AI feature is used), Cloudflare (the bot check when starting a demo; it sees your IP address and browser signals), Amazon Web Services (hosting, backups, logs), Google Fonts (unchanged); cookies (`refresh_token` lasts up to 24 hours; the theme in local storage); "Please don't upload a real resume. Use the sample or made-up details."; remove the Email section and the Account page link.
Terms: "By starting a demo, you agree to these terms"; the demo is temporary (deleted after 24 hours, or sooner if you end it), each demo has an AI allowance and live AI has a daily budget for everyone, so it may be unavailable; don't upload real résumés or anyone's personal data; acceptable use (no bots or scraping; don't start many demos to get around limits); "We may end demos that break these terms or abuse the service."; remove account wording. Set `LEGAL_LAST_UPDATED` to the day of this change ("Month D, YYYY").

- [x] **Step 4: Fix the stale `resume.` addresses**

`index.html` `og:url` `https://resumeiq.jameslittlefield.net/` and `og:image` `https://resumeiq.jameslittlefield.net/og-image.png`; `settings.py:121` comment `*.resumeiq.…`; `settings.py:201` `ResumeIQ <no-reply@resumeiq.jameslittlefield.net>`; `test_security.py` and `ci.yml:78` hosts to `resumeiq.jameslittlefield.net`.
Run: `grep -rn "resume\.jameslittlefield" client/src client/index.html client/e2e server/config server/apps .github`
Expected: no output.

- [x] **Step 5: Run everything**

Run: `npm run test:client && npm run test:server && npm run build && npm run test:e2e`
Expected: all pass.

- [x] **Step 6: CHANGELOG** under `[Unreleased]` / Changed: Privacy and Terms describe the no-account demo (24-hour retention, 7-day backups, 14-day logs, Anthropic, Cloudflare, AWS); link previews and addresses use `resumeiq.jameslittlefield.net`.

- [x] **Step 7: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add client/src/features/legal client/src/lib/site.ts client/index.html server/config/settings.py \
  server/apps/accounts/tests/test_security.py .github/workflows/ci.yml CHANGELOG.md
git commit -m "docs: privacy and terms for the no-account demo, and the resumeiq address"
```

---

### Task 16: Deploy notes and project docs

**Files:**
- Create: `docs/DEPLOYMENT.md`
- Modify: `CLAUDE.md`, `README.md`, `.env.example`, `PLAN.md`, `CHANGELOG.md:6-8`

**Interfaces:**
- Produces: the values Phase 2 copies (below).

- [x] **Step 1: Write `docs/DEPLOYMENT.md`** with these sections, values exact:
  - **Where it runs:** ECS on the shared EC2 server behind the ALB, per the portfolio-infra design; host `resumeiq.jameslittlefield.net`; image built for `linux/amd64`.
  - **Environment** (service, migrate, and cleanup tasks share it): SSM SecureString under `/portfolio/resumeiq/`: `SECRET_KEY`, `DATABASE_URL` (`postgres://resumeiq:<password>@172.17.0.1:5432/resumeiq`), `ANTHROPIC_API_KEY` (Resume IQ workspace, monthly limit $12, alerts $5 and $9), `TURNSTILE_SECRET_KEY`. Plain: `ALLOWED_HOSTS=resumeiq.jameslittlefield.net`, `CLIENT_URL=https://resumeiq.jameslittlefield.net`, `DEMO_MODE=true`, `TURNSTILE_SITE_KEY=<site key>`, `RUN_MIGRATIONS=0`, `AI_MONTHLY_BUDGET_USD=10`, `AI_PACING_MULTIPLIER=3`, `AI_DAILY_FLOOR_USD=0.50`, `AI_VISITOR_BUDGET_USD=0.15`, `DEMO_STARTS_PER_HOUR=15`, `DEMO_STARTS_PER_DAY=50`. Leave `DEBUG`, `DJANGO_ADMIN_ENABLED`, and `SECURE_SSL_REDIRECT` unset. Off switch: `AI_MONTHLY_BUDGET_USD=0`.
  - **One-off migrate task** (runs before every service update; the deploy waits for exit 0): command `["python", "manage.py", "migrate", "--noinput"]` (the entrypoint `exec`s the command), the shared environment, `RUN_MIGRATIONS=0`. Migrations stay backward compatible with the previous image during the two-copy overlap (new columns use `db_default`).
  - **Hourly cleanup task** (EventBridge Scheduler): command `["python", "manage.py", "cleanup_demo"]`, the shared environment, `RUN_MIGRATIONS=0`, memory as measured in Task 17 (the design's 128 MiB if it passed). A non-zero exit raises the failed-task alarm.
  - **Service:** container port 8000; target group health check `/health` (interval 15 s, timeout 5 s, healthy 2, unhealthy 3); readiness `/health/ready` for the deploy smoke test; health-check grace 60 s; `stopTimeout` 120; deregistration delay 120 s (AI calls run up to 100 s; gunicorn's graceful timeout is 110 s); memory reservation 320 MiB, hard limit 640 MiB; user 1000; `readonlyRootFilesystem: true` with a tmpfs at `/tmp`; drop all capabilities; `no-new-privileges`; not privileged.
  - **Smoke test after deploy:** `GET /` 200 with `id="root"`; `GET /health/ready` 200; `POST /api/auth/login` 404; `GET /api/demo/status` 200 with `"demo_mode":true`.
  - **WAF expensive-paths rule:** `/api/ai/*` and `POST /api/demo/start`.
  - **PostgreSQL 17 setup** (once, as the init superuser): the three statements from `docker/postgres-init/01-resumeiq-role.sql` with a generated password; `scram-sha-256` authentication. Connection budget: up to 16 connections per task (2 workers x 8 threads, `CONN_MAX_AGE` 60), 32 during a rolling deploy, plus the two tasks.
  - **Turnstile:** one site covering the four hostnames; action `start-demo`.
  - **Rollback:** redeploy the previous image; migrations are additive.
- [x] **Step 2: Update `CLAUDE.md`:** line 7 to `resumeiq.jameslittlefield.net` (after the Phase 3 deploy); the DB line to Postgres 17; the AI line to the env limits and the ledger (`apps/ai/pricing.py`, `apps/ai/ledger.py`; admins and DEBUG pay dollars too); commands (`cleanup_demo`; the prod profile now needs `docker compose --profile prod run --rm app python manage.py migrate --noinput` before `up`; `npm run screenshots` in `client/`); CI now on Postgres 17 plus `security.yml`; repo map adds `apps/demo/` and `docs/DEPLOYMENT.md`; remove the two-tab item from "Future hardening" (fixed); replace the "Phase 10 infra checklist" with a pointer to `docs/DEPLOYMENT.md`, the portfolio-infra design, and this plan; add security invariants ("every Anthropic call goes through `service._call` and the ledger"; "new account endpoints use `ClosedInDemoModeMixin`"; "the CSP allows only `challenges.cloudflare.com` beyond self and Google Fonts"); add a phase status line for this plan in the file's existing style; update the Phase 10 line (ECS on EC2, shared Postgres 17, SSM; no RDS, no Fargate).
- [x] **Step 3: Update `README.md`** (Live URL `https://resumeiq.jameslittlefield.net` "after deploy"; a short "Live demo" section; Postgres 17; the production-like local run), `.env.example` (`DEMO_MODE=False`; commented always-pass Turnstile keys; the AI budget settings with their defaults; `AI_SERVER_SIDE_FALLBACK=True`), `PLAN.md` (one line under "Locked technical decisions" and Phase 10: superseded by the portfolio-infra design), and `CHANGELOG.md:6-8` (`1.0.0` marks the first release to `resumeiq.jameslittlefield.net`).
- [x] **Step 4: Check for leftovers**

Run: `grep -rn "resume\.jameslittlefield" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.claude . | grep -v "^./CHANGELOG.md"` and `grep -rn "$(printf '\342\200\224')" docs/DEPLOYMENT.md CLAUDE.md README.md .env.example` (finds em dashes)
Expected: only historical `PLAN.md` lines that the new note marks as superseded; no em dashes in the new text.

- [x] **Step 5: Commit**

Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add docs/DEPLOYMENT.md CLAUDE.md README.md .env.example PLAN.md CHANGELOG.md
git commit -m "docs: deployment notes for Phase 2 and the demo-mode project docs"
```

---

### Task 17: Local production rehearsal and go-live checks

**Files:**
- Modify: `CHANGELOG.md`, `package.json`, `package-lock.json`, `/Users/jameslittlefield/Documents/github_things/portfolio-infra/PLAN.md:23`, this plan (tick boxes)

- [x] **Step 1: Everything green**

Run: `npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e && server/.venv/bin/python server/manage.py check --fail-level WARNING && server/.venv/bin/python server/manage.py makemigrations --check --dry-run && (cd client && npm run gen:api) && git status --porcelain -- client/openapi.yaml client/src/api/generated`
Expected: all pass; the last command prints nothing.

- [x] **Step 2: Build and migrate like production**

```bash
docker compose up -d db
docker compose --profile prod build app
docker compose --profile prod run --rm app python manage.py migrate --noinput
docker compose --profile prod up -d app
```
Expected: migrate exits 0 as the non-superuser `resumeiq` role; the app starts with `DEBUG` off, `DEMO_MODE` on, test Turnstile keys, budget 0.

- [x] **Step 3: Walk the checks.** Record each result in the session notes.

| Check | Command or action | Pass when |
|---|---|---|
| Liveness and readiness | `curl -fsS localhost:8000/health; curl -fsS localhost:8000/health/ready` | `{"status": "ok"}`, `{"status": "ready"}` |
| Readiness fails closed | `docker compose stop db; curl -s -o /dev/null -w '%{http_code}' localhost:8000/health/ready; curl -fsS localhost:8000/health; docker compose start db` | 503, then liveness still 200 |
| Closed routes | `for p in register login password-reset password-reset/confirm; do curl -s -o /dev/null -w "$p %{http_code}\n" -X POST localhost:8000/api/auth/$p; done` | all 404 |
| API docs off | `curl -s -o /dev/null -w '%{http_code}' localhost:8000/api/schema/` and `.../api/schema/swagger-ui/`, also with a guest's `Authorization: Bearer` | 404 |
| Guest start | Chrome at `http://localhost:8000`: "Try the live demo" | lands on `/resumes/<id>` with the sample résumé; header menu says "Demo guest" |
| Expired guest | `docker compose --profile prod run --rm app python manage.py shell -c "from django.utils import timezone; from apps.accounts.models import User; User.objects.filter(is_guest=True).update(guest_expires_at=timezone.now())"`, then `docker compose --profile prod run --rm app python manage.py cleanup_demo`, then reload the tab | "Your demo ended" on the landing page; `docker compose logs app` shows no 500 |
| Two tabs | start a demo, open the editor in a second tab, reload both at once | both stay in the editor |
| Budget 0 refusal | landing shows the AI notice; in the editor, AI menu, "Generate summary" | the `ai_off` copy; the logs show no Anthropic call |
| Forged X-Forwarded-For | `for i in $(seq 1 16); do curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:8000/api/demo/start -H "X-Forwarded-For: 198.51.100.$i, 203.0.113.7" -H 'Content-Type: application/json' -d '{"turnstile_token":"x"}'; done` | the 16th answers 429 (the key is the rightmost entry) |
| CSP and headers | `curl -sI -H 'X-Forwarded-Proto: https' localhost:8000/` | CSP has `script-src 'self' https://challenges.cloudflare.com` and `frame-src https://challenges.cloudflare.com`; `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` present |
| No `.env` in the image | `docker compose --profile prod run --rm --entrypoint sh app -c 'find / -xdev -name ".env*" 2>/dev/null'` | no output |
| Memory | after the walk: `docker stats --no-stream` | the app is under 640 MiB; write down the figure for the 320 MiB reservation |
| Cleanup fits its memory | the commands below the table | exits 0 (otherwise record the size that works for `docs/DEPLOYMENT.md`) |
| Graceful stop | `time docker compose stop app` | stops well inside 120 s when idle |

Cleanup at the scheduled-job memory size (design 5.5 gives scheduled jobs 128 MiB):
```bash
docker compose --profile prod config --format json \
  | python3 -c 'import json,sys; env=json.load(sys.stdin)["services"]["app"]["environment"]; print("\n".join(f"{k}={v}" for k,v in env.items()))' \
  > /tmp/resumeiq-app.env
docker run --rm --memory 128m --network smart-resume-builder_default --env-file /tmp/resumeiq-app.env \
  smart-resume-builder-app python manage.py cleanup_demo; echo "exit=$?"
rm /tmp/resumeiq-app.env
```

Notes: the refresh cookie is `Secure` because `DEBUG` is off; Chrome accepts it on `http://localhost`, so use Chrome for the browser checks. The always-pass Turnstile site key loads the real Cloudflare script (a free request); the server answers the test secret locally. If any check fails, fix it in the task that owns it, rerun that task's tests, and commit separately (with the same stop).

Done 2026-11-20: every check passed. Step 1: client 263, server 405, e2e 98, generated client clean. App memory after the walk 133 MiB of 640 MiB; cleanup at 128 MiB exited 0 (no guests left to delete, so not a loaded test); graceful stop 0.65 s; readiness 503 with the database stopped while liveness stayed 200. Two observations (Swagger UI 500 with a malformed Bearer, gunicorn's control-socket ERROR on the read-only root) were fixed in `61ed93a` with the Step 4 review findings (whole-branch code review "with fixes", security review with one Low); after it: server 451, client 273, e2e 98.

- [x] **Step 4: Security and code review**

Run the `security-review` skill on the branch, then the `code-review` skill (design 5.10: every implementation PR gets a security review). Fix findings in their own commits, each with the stop.

- [x] **Step 5: Cut 0.17.0**

Move `[Unreleased]` into `## [0.17.0] - <today>` with a one-paragraph summary (demo mode with guest starts, the AI spend ledger, friendly refusals, Postgres 17, readiness, CI hardening); leave an empty `## [Unreleased]`; set the links `[Unreleased]: .../compare/v0.17.0...HEAD` and `[0.17.0]: .../compare/v0.16.0...v0.17.0`. Run `npm version 0.17.0 --no-git-tag-version` at the repo root (updates `package.json` and `package-lock.json`). Tick this plan's finished boxes.
Stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.
```bash
git add CHANGELOG.md package.json package-lock.json docs/superpowers/plans/2026-11-19-demo-mode-and-deploy-readiness.md
git commit -m "chore: cut 0.17.0, demo mode and deploy readiness"
```

- [x] **Step 6: Update the master plan row**

In `/Users/jameslittlefield/Documents/github_things/portfolio-infra/PLAN.md:23`, set Resume IQ's status to "Phase 1 done on `feat/portfolio-demo-readiness` (0.17.0); local go-live checks passed; PR into `dev` pending" (or what is true) and the date. Committing in `portfolio-infra` follows that repo's rules: stop: show the diff summary and the proposed commit message, and wait for James's explicit OK before committing.

- [x] **Step 7: Push and open the PR (each only with OK)**

Stop: wait for James's explicit OK, then `git push -u origin feat/portfolio-demo-readiness`.
Stop: show the PR title and body, wait for James's explicit OK, then `gh pr create --base dev --head feat/portfolio-demo-readiness --title "feat: demo mode and deploy readiness (0.17.0)" --body-file <file>`. The body lists the go-live check results from Step 3 and the items deferred below. The merge into `dev` and, later, `dev` into `main` (Phase 3) each need their own OK.

---

## Deferred to Phase 2/3 (AWS)

- CDK stacks for the instance, cluster, ALB, and WAF (add `/api/ai/*` and `POST /api/demo/start` to the expensive-paths rule).
- ECR repository, scan-on-push, and image push.
- ECS task definitions and service, using `docs/DEPLOYMENT.md` (memory 320/640, `stopTimeout` 120, deregistration 120 s, grace 60 s, read-only root with tmpfs `/tmp`, capabilities dropped).
- The one-off migrate task and the hourly `cleanup_demo` task with EventBridge Scheduler, commands and env as documented.
- The deploy workflow (build, push, migrate, update service, smoke tests) and its `production` environment.
- The GitHub OIDC deploy role for this repo.
- SSM SecureString values under `/portfolio/resumeiq/`.
- The real Turnstile site and keys for `resumeiq.jameslittlefield.net`.
- The Anthropic Resume IQ workspace ($12 limit, alerts $5 and $9) and its key.
- The `resumeiq` role and database on the shared Postgres 17 server.
- Production values: `ALLOWED_HOSTS`, `CLIENT_URL`, `SECRET_KEY`, `DATABASE_URL`, and the budget env.
- DNS failover pair, the fallback page, and the alarm-based health check.
- Go-live checks on AWS: a second network, real client IP behind the ALB, the failover drill, ECR scan, metadata unreachable, only ports 80 and 443 open.
- GitHub repository settings (Dependabot security updates; master plan Phase 0).
- The release merge `dev` into `main` and the `1.0.0` cut at the first production deploy (Phase 3).
- The portfolio "Live demo" link and case-study copy (Phase 4).
