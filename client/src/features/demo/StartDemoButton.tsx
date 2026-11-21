import { ArrowRight } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useStartDemo } from "@/api/generated/demo/demo";
import type { DemoStatus } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { fieldErrors } from "@/lib/apiError";
import { useAuthStore } from "@/stores/auth";

import { getTurnstileToken } from "./turnstile";

const NO_SIGN_UP = "No sign-up. Your demo resumes are deleted after 24 hours. Please don't upload a real resume.";
const DEMO_FULL = "The demo is full right now. The screenshots below show what it does. Please check back later.";
// The status request failed, so there's no site key to start with.
const NO_STATUS = "The demo can't start right now. Please check back later.";
const BOT_CHECK_FAILED = "The bot check couldn't load. Please try again, or look at the screenshots below.";
const START_FAILED = "We couldn't start the demo. Please try again.";

/**
 * The demo landing's one primary action: pass the bot check, start a guest, and open its
 * sample resume. Cloudflare's script loads only on the first press.
 */
export function StartDemoButton({ status }: { status: DemoStatus | undefined }) {
  const navigate = useNavigate();
  const { mutateAsync } = useStartDemo();
  const slot = useRef<HTMLDivElement>(null);
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const siteKey = status?.turnstile_site_key ?? "";
  const available = status?.guest_start_available === true && siteKey !== "";

  const start = async () => {
    if (busy || !available || !slot.current) return;
    const { clearSessionEnded } = useAuthStore.getState();
    clearSessionEnded();
    setError("");
    setBusy(true);

    let token: string;
    try {
      token = await getTurnstileToken(slot.current, siteKey);
    } catch {
      setError(BOT_CHECK_FAILED);
      setBusy(false);
      return;
    }

    try {
      const { user, access, resume_id } = await mutateAsync({ data: { turnstile_token: token } });
      const auth = useAuthStore.getState();
      // A guest who starts over gets a fresh session: drop the old one's cached data first.
      if (auth.status === "authenticated") auth.logout();
      auth.setSession({ user, access });
      navigate(`/resumes/${resume_id}`);
    } catch (err) {
      setError(fieldErrors(err).detail ?? START_FAILED);
      setBusy(false);
    }
  };

  return (
    <div className="mt-9 flex w-full flex-col items-center">
      <Button
        size="lg"
        className="gap-2"
        onClick={() => void start()}
        disabled={!available}
        loading={busy}
        aria-describedby={noteId}
      >
        Try the live demo <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      {available ? (
        <p id={noteId} className="mt-3 max-w-md text-sm text-muted-foreground">
          {NO_SIGN_UP}
        </p>
      ) : (
        <p id={noteId} role="status" className="mt-3 max-w-md text-sm text-muted-foreground">
          {status ? DEMO_FULL : NO_STATUS}
        </p>
      )}
      {/* Turnstile's widget renders here, and stays invisible unless Cloudflare needs a click. */}
      <div ref={slot} className="mt-4 empty:hidden" />
      {error && (
        <p role="alert" className="mt-4 max-w-md rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
