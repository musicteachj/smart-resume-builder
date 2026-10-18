# ResumeIQ logo: brief for Claude Design

Paste everything below the line into a new Claude Design project, and attach the files it lists. It follows
the shape of Packwright's `docs/design/logo-brief.md`, which produced that app's mark in three rounds.

What exists today: the app was renamed from "Smart Resume Builder" to ResumeIQ on 2026-10-18 and has never had a
logo. The lockup (`client/src/components/layout/Brand.tsx`, used in the app header, the auth screens, and the
landing page) is a stock lucide `FileText` icon in an ink rounded tile beside the wordmark "ResumeIQ" in Inter
semibold. That tile is too close to Folio's "F" tile and is placeholder only. The favicon is still Vite's
default, and there is no touch icon or social share image.

The attachments are regenerated, not stored. They live in the gitignored `docs/design/claude-design-upload/`:
screenshots of the running app (`npm run dev`, captured with a throwaway Playwright script), `theme-tokens.css`
copied from the `:root` and `.dark` blocks of `client/src/index.css`, and `design-system.md` copied from
`docs/DESIGN.md` §0–2 and its anti-patterns.

---

# ResumeIQ: logo, favicon and share image

AI resume builder, portfolio piece; must read as a real, professional product. People write their résumé in a
split-screen editor with a live preview, and Claude helps along the way: it rewrites bullets for impact, drafts
the summary, tailors the résumé to a job description with an ATS match score, and writes cover letters. Version
history, six templates, and PDF and Word export round it out.

The app's design system already exists and is not up for change: "Editorial Ink." Warm paper canvas, ink text,
Newsreader for display headlines and Inter for everything else, hairline rules, soft warm shadows, and a
forest-green accent reserved for actions. Its north star is "distinctive, but never loud." This round is the
mark only, and it has to belong to that system.

## Attached
- `01-landing.png`: the landing page, where the lockup sits in the masthead
- `02-dashboard.png`: the résumé dashboard, with the lockup in the app header
- `03-editor.png`: the editor, the app's main screen
- `04-header-lockup.png`: today's placeholder lockup at 2x
- `05-header-dark.png`: the app header in dark mode
- `theme-tokens.css`: every color token, light and dark, with hex values
- `design-system.md`: the design principles, type, and anti-patterns

## Who sees it
Job seekers, first. Then recruiters, hiring managers, and engineers who review the portfolio. They should read
it as a careful, trustworthy writing tool, not a gimmick.

## Feel
Editorial, calm, precise. Closer to a well-made notebook, a style guide, or a good publisher's colophon than to
a startup. The name already says AI ("IQ"), so the mark does not need to shout it. It should feel smart through
one well-judged detail, never through "AI sparkle."

## Lead concept
**The Q of "IQ," with its tail drawn as a text caret.** The tail becomes the insertion cursor of a text field
(or a proofreader's insertion mark), which is the AI writing alongside you. Find a version where the Q still
reads as a letter at 32 px and the caret still reads as a caret at 16 px.

Worth exploring beside it, no more than two:
- the Q as the **match-score ring**: a partly closed arc, like the app's ATS score meter, with the tail as its
  needle
- a **proofreader's insertion caret (^) on a hairline rule**, the editor's mark for "insert better words here"

## Must
- Legible as a 16 px favicon, drawn on whole pixels (a separate 16 px drawing is fine).
- Work inline in the lockup "⟨mark⟩ ResumeIQ" at about 15 px, mark vertically centered on the wordmark. Show the
  wordmark in both Inter 600 and Newsreader 600, and show how "IQ" is treated (same face and weight as
  "Resume," or a deliberate shift in weight or face). Recommend one. The name is always written "ResumeIQ": one
  word, capital R, capital I, capital Q, no accent.
- The "I" must never read as a lowercase "l". In today's Inter lockup (`04-header-lockup.png`) "ResumeIQ"
  can read as "ResumelQ", because Inter's capital I is a bare stroke. Solve it in the wordmark (a serifed I,
  a weight or face shift on "IQ", or spacing), and show the fix at 15 px.
- Ink only:
  - light: ink `foreground` #1B1B1A on `background` #FBFAF8 and `surface` #FFFFFF
  - dark: ink `foreground` #F5F3EE on `background` #1A1917 and `surface` #232220
- Pass WCAG 2.2 AA non-text contrast (3:1) on all four backgrounds; state the ratios.
- Have a one-color version (black on paper) that survives printing.

## Avoid
- **The accent and score colors as brand color.** Forest green `accent` (#0F5132 light, #3DA572 dark) is
  reserved for the one primary action per screen. `success` green, `warning` amber, and `destructive` red mean
  score bands and errors. A mark in any of them reads as a button or a verdict.
- AI clichés: sparkles and four-point stars, brains, robots, lightbulbs, magic wands, chat bubbles.
- Gradients, glows, purple or pink, rounded app-icon tiles with drop shadows.
- Checkmarks, shields, badges, seals: they claim "ATS-approved," and the app only reports what it checked.
- A generic document or page icon, like today's placeholder.
- Anything resembling the owner's other marks: a rounded ink tile with a letter in it (Folio), a registration
  target or crosshair (Packwright), a door ajar (Open Door).

## Hand back
1. Round 1: three directions, each on light and dark, shown at 16, 32 and 64 px and in the lockup.
2. For the chosen one:
   - SVG master at 32 px
   - a 16 px favicon SVG with a fill and an explicit `prefers-color-scheme` switch (light ink on dark tab bars,
     dark ink on light ones), so it never vanishes on either
   - PNGs at 16, 32, 180 (apple-touch-icon), 192 and 512
   - inline lockup in light ink, dark ink, and one-color
   - one-color mark
   - a specimen card with contrast ratios
3. Optional: a short note on whether the caret could blink slowly in the app's loading splash, and how. It must
   stay still under `prefers-reduced-motion`.
4. A social share image, 1200 × 630, for when the link is posted or messaged: the lockup on warm paper, the line
   "The resume that writes itself well.", and nothing else loud. It must stay legible as a small thumbnail.

One screen at a time. American English. No exclamation points, no em dashes.
