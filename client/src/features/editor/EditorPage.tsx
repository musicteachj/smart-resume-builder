import { zodResolver } from "@hookform/resolvers/zod";
import { arrayMove } from "@dnd-kit/sortable";
import { ArrowLeft } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";

import type { Resume } from "@/api/generated/model";
import { useGetResume } from "@/api/generated/resumes/resumes";
import { SortableList } from "@/components/ui/SortableList";
import { Spinner } from "@/components/ui/Spinner";
import { ResumeDocument } from "@/features/templates/ResumeDocument";
import type { SectionKey } from "@/features/templates/sections";

import { EditorTopBar } from "./EditorTopBar";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { editorSchema, toFormValues, type EditorValues } from "./editorSchema";
import { EducationSection } from "./sections/EducationSection";
import { PersonalInfoSection } from "./sections/PersonalInfoSection";
import { ProjectsSection } from "./sections/ProjectsSection";
import { SkillsSection } from "./sections/SkillsSection";
import { SummarySection } from "./sections/SummarySection";
import { ExperienceSection } from "./sections/ExperienceSection";
import { useAutosave } from "./useAutosave";

/** The reorderable content-section panels (Personal info is pinned, not in here). */
const SECTION_PANELS: Record<
  SectionKey,
  { title: string; description?: string; defaultOpen?: boolean; node: ReactNode }
> = {
  summary: { title: "Summary", description: "A short professional overview", node: <SummarySection /> },
  experience: { title: "Work experience", node: <ExperienceSection /> },
  education: { title: "Education", node: <EducationSection /> },
  skills: { title: "Skills", node: <SkillsSection /> },
  projects: { title: "Projects", defaultOpen: false, node: <ProjectsSection /> },
};

export function EditorPage() {
  const { id } = useParams();
  const { data: resume, isLoading, isError } = useGetResume(id!);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (isError || !resume) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Resume not found</h1>
        <p className="text-muted-foreground">It may have been deleted, or it isn’t yours.</p>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  return <EditorForm resume={resume} />;
}

function EditorForm({ resume }: { resume: Resume }) {
  const methods = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: toFormValues(resume),
    mode: "onChange",
  });
  const status = useAutosave(resume.id, methods);
  const content = useWatch({ control: methods.control, name: "content" });
  const template = useWatch({ control: methods.control, name: "template" });
  const documentFont = useWatch({ control: methods.control, name: "documentFont" });
  const sectionOrder = useWatch({ control: methods.control, name: "sectionOrder" });
  const title = useWatch({ control: methods.control, name: "title" });

  const printRef = useRef<HTMLDivElement>(null);
  const handleExport = useReactToPrint({
    contentRef: printRef,
    documentTitle: title.replace(/[^\w\- ]+/g, "").trim() || "resume",
    pageStyle: "@page { size: letter; margin: 0.5in; }",
  });

  return (
    <FormProvider {...methods}>
      <div className="flex h-dvh flex-col bg-background">
        <EditorTopBar status={status} onExport={() => handleExport()} />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Form */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-border p-5 lg:border-r">
            <CollapsibleSection title="Personal info" description="Name, title, and contact details">
              <PersonalInfoSection />
            </CollapsibleSection>
            {/* Reorderable content sections — drag to change their order in the document. */}
            <SortableList
              items={sectionOrder}
              getId={(key) => key}
              onReorder={(from, to) =>
                methods.setValue("sectionOrder", arrayMove(sectionOrder, from, to), { shouldDirty: true })
              }
            >
              {(key, handle) => {
                const panel = SECTION_PANELS[key as SectionKey];
                return (
                  <CollapsibleSection
                    title={panel.title}
                    description={panel.description}
                    defaultOpen={panel.defaultOpen}
                    handle={handle}
                  >
                    {panel.node}
                  </CollapsibleSection>
                );
              }}
            </SortableList>
          </div>

          {/* Live preview */}
          <div className="min-h-0 overflow-y-auto bg-surface-variant p-6">
            <div className="mx-auto max-w-[816px] shadow-medium">
              <div ref={printRef}>
                <ResumeDocument
                  content={content}
                  template={template}
                  documentFont={documentFont}
                  sectionOrder={sectionOrder}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
