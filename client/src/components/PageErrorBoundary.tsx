import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  /** The route. A failure is cleared when it changes, so other pages still work. */
  resetKey?: string;
}

interface State {
  failed: boolean;
  key?: string;
}

/**
 * Catches a page that fails to render (a lazily loaded page whose code couldn't be
 * downloaded, offline or right after a deploy, or a bug) and offers a reload instead
 * of a blank screen. Navigating to another page clears it; a page whose code failed
 * to load needs a reload to try again (React.lazy keeps the failure).
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Reset before rendering the new route (not after), so a page that fails on the
    // same navigation renders the fallback once instead of flashing.
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center"
      >
        <h1 className="font-display text-2xl font-semibold text-foreground">This page didn't load</h1>
        <p className="max-w-sm text-muted-foreground">
          Reload to try again. If the app was just updated, reloading also picks up the new version.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
