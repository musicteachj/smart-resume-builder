import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { AXIOS_INSTANCE } from "@/api/axios";
import { UsagePill } from "@/components/ui/UsagePill";
import { initials } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

export function AppHeader() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();

  // Clear the refresh cookie server-side, then clear the in-memory session.
  const handleLogout = async () => {
    try {
      await AXIOS_INSTANCE.post("/api/auth/logout");
    } finally {
      logout({ signedOut: true });
      navigate("/");
    }
  };

  return (
    <header className="sticky top-0 z-header border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          to="/dashboard"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Brand />
        </Link>

        <div className="flex items-center gap-4">
          {user?.ai_usage && (
            <UsagePill used={user.ai_usage.calls_today} limit={user.ai_usage.daily_limit} />
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* The initials are decorative; the button is named by the hidden text. (An
                  aria-label that leaves out the visible initials fails WCAG 2.5.3.) */}
              <span aria-hidden>{initials(user?.name ?? "")}</span>
              <span className="sr-only">Account menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/account">
                  <UserRound className="h-4 w-4" aria-hidden />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleLogout()}>
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
