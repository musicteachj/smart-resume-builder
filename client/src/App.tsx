function App() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        AI Resume Builder
      </p>
      <h1 className="text-4xl font-semibold text-foreground">
        Smart Resume Builder
      </h1>
      <p className="max-w-md text-center text-muted-foreground">
        Scaffold complete. Editorial Ink tokens, Fraunces &amp; Inter, and the
        Vite + Tailwind toolchain are wired up.
      </p>
      <button
        type="button"
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-shadow hover:shadow-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        Phase 1 ✓
      </button>
    </div>
  );
}

export default App;
