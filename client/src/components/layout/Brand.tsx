import { FileText } from "lucide-react";

/**
 * The ResumeIQ lockup: mark + wordmark. Interim mark until the Claude Design logo lands
 * (`docs/design/logo-brief.md`); swapping it in only touches this file.
 */
export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <span className="font-semibold text-foreground">ResumeIQ</span>
    </span>
  );
}
