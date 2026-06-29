import { Copy, FileText, MoreVertical, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

export function ResumeCard({ resume, onDuplicate, onDelete }: ResumeCardProps) {
  const navigate = useNavigate();
  const open = () => navigate(`/resumes/${resume.id}`);
  const shownSkills = resume.skills.slice(0, 3);
  const extra = resume.skills.length - shownSkills.length;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="group relative cursor-pointer overflow-hidden p-5 transition-all hover:-translate-y-1 hover:border-accent hover:shadow-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* 3px accent left bar on hover */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-accent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-variant text-muted-foreground">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Resume options"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-variant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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

      <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{resume.title}</h3>
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
