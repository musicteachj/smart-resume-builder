import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { FooterLinks } from "@/components/layout/FooterLinks";
import { Button } from "@/components/ui/Button";
import { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";
import { DemoNotices } from "@/features/demo/DemoNotices";
import { Screenshots } from "@/features/demo/DemoScreenshots";
import { StartDemoButton } from "@/features/demo/StartDemoButton";
import { useDemoStatus } from "@/features/demo/useDemoStatus";
import { LoadingSplash } from "@/routes/guards";
import { useAuthStore } from "@/stores/auth";

const BENEFITS: [string, string][] = [
  ["AI that sharpens, not pads.", "Rewrite any bullet for impact and metrics in one click."],
  ["Tailored to the job.", "Match your resume to a description and see your ATS score."],
  ["Always export-ready.", "Clean, parser-safe PDFs that look right every time."],
];

/**
 * The home page. With accounts it offers sign-in and sign-up; in demo mode (or if the demo
 * status can't be fetched) it offers the one-click live demo instead, with its notices.
 * Until the status (and, in demo mode, the session) is known it shows the loading splash, so
 * nothing flashes.
 */
export function LandingPage() {
  const { status, isLoading, demoMode } = useDemoStatus();
  // A guest still signed in gets the way back, not a second demo by accident.
  const guestSignedIn = useAuthStore((s) => s.status === "authenticated" && s.user?.is_guest === true);
  // In demo mode, also wait for a reload's session restore: otherwise a returning guest sees
  // "Try the live demo" first and could start a second demo before "Back to your demo" shows.
  // Bootstrap always settles (a visitor without a cookie becomes "unauthenticated").
  const authLoading = useAuthStore((s) => s.status === "loading");
  if (isLoading || (demoMode && authLoading)) return <LoadingSplash />;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* min-h keeps the header the height of its sign-in buttons when they are absent. */}
      <header className="mx-auto flex min-h-[4.5rem] w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        {!demoMode && (
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/register">Get started</Link>
            </Button>
          </nav>
        )}
      </header>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 pt-16 text-center focus:outline-none"
      >
        {demoMode && <DemoNotices status={status} />}
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          AI-assisted, recruiter-ready
        </p>
        <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground">
          The resume that writes itself well.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-muted-foreground">
          Build a clean, ATS-safe resume in minutes. Sharpen every bullet, tailor to any role, and
          export a polished PDF, without fighting a template.
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

        {!demoMode && (
          <>
            <Button asChild size="lg" className="mt-9 gap-2">
              <Link to="/register">
                Build my resume <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">Free to start · No credit card required</p>
          </>
        )}
        {demoMode && (
          <>
            {guestSignedIn ? (
              <Button asChild size="lg" className="mt-9 gap-2">
                <Link to="/dashboard">
                  Back to your demo <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <StartDemoButton status={status} />
            )}
            <Screenshots />
          </>
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-border px-6 py-5 text-sm text-muted-foreground">
        <span>© 2026 ResumeIQ</span>
        <FooterLinks />
      </footer>
    </div>
  );
}
