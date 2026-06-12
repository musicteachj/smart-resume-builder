import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Link, useParams } from "react-router-dom";

import type { Resume } from "@/api/generated/model";
import { useGetResume } from "@/api/generated/resumes/resumes";
import { Spinner } from "@/components/ui/Spinner";
import { ResumeDocument } from "@/features/templates/ResumeDocument";

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

  return (
    <FormProvider {...methods}>
      <div className="flex h-dvh flex-col bg-background">
        <EditorTopBar status={status} />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Form */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-border p-5 lg:border-r">
            <CollapsibleSection title="Personal info" description="Name, title, and contact details">
              <PersonalInfoSection />
            </CollapsibleSection>
            <CollapsibleSection title="Summary" description="A short professional overview">
              <SummarySection />
            </CollapsibleSection>
            <CollapsibleSection title="Work experience">
              <ExperienceSection />
            </CollapsibleSection>
            <CollapsibleSection title="Education">
              <EducationSection />
            </CollapsibleSection>
            <CollapsibleSection title="Skills">
              <SkillsSection />
            </CollapsibleSection>
            <CollapsibleSection title="Projects" defaultOpen={false}>
              <ProjectsSection />
            </CollapsibleSection>
          </div>

          {/* Live preview */}
          <div className="min-h-0 overflow-y-auto bg-surface-variant p-6">
            <div className="mx-auto max-w-[816px] shadow-medium">
              <ResumeDocument content={content} template={template} />
            </div>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}
