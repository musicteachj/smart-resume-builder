import { useState } from "react";

import { useDeleteAccount } from "@/api/generated/auth/auth";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSignOut } from "@/features/auth/useSignOut";

/** A guest's sign-out: it deletes the guest and its resumes right away (no password; a guest
 * has none), then goes home with the session and query cache cleared. */
export function EndDemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const signOut = useSignOut();
  const { mutateAsync } = useDeleteAccount();
  // Stays true after success: the page is leaving, so the buttons shouldn't come back.
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (ending) return; // don't close mid-request
    if (!next) setError("");
    onOpenChange(next);
  };

  const endDemo = async () => {
    if (ending) return;
    setEnding(true);
    setError("");
    try {
      await mutateAsync({ data: {} });
    } catch {
      setError("We couldn't end your demo. Please try again.");
      setEnding(false);
      return;
    }
    signOut();
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="End your demo?"
      description="Signing out ends this demo and deletes its resumes right away. You can start a new demo from the home page anytime."
      confirmLabel="End demo"
      cancelLabel="Keep working"
      destructive
      loading={ending}
      error={error}
      onConfirm={() => void endDemo()}
    />
  );
}
