import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export function EditorPlaceholderPage() {
  const { id } = useParams();
  return (
    <main className="mx-auto max-w-6xl px-6 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Editor</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-foreground">
        Coming in Phase 5
      </h1>
      <p className="mt-2 text-muted-foreground">
        The split-screen editor for resume{" "}
        <code className="rounded bg-surface-variant px-1.5 py-0.5 text-sm">{id}</code> lands next.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>
    </main>
  );
}
