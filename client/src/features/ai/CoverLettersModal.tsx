import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import {
  getListCoverLettersQueryKey,
  useDeleteCoverLetter,
  useListCoverLetters,
} from "@/api/generated/cover-letters/cover-letters";
import type { CoverLetter } from "@/api/generated/model";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { downloadBlob, safeFileName } from "@/lib/download";

import { CoverLetterEditor } from "./CoverLetterEditor";

/** Manage a résumé's saved cover letters: list, open/edit, generate new, delete. */
export function CoverLettersModal({ onClose }: { onClose: () => void }) {
  const { id: resumeId = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const list = useListCoverLetters({ resume: resumeId });
  const del = useDeleteCoverLetter();

  const [view, setView] = useState<"list" | "editor">("list");
  const [editing, setEditing] = useState<CoverLetter | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CoverLetter | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListCoverLettersQueryKey({ resume: resumeId }) });

  const open = (letter: CoverLetter | null) => {
    setEditing(letter);
    setView("editor");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await del.mutateAsync({ id: pendingDelete.id });
    setPendingDelete(null);
    void invalidate();
  };

  const copy = (letter: CoverLetter) => void navigator.clipboard.writeText(letter.body);
  const download = (letter: CoverLetter) =>
    downloadBlob(`${safeFileName(letter.title)}.txt`, new Blob([letter.body], { type: "text/plain;charset=utf-8" }));

  const letters = list.data ?? [];

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        size="lg"
        title="Cover letters"
        description="Saved cover letters for this résumé."
      >
        {view === "editor" ? (
          <CoverLetterEditor
            resumeId={resumeId}
            letter={editing}
            onBack={() => setView("list")}
            onSaved={() => {
              void invalidate();
              setView("list");
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={() => open(null)}>
                <Plus className="h-4 w-4" /> New cover letter
              </Button>
            </div>
            {list.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            ) : letters.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No saved cover letters yet — generate one.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {letters.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <button className="min-w-0 flex-1 text-left" onClick={() => open(l)}>
                      <div className="truncate font-medium">{l.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.body.split("\n")[0]}</div>
                    </button>
                    <Button variant="ghost" size="icon" aria-label="Copy" onClick={() => copy(l)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Download" onClick={() => download(l)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete this cover letter"
                      onClick={() => setPendingDelete(l)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete cover letter?"
        description={pendingDelete ? `"${pendingDelete.title}" will be permanently removed.` : undefined}
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
