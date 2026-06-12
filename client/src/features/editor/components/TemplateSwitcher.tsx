import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

const TEMPLATES: { id: string; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
];

export function TemplateSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const current = TEMPLATES.find((t) => t.id === value) ?? TEMPLATES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <span className="text-muted-foreground">Template:</span> {current.label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {TEMPLATES.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onChange(t.id)}>
            <Check className={t.id === value ? "h-4 w-4" : "h-4 w-4 opacity-0"} />
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
