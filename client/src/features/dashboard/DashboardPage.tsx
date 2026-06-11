import { useQueryClient } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ResumeList } from "@/api/generated/model";
import {
  getListResumesQueryKey,
  useCreateResume,
  useDeleteResume,
  useDuplicateResume,
  useListResumes,
} from "@/api/generated/resumes/resumes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/stores/auth";

import { ResumeCard } from "./ResumeCard";

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: resumes, isLoading } = useListResumes();
  const createResume = useCreateResume();
  const duplicateResume = useDuplicateResume();
  const deleteResume = useDeleteResume();
  const [toDelete, setToDelete] = useState<ResumeList | null>(null);

  const refreshList = () =>
    queryClient.invalidateQueries({ queryKey: getListResumesQueryKey() });

  const handleCreate = async () => {
    const created = await createResume.mutateAsync({
      data: {
        title: "Untitled resume",
        template: "classic",
        content: {
          personalInfo: { name: user?.name ?? "", email: user?.email ?? "" },
          summary: "",
          workExperience: [],
          education: [],
          skills: [],
          projects: [],
        },
      },
    });
    navigate(`/resumes/${created.id}`);
  };

  const handleDuplicate = async (id: string) => {
    await duplicateResume.mutateAsync({ id });
    await refreshList();
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    await deleteResume.mutateAsync({ id: toDelete.id });
    setToDelete(null);
    await refreshList();
  };

  const list = resumes ?? [];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-foreground">Your resumes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : list.length === 0
                ? "No resumes yet"
                : `${list.length} resume${list.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {list.length > 0 && (
          <Button onClick={handleCreate} loading={createResume.isPending} className="gap-2">
            <Plus className="h-4 w-4" /> New resume
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <Card className="mt-8 flex flex-col items-center px-6 py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-variant text-muted-foreground">
            <FileText className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold text-foreground">
            Create your first resume
          </h2>
          <p className="mt-2 max-w-sm text-muted-foreground">
            Start from a clean editorial template, then let AI help you tailor it to any role and
            sharpen every bullet.
          </p>
          <Button onClick={handleCreate} loading={createResume.isPending} className="mt-6 gap-2">
            <Plus className="h-4 w-4" /> New resume
          </Button>
        </Card>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {list.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              onDuplicate={() => handleDuplicate(resume.id)}
              onDelete={() => setToDelete(resume)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete resume?"
        description={
          toDelete
            ? `"${toDelete.title}" will be permanently deleted. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        loading={deleteResume.isPending}
        onConfirm={handleConfirmDelete}
      />
    </main>
  );
}
