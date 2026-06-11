import { ArrowLeft, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-semibold text-foreground">Resume Builder</span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pt-12">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="mt-7 w-full max-w-md">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </main>

      <footer className="px-6 py-5 text-center text-sm text-muted-foreground">
        © 2026 Resume Builder
      </footer>
    </div>
  );
}
