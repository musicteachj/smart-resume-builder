import { FileText, LogOut, Moon, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
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

  return (
    <header className="sticky top-0 z-header border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-semibold text-foreground">Resume Builder</span>
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
              aria-label="Account menu"
            >
              {initials(user?.name ?? "")}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  logout();
                  navigate("/");
                }}
              >
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
