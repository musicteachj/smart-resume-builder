import { ArrowRight, Check, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";

const BENEFITS: [string, string][] = [
  ["AI that sharpens, not pads.", "Rewrite any bullet for impact and metrics in one click."],
  ["Tailored to the job.", "Match your resume to a description and see your ATS score."],
  ["Always export-ready.", "Clean, parser-safe PDFs that look right every time."],
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-semibold text-foreground">Resume Builder</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/register">
            <Button variant="secondary" size="sm">
              Get started
            </Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 pt-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          AI-assisted, recruiter-ready
        </p>
        <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground">
          The resume that writes itself well.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-muted-foreground">
          Build a clean, ATS-safe resume in minutes. Sharpen every bullet, tailor to any role, and
          export a polished PDF — without fighting a template.
        </p>

        <ul className="mt-9 w-full max-w-md space-y-3 text-left">
          {BENEFITS.map(([title, desc]) => (
            <li key={title} className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="text-sm">
                <span className="font-semibold text-foreground">{title}</span>{" "}
                <span className="text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ul>

        <Link to="/register" className="mt-9">
          <Button size="lg" className="gap-2">
            Build my resume <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
        <p className="mt-3 text-sm text-muted-foreground">Free to start · No credit card required</p>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-border px-6 py-5 text-sm text-muted-foreground">
        <span>© 2026 Resume Builder</span>
        <div className="flex gap-5">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Contact</span>
        </div>
      </footer>
    </div>
  );
}
