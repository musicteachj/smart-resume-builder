import { Info } from "lucide-react";
import { useEffect, useState } from "react";

import type { DemoStatus } from "@/api/generated/model";
import { useAuthStore } from "@/stores/auth";

const DEMO_ENDED = "Your demo ended. Demos last 24 hours. You can start a new one anytime.";
const AI_DAILY_USED =
  "Today's live AI budget is used up. The editor, templates, and PDF and Word export still work, and the screenshots below show the AI features.";
const AI_OFF =
  "Live AI is off in this demo right now. The editor, templates, and PDF and Word export still work, and the screenshots below show the AI features.";

/** Long enough for screen readers to register a new live region before its text arrives. */
const ANNOUNCE_DELAY_MS = 100;

/**
 * One notice. Screen readers announce changes to a live region, not text it already held
 * when it appeared, so the `role="status"` region (visually hidden) mounts empty and gets the
 * text a moment later. The visible copy is there from the first render, so nothing moves, and
 * is hidden from assistive technology so the notice isn't read twice.
 */
function LiveNotice({ children }: { children: string }) {
  const [announced, setAnnounced] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(true), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left text-sm text-foreground shadow-light">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span aria-hidden>{children}</span>
      <span role="status" className="sr-only">
        {announced ? children : ""}
      </span>
    </div>
  );
}

/** The demo landing's notices: a session that just ended, and no live AI (switched off, or today's
 * budget used up). Both come from state the page already has, so neither needs the bot check's script. */
export function DemoNotices({ status }: { status: DemoStatus | undefined }) {
  const sessionEnded = useAuthStore((s) => s.sessionEnded);
  const notices = [
    sessionEnded && DEMO_ENDED,
    status && !status.ai_available && (status.ai_reason === "off" ? AI_OFF : AI_DAILY_USED),
  ].filter((n): n is string => Boolean(n));
  if (notices.length === 0) return null;

  return (
    <div className="mb-10 flex w-full max-w-xl flex-col gap-3">
      {notices.map((notice) => (
        <LiveNotice key={notice}>{notice}</LiveNotice>
      ))}
    </div>
  );
}
