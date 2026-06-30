import { Check } from "lucide-react";

import type { ResumeContent } from "@/api/generated/model";
import { Modal } from "@/components/ui/Modal";
import { ResumeDocument } from "@/features/templates/ResumeDocument";
import { DOCUMENT_FONTS, TEMPLATES } from "@/features/templates/templates";
import { cn } from "@/lib/utils";

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: ResumeContent;
  value: string;
  onSelect: (id: string) => void;
  fontValue: string;
  onSelectFont: (id: string) => void;
}

/**
 * Template + font picker modal. Each card is a live, scaled-down ResumeDocument of the
 * user's actual content (DRY — the preview is the real document), so previews are always
 * accurate and reflect the currently selected font. Picking a template closes the modal;
 * picking a font keeps it open so the change is visible in every preview.
 */
export function TemplateGallery({
  open,
  onOpenChange,
  content,
  value,
  onSelect,
  fontValue,
  onSelectFont,
}: TemplateGalleryProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Choose a template"
      description="Live preview of your résumé in each style."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TEMPLATES.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${t.label} template`}
              onClick={() => {
                onSelect(t.id);
                onOpenChange(false);
              }}
              className={cn(
                "flex flex-col overflow-hidden rounded-md border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent/60",
              )}
            >
              <div className="relative h-44 overflow-hidden bg-white">
                {/* 816px ≈ 8.5in Letter width at 96dpi; scaled into the thumbnail. Non-interactive. */}
                <div
                  className="pointer-events-none absolute left-0 top-0 origin-top-left"
                  style={{ width: 816, transform: "scale(0.23)" }}
                  aria-hidden
                >
                  <ResumeDocument content={content} template={t.id} documentFont={fontValue} />
                </div>
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                )}
              </div>
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{t.label}</span>
                  {selected && <span className="text-xs font-medium text-accent">Selected</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Document font — applied independent of the template (ATS-safe faces only). */}
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">Document font</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          ATS-safe typefaces. “Default” uses each template’s built-in font.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <FontChip label="Default" selected={!fontValue} onClick={() => onSelectFont("")} />
          {DOCUMENT_FONTS.map((f) => (
            <FontChip
              key={f.id}
              label={f.label}
              family={f.family}
              selected={fontValue === f.id}
              onClick={() => onSelectFont(f.id)}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function FontChip({
  label,
  family,
  selected,
  onClick,
}: {
  label: string;
  family?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={family ? { fontFamily: family } : undefined}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-accent text-foreground ring-2 ring-accent"
          : "border-border text-foreground hover:bg-surface-variant",
      )}
    >
      {label}
    </button>
  );
}
