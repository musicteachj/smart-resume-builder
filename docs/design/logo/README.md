# The ResumeIQ mark

Made in Claude Design on 2026-10-18 from `../logo-brief.md`. The SVG and PNG exports are kept byte for byte (only
the duplicate-download " (1)" suffixes were dropped from their file names). Each SVG carries Claude's C2PA
content-credentials manifest in a `<metadata>` block; the copies the app ships strip it.

## What was chosen

**A résumé page with a four-point spark.** The page says "résumé," the spark says "AI," so the product reads at a
glance, which is what the rename to ResumeIQ was after. It departs from the brief's lead concept (the Q of "IQ" with a
caret tail) and from its avoid list (page icons, four-point stars), chosen for clarity over distinctiveness. The
wordmark is Newsreader 600, the app's display face, whose serifed "I" fixes the "ResumelQ" misreading Inter
caused. Ink is `foreground`: #1B1B1A on light, #F5F3EE on dark.

Contrast (WCAG non-text, needs 3:1): #1B1B1A on #FBFAF8 is 16.5:1 and on #FFFFFF 17.2:1; #F5F3EE on #1A1917 is
15.8:1 and on #232220 is 14.3:1.

## Where it is used

| file | used as |
|---|---|
| `resumeiq-mark.svg` | the geometry `client/src/components/layout/Brand.tsx` (`BrandMark`) draws inline, in `currentColor` |
| `favicon.svg` | its 16 px pixel drawing is `client/public/favicon.svg`, with a theme switch added (see below) |
| `favicon-32.png` | copied to `client/public/icon-32.png`, the raster fallback Safari uses |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | copied unchanged to `client/public/` (touch icon and `site.webmanifest`) |
| `og-image.png` | copied to `client/public/`; the link-preview image (not from Claude Design, see below) |
| `favicon-16.png` | not used: `favicon.svg` covers 16 px |
| `resumeiq-lockup-*.svg`, `resumeiq-mark-light-ink.svg`, `resumeiq-mark-one-color.svg` | not used by the app; for documents, slides and print. The app's lockup is `<Brand />`, real Newsreader text beside the inline mark |

**`favicon.svg` here is not the shipped favicon.** It came back with no fill and no theme switch, so it drew in
default black and all but vanished on a dark tab bar. `client/public/favicon.svg` is the same pixel path with a
`prefers-color-scheme` switch: #1B1B1A ink by default, #F5F3EE in dark mode. The PNG fallbacks are dark ink on
transparent, so in Safari's dark tab bar the icon is faint; acceptable for a fallback.

**`og-image.png` was made outside Claude Design**, by rendering `resumeiq-lockup-dark-ink.svg` and the landing
line "The resume that writes itself well." on warm paper (#FBFAF8) in Newsreader and Inter, 1200 × 630.
