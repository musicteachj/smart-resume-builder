import { FileText, Sparkles, Target } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useAuthStore } from "@/stores/auth";

import { GenerateSummaryModal } from "./GenerateSummaryModal";
import { TailorModal } from "./TailorModal";

/** The editor's AI menu — generate-summary + tailor-to-JD, with a usage readout. */
export function AiMenu() {
  const [modal, setModal] = useState<"summary" | "tailor" | null>(null);
  const usage = useAuthStore((s) => s.user?.ai_usage);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="gap-1.5">
            <Sparkles className="h-4 w-4" /> AI
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {usage && (
            <>
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                {usage.calls_today} / {usage.daily_limit} AI calls today
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setModal("summary")}>
            <FileText className="h-4 w-4" aria-hidden /> Generate summary
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setModal("tailor")}>
            <Target className="h-4 w-4" aria-hidden /> Tailor to job description
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {modal === "summary" && <GenerateSummaryModal onClose={() => setModal(null)} />}
      {modal === "tailor" && <TailorModal onClose={() => setModal(null)} />}
    </>
  );
}
