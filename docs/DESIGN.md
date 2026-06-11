# Smart Resume Builder — Design System ("Editorial Ink")

> **Chosen identity: "Editorial Ink."** A distinct, app-specific look — deliberately NOT the developer's
> portfolio "Professional Navy" brand. Every project gets its own identity. Editorial Ink treats the resume as
> a crafted document: **Fraunces** serif headlines + **Inter** body, a reserved forest-green accent on warm
> paper. Premium, editorial, calm. External craft references (Linear, Stripe, Vercel) inform *polish* only —
> not the look.
>
> Philosophy: **engineered restraint** — high contrast, nothing decorative that doesn't earn its place,
> token-driven (no raw hex in components), hairline borders + soft warm shadows over heavy elevation,
> purposeful motion. When in doubt, remove rather than add.

## 0. North Star — "distinctive, but never loud; very professional"

Target the precise middle: **not generic, not outlandish, unmistakably professional.**
- **Avoid generic** via a *few* signature, disciplined details — Fraunces serif headlines against Inter body,
  warm paper canvas with hairline rules, a reserved forest-green accent, generous editorial whitespace, and
  crafted micro-interactions. Differentiation comes from restraint and craft, NOT from loud effects or gimmicks.
- **Avoid outlandish** — no brutalism/neon/glassmorphism/heavy gradients/aggressive motion. Light-first,
  high-contrast, calm. When in doubt, remove rather than add.
- **AI surfaces stay quiet** — the AI modals and match-score UI must look like precise, trustworthy tooling,
  not flashy "AI sparkle." No gradient glows, no animated shimmer beyond a tasteful loading state.
- **Highest-risk surfaces** for drifting generic-or-gimmicky: the **landing page** and the **AI modals** —
  hold both firmly in the engineered-restraint lane and review them against this North Star before shipping.

## 1. Design tokens (CSS variables → consumed by Tailwind + shadcn)

Define as HSL/HEX CSS vars on `:root` and `.dark`; map into `tailwind.config.ts` `theme.extend.colors`
and shadcn's `--background/--foreground/...`. **No component may hardcode a hex.**

"Editorial Ink" tokens (light = primary experience; dark = warm-charcoal, not pure black). Verify all
foreground/background pairs for contrast independently per theme.

| Token (Tailwind name) | CSS var | Light | Dark |
|---|---|---|---|
| `background` (warm paper) | `--background` | `#FBFAF8` | `#1A1917` |
| `surface` (card) | `--surface` / `--card` | `#FFFFFF` | `#232220` |
| `surface-variant` | `--surface-variant` | `#F2F1EC` | `#2C2A27` |
| `foreground` (ink text) | `--foreground` | `#1B1B1A` | `#F5F3EE` |
| `muted-foreground` (secondary) | `--muted-foreground` | `#55534E` | `#A8A39B` |
| `accent` (CTA/active — RESERVED) | `--accent` / `--primary` | `#0F5132` | `#3DA572` |
| `accent-foreground` | `--accent-foreground` | `#FFFFFF` | `#10231A` |
| `border` (hairline) | `--border` | `#E7E5E0` | `#3A3733` |
| `ring` (focus) | `--ring` | `#0F5132` | `#3DA572` |
| `success` | `--success` | `#15803D` | `#4ADE80` |
| `warning` | `--warning` | `#B45309` | `#F59E0B` |
| `destructive` | `--destructive` | `#B42318` | `#F87171` |

**Accent rule:** `accent` (forest green) is used *only* for the single primary CTA per view, active nav/tab,
focused field ring, and selected state. Never for decoration, backgrounds, or body text. Distinguish it from
`success` (a brighter green) by reserving accent for *actions*, success for *outcomes*.

## 2. Typography

- **Display / headings:** `Fraunces` (variable; optical-size aware; weights 400/500/600/700), letter-spacing
  `-0.01em` to `-0.02em`. Serif — used for headlines and large display only, **never** body or small UI text.
- **Body / UI / form labels / buttons:** `Inter` (400/500/600), body line-height 1.55–1.65.
- **Eyebrow labels:** `Inter` 600, uppercase, `0.14em` tracking, accent or muted color.
- **Optional mono** (rare — code/IDs only): a neutral mono such as `Spline Sans Mono`. Avoid where not needed.
- **Resume preview/templates:** a neutral ATS-safe stack (e.g. system `Georgia`/`Arial`) — the resume must look
  like a *document*, not the app UI. Kept separate from app fonts on purpose; Fraunces must NOT leak into it.
- `font-display: swap`; preload only Fraunces + Inter.
- **Type scale (rem):** 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25 / 3 (+ hero `clamp(2.5rem,6vw,4rem)`).

## 3. Spacing / radius / shadow / z-index

- **Spacing:** 4px base — 4/8/12/16/24/32/48/64/80. Section rhythm tiers 16/24/32/48.
- **Radius:** `sm` 6px (chips/inputs), `md` 8px (buttons), `lg` 12px (cards/modals), `full` (avatars/pills).
- **Shadows (bespoke, not Material elevation):**
  - `--shadow-light` `0 1px 2px rgb(27 27 26 / .04), 0 2px 8px rgb(27 27 26 / .05)`
  - `--shadow-medium` `0 4px 12px rgb(27 27 26 / .08)`
  - `--shadow-heavy` `0 12px 32px rgb(27 27 26 / .12)`
  - `--shadow-accent` `0 8px 24px rgb(15 81 50 / .22)` (hover on primary CTA only)
- Cards/surfaces use **1px border + light shadow**, never heavy elevation.
- **z-index scale:** 0 / 10 (sticky header) / 20 (dropdown) / 40 (drawer) / 100 (modal) / 1000 (toast).

## 4. Component conventions (shadcn/ui, themed)

- **Buttons:** primary = solid `accent` + `accent-foreground`, `radius-md`, hover lifts via `--shadow-accent`,
  press scale `0.98`; secondary = `surface` + `border`; ghost = transparent; destructive = `destructive`.
  One primary per view. Disabled = opacity 0.5 + `cursor-not-allowed`. Async = spinner + disabled.
- **Inputs:** outlined (`border`), `radius-md`, visible label above (never placeholder-only), helper text below,
  error text below in `destructive` + `role="alert"`; focus = 2px `ring`. Validate on blur, focus first invalid on submit.
- **Cards (dashboard resume cards):** `surface` + 1px `border` + `shadow-light`; hover `translateY(-4px)` +
  `shadow-medium` + `accent` border; left 3px `accent` bar on hover; actions (duplicate/delete) in an overflow
  menu; destructive separated.
- **Modals (AI features):** centered, `surface`, `radius-lg`, scrim `rgb(27 27 26 / .5)`; animate scale+fade from
  trigger; Esc + explicit close; confirm-on-dismiss if unsaved AI suggestions pending.
- **Chips:** `radius-sm`, tonal; skill chips muted (`surface-variant`); **missing-keyword chips** use `warning`
  tonal + small icon (color never the only signal).
- **ATS match-score meter:** semicircle/linear gauge 0–100 with tabular-figure number; band colors
  destructive (<50) / warning (50–74) / success (≥75), each paired with a text label — never color alone.
- **AI-usage indicator:** compact `n/limit today` pill in header; turns `warning` near cap; `429` over-limit
  surfaces an inline message with reset time, not a dead button.

## 5. Motion

- Durations 150–300ms micro, ≤400ms transitions; **exit ~60–70% of enter**. Easing: ease-out enter, ease-in exit.
- Animate `transform`/`opacity` only (never width/height/top/left). 1–2 animated elements per view.
- Stagger dashboard cards 30–50ms. Entrance `fadeInUp` `cubic-bezier(0.16,1,0.3,1)`.
- **All motion gated behind `prefers-reduced-motion`** (reduce/disable). Live preview updates must feel instant (no janky reflow).

## 6. Accessibility (non-negotiable)

- Contrast ≥4.5:1 body / ≥3:1 large + UI glyphs; verify light *and* dark independently.
- Visible 2px focus ring on every interactive element; tab order matches visual order.
- Icon-only buttons get `aria-label`; SVG icons only (Lucide) — **no emoji as icons**.
- Form labels via `<label for>`; errors `role="alert"` + `aria-live`; required marked.
- Color never the sole signal (match score, keyword chips, validation all pair icon/text).
- Sequential heading hierarchy; skip-to-content link; respect Dynamic Type / zoom (no `maximum-scale`).

## 7. Anti-patterns / forbidden

- ❌ Blue/violet/purple accents or gradients — the reserved accent is forest green `#0F5132` only.
- ❌ Fraunces (serif) for body or small UI text — headlines/display only; Inter for everything else.
- ❌ The portfolio's fonts (JetBrains Mono / IBM Plex) — this app is intentionally its own identity.
- ❌ Hardcoded hex in components — tokens only. ❌ Accent green used decoratively / everywhere.
- ❌ Pure black `#000` / harsh pure-white surfaces — use warm paper/ink tokens.
- ❌ Heavy Material elevation on cards (hairline borders + soft warm shadows instead). ❌ Emoji as icons.
- ❌ Trendy gimmicks: glassmorphism, neon, chromatic/iridescent effects, gradient "AI sparkle."
- ❌ Placeholder-as-label; ❌ errors only at top of form; ❌ removing focus rings.
- ❌ Animating layout properties / motion with no meaning / ignoring reduced-motion.
- ❌ App fonts (Fraunces/Inter) bleeding into the resume preview (the document keeps its own ATS-safe typeface).
