import { Fragment, type ReactNode } from "react";

import type { PersonalInfo, ResumeContent } from "@/api/generated/model";
import { cn } from "@/lib/utils";

import { normalizeSectionOrder, type SectionKey } from "./sections";
import { getDocumentFontFamily, getTemplate } from "./templates";

/**
 * The resume document itself — an ATS-safe rendering of the content. This is the
 * SINGLE source for both the editor's live preview and the Phase 6 PDF export
 * ("preview === PDF"). It uses document fonts (Georgia / Arial), never the app's
 * Newsreader/Inter, and no app accent color.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(value?: string | null): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : m[1];
}

function dateRange(start?: string, end?: string | null): string {
  const s = formatMonth(start);
  if (!s) return "";
  return `${s} – ${end ? formatMonth(end) : "Present"}`;
}

function joinTruthy(parts: (string | undefined)[], sep: string): string {
  return parts.filter((p) => p && p.trim()).join(sep);
}

const LINK_FIELDS: { key: "linkedin" | "github" | "website"; label: string }[] = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "github", label: "GitHub" },
  { key: "website", label: "Website" },
];

/** Only treat http(s) URLs as safe to link — never javascript:/data: (stored-XSS guard). */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Profile links rendered as labeled, clickable links ("LinkedIn · GitHub · Website")
 * instead of raw URLs. A present-but-non-http(s) value falls back to plain label text,
 * so a malicious scheme never becomes an href.
 */
function DocumentLinks({ pi, className }: { pi: PersonalInfo; className?: string }) {
  const links = LINK_FIELDS
    .map(({ key, label }) => ({ label, url: pi[key] }))
    .filter((l): l is { label: string; url: string } => Boolean(l.url && l.url.trim()));
  if (links.length === 0) return null;
  return (
    <p className={className}>
      {links.map((l, i) => (
        <span key={l.label}>
          {i > 0 && "  ·  "}
          {isHttpUrl(l.url) ? (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {l.label}
            </a>
          ) : (
            l.label
          )}
        </span>
      ))}
    </p>
  );
}

interface ResumeDocumentProps {
  content: ResumeContent;
  template?: string;
  /** Optional document typeface override (slug from DOCUMENT_FONTS); blank = template default. */
  documentFont?: string;
  /** Optional custom order of the content sections; empty/absent = canonical order. */
  sectionOrder?: string[];
  className?: string;
}

export function ResumeDocument({
  content,
  template = "classic",
  documentFont,
  sectionOrder,
  className,
}: ResumeDocumentProps) {
  const style = getTemplate(template);
  const fontFamily = getDocumentFontFamily(documentFont);
  const { personalInfo: pi, summary, workExperience, education, skills, projects } = content;

  const contactLine = joinTruthy([pi.email, pi.phone, pi.location], "  ·  ");

  // Each content section, keyed; null when empty so it's skipped. Rendered in the
  // user's saved order (header stays pinned above, regardless of order).
  const sections: Record<SectionKey, ReactNode> = {
    summary: summary ? (
      <Section title="Summary" variant={style.heading}>
        <p className="text-[12.5px] leading-relaxed text-[#222]">{summary}</p>
      </Section>
    ) : null,
    experience: workExperience.length > 0 ? (
      <Section title="Experience" variant={style.heading}>
        <div className="space-y-3">
          {workExperience.map((w) => (
            <div key={w.id}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[13px] font-bold">{w.position || "Position"}</h3>
                <span className="shrink-0 text-[11px] text-[#555]">
                  {dateRange(w.startDate, w.endDate)}
                </span>
              </div>
              {joinTruthy([w.company, w.location], " · ") && (
                <p className="text-[12px] italic text-[#444]">
                  {joinTruthy([w.company, w.location], " · ")}
                </p>
              )}
              {w.bullets && w.bullets.filter(Boolean).length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] leading-snug text-[#222]">
                  {w.bullets.filter(Boolean).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>
    ) : null,
    education: education.length > 0 ? (
      <Section title="Education" variant={style.heading}>
        <div className="space-y-2">
          {education.map((e) => (
            <div key={e.id}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[13px] font-bold">{e.school || "School"}</h3>
                <span className="shrink-0 text-[11px] text-[#555]">
                  {formatMonth(e.graduationDate)}
                </span>
              </div>
              <p className="text-[12px] italic text-[#444]">
                {joinTruthy([joinTruthy([e.degree, e.field], ", "), e.gpa && `GPA ${e.gpa}`], " · ")}
              </p>
            </div>
          ))}
        </div>
      </Section>
    ) : null,
    skills: skills.length > 0 ? (
      <Section title="Skills" variant={style.heading}>
        <p className="text-[12px] leading-relaxed text-[#222]">{skills.join("  ·  ")}</p>
      </Section>
    ) : null,
    projects: projects && projects.length > 0 ? (
      <Section title="Projects" variant={style.heading}>
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id}>
              <h3 className="text-[13px] font-bold">{p.name || "Project"}</h3>
              {p.description && (
                <p className="text-[12px] leading-snug text-[#222]">{p.description}</p>
              )}
              {p.technologies && p.technologies.length > 0 && (
                <p className="text-[11px] text-[#555]">{p.technologies.join(" · ")}</p>
              )}
            </div>
          ))}
        </div>
      </Section>
    ) : null,
  };

  return (
    <article
      // When a user font is chosen, the inline fontFamily overrides the template's
      // Tailwind font class; otherwise the class (Georgia/Arial) applies.
      style={fontFamily ? { fontFamily } : undefined}
      className={cn(
        "bg-white p-[var(--doc-pad)] text-[#1a1a1a] [--doc-pad:clamp(28px,4vw,52px)] print:[--doc-pad:0px]",
        style.font === "sans" ? "font-document-sans" : "font-document",
        className,
      )}
    >
      {/* Header — plain (classic/modern) or full-bleed banner */}
      {style.header === "banner" ? (
        <header
          data-testid="doc-header"
          data-header="banner"
          className="mb-5 bg-[#2B3A55] px-[var(--doc-pad)] pb-5 pt-[var(--doc-pad)] text-left text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
          style={{
            marginInline: "calc(-1 * var(--doc-pad))",
            marginTop: "calc(-1 * var(--doc-pad))",
          }}
        >
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {pi.name || "Your Name"}
          </h1>
          {pi.headline && <p className="mt-0.5 text-[13px] text-[#d7dce6]">{pi.headline}</p>}
          {contactLine && <p className="mt-2 text-[11px] text-[#c2cad8]">{contactLine}</p>}
          <DocumentLinks pi={pi} className="mt-1 text-[11px] text-[#c2cad8]" />
        </header>
      ) : (
        <header
          data-testid="doc-header"
          data-header="plain"
          className={cn(
            "border-b border-[#d9d6d0] pb-4",
            style.headerAlign === "center" ? "text-center" : "text-left",
          )}
        >
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {pi.name || "Your Name"}
          </h1>
          {pi.headline && <p className="mt-0.5 text-[13px] text-[#555]">{pi.headline}</p>}
          {contactLine && <p className="mt-2 text-[11px] text-[#444]">{contactLine}</p>}
          <DocumentLinks pi={pi} className="mt-1 text-[11px] text-[#444]" />
        </header>
      )}

      {normalizeSectionOrder(sectionOrder).map((key) => (
        <Fragment key={key}>{sections[key]}</Fragment>
      ))}
    </article>
  );
}

function Section({
  title,
  variant = "ruled",
  children,
}: {
  title: string;
  variant?: "ruled" | "minimal";
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2
        className={cn(
          "mb-2 uppercase",
          variant === "minimal"
            ? "text-[10.5px] font-semibold tracking-[0.2em] text-[#666]"
            : "border-b border-[#d9d6d0] pb-1 text-[11px] font-bold tracking-[0.12em] text-[#333]",
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
