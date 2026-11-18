import { Copy, FileText, MoreVertical, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";

import type { ResumeList } from "@/api/generated/model";
import { Card } from "@/components/ui/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { getTemplate } from "@/features/templates/templates";
import { relativeTime } from "@/lib/format";

interface ResumeCardProps {
  resume: ResumeList;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * One résumé on the dashboard. The whole card is clickable, but the only control that
 * opens it is the title link (its ::after stretches over the card), so the options menu
 * isn't nested inside another interactive element and the title stays a real heading.
 */
export function ResumeCard({ resume, onDuplicate, onDelete }: ResumeCardProps) {
  const shownSkills = resume.skills.slice(0, 3);
  const extra = resume.skills.length - shownSkills.length;
  const cardRef = useRef<HTMLDivElement>(null);

  // Menus are non-modal (see DropdownMenu), so a press outside the open menu also reaches
  // what's under it. On this card that's the stretched title link, and clicking the card
  // to dismiss the menu would open the editor. Swallow that one click; the press only
  // closes the menu.
  const swallowNextClickInside = (event: Event) => {
    if (!(event.target instanceof Node) || !cardRef.current?.contains(event.target)) return;
    const swallow = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    document.addEventListener("click", swallow, { capture: true, once: true });
    // If the press never becomes a click (dragged off, canceled), don't eat a later one.
    document.addEventListener(
      "pointerup",
      () => setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 0),
      { once: true },
    );
  };

  return (
    <Card
      ref={cardRef}
      role="article"
      aria-labelledby={`resume-${resume.id}-title`}
      className="group relative overflow-hidden p-5 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-medium"
    >
      {/* 3px accent left bar on hover */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-accent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-variant text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
        {/* Above the stretched title link, so it gets its own clicks. */}
        <div className="relative z-[1]">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Options for ${resume.title}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent onPointerDownOutside={swallowNextClickInside}>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <h2 id={`resume-${resume.id}-title`} className="mt-4 font-display text-lg font-semibold text-foreground">
        <Link
          to={`/resumes/${resume.id}`}
          className="after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        >
          {resume.title}
        </Link>
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Updated {relativeTime(resume.updated_at)} · {getTemplate(resume.template).label} template
      </p>

      {resume.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {shownSkills.map((s) => (
            <span key={s} className="rounded-sm bg-surface-variant px-2 py-0.5 text-xs text-muted-foreground">
              {s}
            </span>
          ))}
          {extra > 0 && (
            <span className="rounded-sm bg-surface-variant px-2 py-0.5 text-xs text-muted-foreground">
              +{extra}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
