import { cn } from "@/lib/utils";

/**
 * The ResumeIQ mark: a résumé page with a four-point spark (Claude Design, `docs/design/logo/`).
 * Geometry is `resumeiq-mark.svg`'s, unchanged; drawn inline in `currentColor` so it follows the
 * theme ink and is there on first paint. Decorative: the wordmark beside it is the accessible name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("h-6 w-6 shrink-0", className)}
    >
      <path
        fillRule="evenodd"
        d="M3 6H15L21 12V29H3ZM7 14h10v2.5h-10zM7 19h10v2.5h-10zM7 24h6v2.5h-6z"
      />
      <path d="M24.5 0.5C25.2 4.6 26.4 5.8 30.5 6.5C26.4 7.2 25.2 8.4 24.5 12.5C23.8 8.4 22.6 7.2 18.5 6.5C22.6 5.8 23.8 4.6 24.5 0.5Z" />
    </svg>
  );
}

/**
 * The ResumeIQ lockup: mark + Newsreader wordmark, in theme ink (never the accent).
 * Box-centering leaves the page body ~3px low against the caps (the spark lifts the box), so the
 * mark is raised an eighth of its size to center the page on the cap height.
 */
export function Brand() {
  return (
    <span className="flex items-center gap-3 text-foreground">
      <BrandMark className="-translate-y-[12.5%]" />
      <span className="font-display text-xl font-semibold leading-none">ResumeIQ</span>
    </span>
  );
}
