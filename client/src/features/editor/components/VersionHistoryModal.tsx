import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { memo, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { Resume, ResumeVersion, ResumeVersionList } from "@/api/generated/model";
import {
  getListResumeVersionsQueryKey,
  useCreateResumeVersion,
  useDeleteResumeVersion,
  useGetResumeVersion,
  useListResumeVersions,
  usePatchResumeVersion,
  useRestoreResumeVersion,
} from "@/api/generated/resume-versions/resume-versions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ResumeDocument } from "@/features/templates/ResumeDocument";
import { cn } from "@/lib/utils";

import { toFormValues } from "../editorSchema";
import { useRequiredEditorSession } from "../EditorSession";
import { groupByDay, versionTime, versionTitle } from "../versionLabel";

/** Letter width at 96dpi; the preview is zoomed to fit its pane. */
const PAGE_WIDTH = 816;

const UNSAVED_EDITS =
  "Your latest changes haven't been saved yet. Fix any fields marked in red (or check your connection), then try again.";

/** The API's plain-string `detail`, else a generic message. */
function errorDetail(err: unknown): string {
  return (
    (err as AxiosError<{ detail?: string }>)?.response?.data?.detail ??
    "Something went wrong. Please try again."
  );
}

type Busy = "save" | "rename" | "restore" | "delete" | null;

/**
 * Read-only document preview of one version, zoomed to fit the pane width. `zoom`
 * (unlike transform) also shrinks the layout box, so the scroll height matches what's
 * visible. Inert: its links aren't focusable, matching TemplateGallery's thumbnails.
 */
const SnapshotPreview = memo(function SnapshotPreview({ version }: { version: ResumeVersion }) {
  // A snapshot has the résumé's document fields; normalize it like one so older
  // snapshots (missing newer fields) still render.
  const values = useMemo(() => toFormValues(version as unknown as Resume), [version]);
  const paneRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === "undefined") return;
    const fit = () => setZoom(Math.min(1, Math.max(0.3, (pane.clientWidth - 32) / PAGE_WIDTH)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={paneRef} className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-surface-variant p-4">
      <div
        className="pointer-events-none mx-auto bg-white shadow-medium"
        style={{ width: PAGE_WIDTH, zoom }}
        aria-hidden
        inert
      >
        <ResumeDocument
          content={values.content}
          template={values.template}
          documentFont={values.documentFont}
          sectionOrder={values.sectionOrder}
        />
      </div>
    </div>
  );
});

/** Browse, save, rename, delete, and restore versions of the résumé being edited. */
export function VersionHistoryModal({ onClose }: { onClose: () => void }) {
  const session = useRequiredEditorSession();
  const { resumeId } = session;
  const qc = useQueryClient();
  const list = useListResumeVersions({ resume: resumeId });
  const versions = list.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: ResumeVersionList | null =
    versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const detail = useGetResumeVersion(selected?.id ?? "", { query: { enabled: selected !== null } });

  const create = useCreateResumeVersion();
  const patch = usePatchResumeVersion();
  const del = useDeleteResumeVersion();
  const restore = useRestoreResumeVersion();

  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null); // draft label while renaming
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false); // synchronous guard; `busy` drives the UI
  const [error, setError] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListResumeVersionsQueryKey({ resume: resumeId }) });

  /** Run one action at a time (covers the flush before it, so nothing double-submits). */
  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      setError(errorDetail(err));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  /** The server snapshots its own copy, so pending edits must be saved first. */
  const flushOrStop = async () => {
    if (await session.flush()) return true;
    setError(UNSAVED_EDITS);
    return false;
  };

  const saveVersion = (e: FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      if (!(await flushOrStop())) return;
      const created = await create.mutateAsync({ data: { resume: resumeId, label: name.trim() } });
      setName("");
      setSelectedId(created.id);
      await invalidate();
    });
  };

  const rename = () =>
    void run("rename", async () => {
      if (!selected || renaming === null) return;
      await patch.mutateAsync({ id: selected.id, data: { label: renaming.trim() } });
      setRenaming(null);
      await invalidate();
    });

  const confirmRestore = () => {
    setConfirm(null);
    void run("restore", async () => {
      if (!selected || !(await flushOrStop())) return;
      const restored = await restore.mutateAsync({ id: selected.id });
      void invalidate();
      onClose();
      session.onRestored(restored);
    });
  };

  const confirmDelete = () => {
    setConfirm(null);
    void run("delete", async () => {
      if (!selected) return;
      await del.mutateAsync({ id: selected.id });
      setSelectedId(null);
      await invalidate();
    });
  };

  return (
    <>
      <Modal
        open
        onOpenChange={(o) => {
          if (!o && busy !== "restore") onClose();
        }}
        size="xl"
        title="Version history"
        description="Earlier versions of this résumé. Restoring one saves the current version first, so you can undo it."
      >
        <div className="grid h-[min(70vh,44rem)] grid-cols-[15rem_minmax(0,1fr)] gap-5">
          {/* Save + list */}
          <div className="flex min-h-0 flex-col gap-3">
            <form onSubmit={saveVersion} className="flex gap-2">
              <Input
                aria-label="Version name"
                placeholder="Name this version"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={busy === "save"}
                disabled={busy !== null && busy !== "save"}
              >
                Save
              </Button>
            </form>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {list.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            ) : list.isError ? (
              <div className="space-y-2 py-6 text-center">
                <p role="alert" className="text-sm text-destructive">
                  Couldn't load this résumé's history.
                </p>
                <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                  Try again
                </Button>
              </div>
            ) : versions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No history yet. Versions appear as you edit, or save one now.
              </p>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {groupByDay(versions).map((group) => (
                  <section key={group.heading} aria-label={group.heading}>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.heading}
                    </h3>
                    <ul className="space-y-0.5">
                      {group.versions.map((v) => {
                        const isSelected = v.id === selected?.id;
                        return (
                          <li key={v.id}>
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => {
                                setSelectedId(v.id);
                                setRenaming(null);
                              }}
                              className={cn(
                                "flex w-full items-baseline gap-2 rounded-md border-l-2 px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isSelected
                                  ? "border-accent bg-surface-variant text-foreground"
                                  : "border-transparent text-foreground hover:bg-surface-variant",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">{versionTitle(v)}</span>
                              {v.kind === "manual" && (
                                <span className="rounded-sm bg-surface-variant px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  Saved
                                </span>
                              )}
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {versionTime(v.created_at)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Selected version */}
          <div className="flex min-h-0 flex-col gap-3">
            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renaming !== null ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <Input
                      aria-label="New version name"
                      maxLength={100}
                      value={renaming}
                      onChange={(e) => setRenaming(e.target.value)}
                      autoFocus
                    />
                    <Button type="submit" size="sm" variant="secondary" loading={busy === "rename"}>
                      Save name
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{versionTitle(selected)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(selected.created_at).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => setRenaming(selected.label)}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === "delete"}
                        disabled={busy !== null}
                        onClick={() => setConfirm("delete")}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        loading={busy === "restore"}
                        disabled={busy !== null || !detail.data}
                        onClick={() => setConfirm("restore")}
                      >
                        Restore
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {detail.data ? (
              <SnapshotPreview version={detail.data} />
            ) : selected ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-border bg-surface-variant">
                <Spinner className="h-5 w-5" />
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm === "restore"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Restore this version?"
        description="Your current résumé is saved to history first, so you can undo this."
        confirmLabel="Restore"
        onConfirm={confirmRestore}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this version?"
        description={selected ? `"${versionTitle(selected)}" will be permanently removed from history.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
