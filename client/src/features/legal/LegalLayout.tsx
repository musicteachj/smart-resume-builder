import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { FooterLinks } from "@/components/layout/FooterLinks";
import { LEGAL_LAST_UPDATED } from "@/lib/site";

/** Shell for the long-form legal pages (Privacy, Terms): brand header, one readable column. */
export function LegalLayout({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  // Footer links jump between long pages; the router keeps the old scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link
          to="/"
          aria-label="ResumeIQ home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Brand />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-16 pt-10">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
        <div className="mt-6 text-base leading-relaxed text-foreground">{intro}</div>
        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-border px-6 py-5 text-sm text-muted-foreground">
        <span>© 2026 ResumeIQ</span>
        <FooterLinks />
      </footer>
    </div>
  );
}

/** One titled section of a legal page (an h2 plus prose). */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-base leading-relaxed text-foreground">
      <h2 className="font-display text-2xl font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** A bulleted list in legal-page prose. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">{children}</ul>;
}

const linkClass =
  "rounded-sm underline underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** An inline link in legal-page prose, underlined so it doesn't rely on color. `to` is an
 * app route, or a `mailto:`/`https:` URL (rendered as a plain anchor). */
export function LegalLink({ to, children }: { to: string; children: ReactNode }) {
  if (/^(mailto:|https?:)/.test(to)) {
    const external = to.startsWith("http");
    return (
      <a
        href={to}
        className={linkClass}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
        {external && <span className="sr-only"> (opens in a new tab)</span>}
      </a>
    );
  }
  return (
    <Link to={to} className={linkClass}>
      {children}
    </Link>
  );
}
