import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { FooterLinks } from "@/components/layout/FooterLinks";
import { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          to="/"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Brand />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Link>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex flex-1 flex-col items-center px-6 pt-12 focus:outline-none"
      >
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="mt-7 w-full max-w-md">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-5 text-sm text-muted-foreground">
        <span>© 2026 ResumeIQ</span>
        <FooterLinks />
      </footer>
    </div>
  );
}
