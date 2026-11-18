import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/stores/auth";

import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-4xl font-semibold text-foreground">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your sign-in details and your data.</p>

      <Card className="mt-8 p-6">
        <h2 className="font-display text-xl font-semibold text-foreground">Profile</h2>
        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-4 text-sm">
          <dt className="font-semibold text-foreground">Name</dt>
          <dd className="text-muted-foreground">{user?.name}</dd>
          <dt className="font-semibold text-foreground">Email</dt>
          <dd className="break-all text-muted-foreground">{user?.email}</dd>
        </dl>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-xl font-semibold text-foreground">Delete account</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Permanently delete your account and everything in it: all résumés, saved versions, and
          cover letters. This happens immediately and can't be undone. See the{" "}
          <Link
            to="/privacy"
            className="rounded-sm text-foreground underline underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacy Policy
          </Link>{" "}
          for what we store.
        </p>
        <Button variant="destructive" className="mt-5" onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </Card>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </main>
  );
}
