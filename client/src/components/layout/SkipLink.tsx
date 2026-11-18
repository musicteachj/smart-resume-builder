import type { MouseEvent } from "react";

/** Every page's main landmark carries this id (and `tabIndex={-1}`, so it can take focus). */
export const MAIN_CONTENT_ID = "main";

/**
 * "Skip to main content": the first stop in the tab order on every page (DESIGN.md §6).
 * Hidden until focused. Moves focus into the page's `<main>` directly rather than through
 * the URL hash, which the router (and the reset-password link) use for their own purposes.
 */
export function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // Never follow the href: a hash would replace one the page relies on (the reset
    // link's #uid=...&token=...). With no <main> yet (still loading), do nothing.
    event.preventDefault();
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    main.focus();
    main.scrollIntoView({ block: "start" });
  };

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skip}
      className="sr-only rounded-md bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      Skip to main content
    </a>
  );
}
