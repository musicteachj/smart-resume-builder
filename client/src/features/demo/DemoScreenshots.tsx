import { SCREENSHOTS } from "./screenshots";

// Not `Screenshots.tsx`: beside `screenshots.ts` on a case-insensitive file system (macOS),
// `import "./Screenshots"` would resolve to the data file.

/** What the AI features look like, for visitors who can't (or would rather not) start a demo. */
export function Screenshots() {
  if (SCREENSHOTS.length === 0) return null;
  return (
    <section aria-labelledby="screenshots-heading" className="mt-16 w-full max-w-5xl">
      <h2 id="screenshots-heading" className="font-display text-2xl font-semibold text-foreground">
        The AI features
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {SCREENSHOTS.map((shot) => (
          <figure key={shot.src} className="overflow-hidden rounded-lg border border-border bg-surface shadow-light">
            <img src={shot.src} alt={shot.alt} loading="lazy" className="block w-full" />
            <figcaption className="border-t border-border px-4 py-3 text-left text-sm text-muted-foreground">
              {shot.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
