# Changelog

All notable changes to ResumeIQ (formerly Smart Resume Builder) are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project follows
[Semantic Versioning](https://semver.org/). Until the first production deploy, each completed
implementation phase (see `PLAN.md`) cuts a `0.x.0` version; `1.0.0` marks the first release to
`resume.jameslittlefield.net`.

## [Unreleased]

### Added
- **The ResumeIQ logo** (Claude Design; exports and history in `docs/design/logo/`): a résumé page with a
  four-point spark beside a Newsreader "ResumeIQ" wordmark. `Brand` now draws the mark inline (`BrandMark`, in
  theme ink) in the header, auth screens, and landing page, replacing the placeholder icon tile. The stock Vite
  favicon is replaced by a pixel-drawn `favicon.svg` that switches ink for dark tab bars, plus a PNG fallback,
  touch icon, `site.webmanifest`, and a 1200 × 630 link-preview image with Open Graph tags. DESIGN.md gains a
  Brand section (the mark's spark is the only sparkle in the product).

### Changed
- **Renamed to ResumeIQ** (descriptor: "AI resume builder"). The header, auth and landing lockups now
  share one `Brand` component, the page title reads "ResumeIQ: AI resume builder", the API schema title is
  "ResumeIQ API" (Orval client regenerated), the root package is `resumeiq`, and the theme preference is
  stored under `resumeiq-theme` (was `srb-theme`). The GitHub repo, folder, and CI image tag keep the
  `smart-resume-builder` slug. A Claude Design logo brief is in `docs/design/logo-brief.md`.
- **Faster first load**: each page (landing, login, register, dashboard, editor) is now its own lazily loaded
  chunk, so visitors download only the page they open. The main bundle drops from ~698 kB to ~426 kB
  (216 kB to 139 kB gzipped) and the build no longer warns about oversized chunks.

### Fixed
- **Autosave retries failed saves**: a rate-limited (`429`, honoring `Retry-After` up to 2 minutes),
  server-error, or offline save is retried with backoff (2s doubling to 30s) and the editor shows "Couldn't
  save, retrying…" instead of stopping at "Couldn't save". A newer edit's save always supersedes a retry.
  After the editor closes, its last save gets up to 5 retries; if the résumé is reopened first, the new editor
  shows those edits as unsaved and saves them itself, and the old retries stand down. Saves for a résumé run
  one at a time, so a closed editor's slow save can't land after a newer one. Errors that won't fix themselves
  (other 4xx, cancellations) still show "Couldn't save".
- **A page that fails to load no longer blanks the app**: if a page's code can't be downloaded (offline, or
  stale files right after a deploy) or the page crashes, a "This page didn't load" screen offers a Reload. The
  dashboard keeps its header while its page loads.
- **Template previews blank in Safari and DuckDuckGo**: system WebKit doesn't paint absolutely positioned
  content inside a `<button>`, so every template-gallery thumbnail (and the selected check badge) was empty.
  The thumbnail and badge now share one grid cell instead, and the page is shrunk with `zoom` like the History
  preview.
- **Primary buttons glowed on hover**: `hover:shadow-accent` collided with the `accent` color name, so
  Tailwind painted the shadow in solid accent (a wide halo, bright green in dark mode). The shadow is now
  `shadow-cta`, a small 12% lift, and hover also shifts the fill to `accent/90` so the change is visible.
- **Template previews ignored the section order**: the gallery thumbnails always used the default order, so
  a résumé with reordered sections previewed differently from how it renders. They now use the résumé's order.

## [0.14.0] - 2026-10-18

Résumé version history.

### Added
- **Version history in the editor**: a new **History** button opens a version browser for the résumé. The list
  is grouped by day (automatic checkpoints, saved versions tagged "Saved", and safety checkpoints), and the
  selected version shows a read-only preview of the document. Save the current state as a named version,
  rename or delete versions, or **Restore** one (after a confirm); restoring saves the current state first, so
  it can be undone from the same list, and the editor reloads with the restored résumé.
- **"Before tailoring" checkpoint**: Tailor's **Apply to this résumé** saves a version first, so a tailoring pass
  can be rolled back from History.
- **Résumé version history (API)**: a new `ResumeVersion` model and user-scoped `/api/resume-versions/`
  endpoints (list with `?resume=`, get, save, rename, delete, and `restore`). The server checkpoints a résumé's
  previous state automatically on the first change of an editing session (when the newest version is over 10
  minutes old), users can save named versions (up to 20 per résumé), and restoring snapshots the current state
  first so it can be undone. The newest 30 automatic versions are kept per résumé; saved versions are never
  pruned. Covered by the `writes` throttle.
- `useAutosave` exposes `flush()` (save a pending edit now) and `abandonPending()`; an `EditorSession` context
  makes them available to top-bar modals. `Modal` gains `size="xl"`.

### Security
- The `resume` field on cover-letter (and version) writes is now scoped to the requesting user, so another
  user's résumé and a nonexistent one return the same error instead of revealing which ids exist.

### Fixed
- Duplicating a résumé (including **Save as tailored copy**) now keeps its document font and section order.
- Autosave no longer marks edits typed while a save is in flight as saved; they're saved by the next save
  instead of waiting for another keystroke.

## [0.13.0] - 2026-10-18

Pre-deploy batch: security hardening and audit fixes, document customization, section reordering,
DOCX/text export, tailored copies, cover letters (generate, save, manage), the ATS health check, and CI.

### Security
- **Dependency updates** from the new audit: Django 5.2.15 → 5.2.18 and Django REST framework
  3.17.1 → 3.17.2 (security patch releases); `npm audit fix` updates client transitive dependencies,
  including axios and `@xmldom/xmldom`. Remaining advisories are moderate or dev-only (Tailwind 3's build
  tooling; fixing them means Tailwind 4).
- The deliberate no-HSTS-preload `check --deploy` warning (`security.W021`) is now silenced in production
  settings, so CI can fail on any new deploy warning.
- **Write rate limit on résumé and cover-letter CRUD**: a per-user `writes` throttle (120/min) on create,
  update, delete, and duplicate under `/api/resumes/` and `/api/cover-letters/`. Reads are never throttled,
  and editor autosave (800ms debounce) stays well under the cap.
- **Refresh token moved to an `httpOnly` cookie; access token is memory-only.** The long-lived refresh
  JWT is now set as an `HttpOnly`/`Secure`(prod)/`SameSite=Lax` cookie scoped to `/api/auth` — no longer
  readable by JS. The short-lived access token lives only in memory (nothing auth-related is persisted to
  `localStorage`), so the app performs a silent `/api/auth/refresh` on load to restore the session (guards
  gain a brief loading splash). Access token lifetime 15 min, refresh 7 days. New
  `POST /api/auth/logout` clears the cookie; `SameSite` is the CSRF defense (all mutating endpoints are
  `Bearer`-authed and CSRF-immune). Login/register responses no longer include `refresh`.
- **Security audit hardening** (full front + back audit ahead of the Phase 10 deploy):
  - **`DEBUG` now defaults to `False` (fail-closed)** — an unset `DEBUG` means production behavior
    (CSP on, `Secure` cookies, AI limits enforced, real `SECRET_KEY` required). Local dev now requires
    a repo-root `.env` with `DEBUG=True` (see `.env.example`).
  - **Refresh tokens rotate and can be revoked**: SimpleJWT `token_blacklist` app added (new migration);
    every `/api/auth/refresh` rotates the cookie and blacklists the old token, and logout blacklists the
    cookie's token — a leaked refresh token no longer survives to its 7-day expiry. Logout also gains the
    `auth` throttle scope.
  - **Production HTTPS settings**: `SECURE_PROXY_SSL_HEADER` (ALB terminates TLS), `SECURE_SSL_REDIRECT`
    (env-overridable; `/health` exempt for ALB health checks), HSTS (30 days, incl. subdomains, no preload),
    and `Secure` session/CSRF cookies for the admin. `manage.py check --deploy` is clean apart from the
    deliberate no-preload warning.
  - **Throttle keys hardened for the ALB**: DRF `NUM_PROXIES=1`, so IP throttles key on the real client IP
    instead of the spoofable full `X-Forwarded-For` header.
  - **OpenAPI schema + Swagger UI are login-gated in production** (still open in dev for Orval).
  - **Dependency hygiene**: `npm audit fix` clears a high-severity `form-data` advisory (transitive via
    axios; 0 vulnerabilities now); `server/requirements.txt` pinned to exact versions for reproducible
    image builds.
  - **Container**: the Docker image now runs as a non-root `app` user; local Postgres in `docker-compose.yml`
    binds to `127.0.0.1` only.
  - **Misc**: AI usage counters increment atomically via `F()` expressions (no lost updates under concurrent
    calls); résumé/JD file import rejects files over 10 MB before parsing.
- **Rate-limiting**: scoped DRF throttles — an `auth` scope on login/register (blunts brute force,
  keyed by IP) and an `ai-burst` per-user guard on the AI endpoints that complements the existing
  daily/monthly usage quota.
- **AI errors masked in production**: the AI `502` now returns a generic message when `DEBUG=False`
  (the raw upstream string is still shown in dev). No more leaking internals to clients.
- **Content-Security-Policy**: a production-only CSP header on every response (no-op under `DEBUG` so
  Vite's dev server keeps working). The policy allows the Google Fonts hosts (Newsreader/Inter) and
  same-origin scripts/API; `frame-ancestors 'none'`.

### Added
- **Continuous integration** (GitHub Actions, on PRs and pushes to `dev`/`main`): client lint, typecheck,
  tests, and build; server system checks, production `check --deploy`, missing-migration check, and pytest
  on Postgres 15; OpenAPI schema validation plus a check that the committed Orval client is up to date;
  a Docker image build with a boot-and-curl smoke test; and a dependency audit (`npm audit` on production
  deps, `pip-audit`). CodeQL scans JavaScript/TypeScript, Python, and the workflows on every PR and weekly.
- `.nvmrc` (Node 22), used by CI and local `nvm use`.
- **Warning before discarding AI suggestions**: closing an AI modal (X, Esc, or clicking outside) while it
  holds an unused or in-flight result now asks for confirmation first. Covers Improve bullet, Generate
  summary, Tailor to JD (including **New analysis**), Import résumé (while parsing, in review, and **Start
  over**), and the cover-letter editor (generating, or an unsaved generated or edited letter, including its
  **Back** button). Built on a shared `useDiscardConfirm` hook, exposed on `Modal` as an opt-in
  `confirmDiscard` prop.
- **Regenerate a cover letter from its stored job description**: the cover-letter editor has a
  **Regenerate** button that drafts a fresh letter from the saved JD (uses 1 AI credit; not saved until you
  click Save). It asks before replacing edits you've made by hand.
- **Saved cover letters**: AI-generated cover letters can now be saved to the résumé they were generated
  from — the editor's AI menu opens a **Cover letters** manager listing this résumé's letters, where you can
  generate a new one, reopen and edit any letter, copy / download `.txt`, or delete it. Letters store their
  job description for context and are capped at 25 per résumé (oldest pruned). New `CoverLetter` model +
  user-scoped `/api/cover-letters/` CRUD in `apps/resumes`; generation still uses `/api/ai/cover-letter`.
- **AI cover-letter generator**: a new editor AI action drafts a tailored cover letter from the résumé and a
  pasted-or-uploaded job description (Sonnet), shown in an editable field with copy-to-clipboard and `.txt`
  download. Usage-gated; graceful `502` without an API key.
- **AI ATS health check**: a new editor AI action scores the current résumé for ATS-readiness (0–100, no job
  description needed) via forced tool-use, and lists specific issues and recommendations (reuses `ScoreMeter`
  and the score-band convention). Usage-gated.
- **Save a tailored copy per job**: in the Tailor-to-JD modal, accepted bullet rewrites and keywords are now
  *picked* (not applied immediately), then sent to one of two destinations — **Apply to this résumé** (in place,
  as before) or **Save as tailored copy**, which duplicates the résumé, applies the picks to the copy, and opens
  it, leaving the original untouched. Reuses the existing duplicate + patch endpoints (no backend change); the
  apply logic is a tested pure `applyTailoring` helper.
- **Export to DOCX and plain text**: the editor's Export button is now a menu — **PDF** (as before), **Word
  (.docx)**, and **Plain text (.txt)**. Both new formats are built from the résumé content (not scraped from
  HTML) so they're clean and ATS-safe, follow the saved section order, and the `.docx` uses the chosen
  document font. The `docx` library is lazy-loaded into its own chunk, so the main bundle is unaffected.
  Shared date/format helpers were extracted so every output (preview, PDF, DOCX, text) reads identically.
- **Reorder résumé sections**: drag the section panels in the editor (Summary, Experience, Education, Skills,
  Projects) to change their order in the document — e.g. put Skills directly under Summary. Reuses the
  existing `@dnd-kit` drag infrastructure; the header stays pinned at the top. Order persists per résumé
  (new `section_order` field; empty = the canonical order, so existing résumés are unchanged) and the live
  preview + exported PDF follow it.
- **More templates (6 total)**: three new ATS-safe, single-column templates — **Executive** (left serif,
  quiet headings), **Minimal** (airy sans), and **Editorial** (centered serif) — added to Classic/Modern/Banner
  via a new section-heading style axis in the template registry.
- **User-selectable document font**: a curated set of ATS-safe typefaces (Georgia, Times New Roman, Garamond,
  Arial, Helvetica, Calibri) selectable per résumé, independent of the template (new `document_font` field;
  blank = the template's default). The picker lives in the template gallery; the live preview and exported PDF
  both reflect the choice.
- **Tailor to JD — file upload**: the Tailor-to-job-description modal now accepts a **PDF or DOCX**
  upload in addition to pasting. The file is read in the browser (reusing the import feature's
  extractor, now generalized to `extractFileText`) and its text fills the editable job-description
  box, so the user can trim boilerplate before analyzing. Client-only; no AI credit is spent on
  extraction and the file never leaves the browser.

### Changed
- App display font swapped from **Fraunces** to **Newsreader** (editorial serif that pairs more naturally
  with the Inter body). Centralized change via the `font-display` token — the Google Fonts `@import`
  (`index.css`) and `tailwind.config.ts` `display` family — so all app-chrome headings update through the
  token. The résumé document/PDF (Georgia/Arial) and `font-sans` (Inter) are unaffected. Design docs
  (`DESIGN.md`, `CLAUDE.md`, `README.md`, `PLAN.md`) updated to match.
- The Tailor modal stays open while **Save as tailored copy** runs, so its duplicate-then-patch steps can't be
  interrupted. A résumé parse that finishes after you discarded it is now ignored instead of reappearing the
  next time Import opens.
- README prerequisites now list Node 22 (matches `.nvmrc` and the Docker build stage) and React 19.
- Orval 8.20 → 8.43 (via `npm audit fix`); the regenerated API client adds named mutation-variable types
  and mutation-key helpers. No API or behavior change.

## [0.12.0] - 2026-06-30

Feature B — import an existing résumé.

### Added
- **Import résumé**: a dashboard action to bring in an existing résumé. Text is extracted in the browser
  (PDF via `pdfjs-dist`, DOCX via `mammoth`, both lazy-loaded; the file never leaves the client), parsed by
  Claude (Sonnet) via a forced tool-use `parse-resume` endpoint into structured `ResumeContent`, then shown
  in an in-modal **review** (live `ResumeDocument` preview) — a new résumé is created only on confirm and
  opens in the editor.
- Backend `POST /api/ai/parse-resume` mirrors the tailor endpoint (usage-gated, recorded as `parse-resume`,
  graceful 502 without an API key); the parse service assigns entry UUIDs and normalizes email/URL fields so
  the result passes the strict résumé-content validation.
- Tests: parse normalization (ids, email/URL coercion), the parse view (gate/usage/502), `extractResumeText`
  (PDF/DOCX/empty/unsupported), and the import modal (parse → review → create, plus error handling).

### Changed
- The résumé document renders `linkedin`/`github`/`website` as **labeled clickable links** (LinkedIn ·
  GitHub · Website) instead of raw URLs, in both the preview and the exported PDF. Only `http(s)` URLs are
  linked (scheme-validated); any other scheme falls back to plain text (stored-XSS guard).

### Notes
- Import counts against the AI usage limits (10/day · 50/month). Text-based PDFs only — no OCR for scans.

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

[Unreleased]: https://github.com/musicteachj/smart-resume-builder/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/musicteachj/smart-resume-builder/compare/v0.11.0...v0.12.0
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
