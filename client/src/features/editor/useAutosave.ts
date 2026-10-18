import { useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { Resume } from "@/api/generated/model";
import {
  getGetResumeQueryKey,
  getListResumesQueryKey,
  usePatchResume,
} from "@/api/generated/resumes/resumes";

import type { EditorValues } from "./editorSchema";

export type SaveStatus = "saved" | "saving" | "unsaved" | "retrying" | "error";

const DEBOUNCE_MS = 800;
const MAX_BACKOFF_MS = 30_000;
/** Honor the server's `Retry-After` up to this (the `writes` throttle window is a minute). */
const MAX_RETRY_AFTER_MS = 120_000;
/** After the editor closes, nobody's watching: give its last save this many retries. */
const CLOSED_MAX_ATTEMPTS = 5;

/**
 * How long to wait before retrying a failed save, or null if retrying won't help.
 * Transient: 429 (honors `Retry-After`), 5xx, and network errors (an axios error
 * with no response). Anything else (other 4xx, cancellations, bugs) isn't retried.
 * Without `Retry-After`: exponential backoff from 2s, capped at 30s.
 */
export function retryDelay(err: unknown, attempt: number): number | null {
  const ax = err as AxiosError;
  if (!ax?.isAxiosError || ax.code === "ERR_CANCELED") return null;
  const res = ax.response;
  if (res && res.status !== 429 && res.status < 500) return null;
  const header = res?.headers?.["retry-after"];
  if (header !== undefined) {
    const secs = Number(header);
    const ms = Number.isFinite(secs) ? secs * 1000 : new Date(String(header)).getTime() - Date.now();
    if (Number.isFinite(ms)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(1000, ms));
  }
  return Math.min(MAX_BACKOFF_MS, 2000 * 2 ** attempt);
}

// Which editor instance owns saving each résumé. An editor that has closed keeps
// retrying its last save only while it's still the owner; reopening the résumé
// hands ownership (and any edits the server never got) to the new editor.
const owners = new Map<string, symbol>();
// Résumés whose latest edits hadn't reached the server when their editor closed,
// with those edits (so a reopened editor can tell whether its form still has them).
const unsaved = new Map<string, string>();
// The latest save per résumé, across editor instances. Each save waits for the one
// before it, so a closed editor's slow save can't land after a newer one.
const lastSave = new Map<string, Promise<void>>();

const snapshotOf = (values: EditorValues) => JSON.stringify(values);

/**
 * Debounced autosave. Watches the form, and after the user pauses, validates and
 * PATCHes the resume. Invalid input (e.g. a malformed email) holds in "unsaved"
 * until fixed, so we never send a request the server would reject.
 *
 * Cache coherence (so re-entering the editor always shows the latest edits):
 *  - on save success, write the saved resume into the `getResume` cache + invalidate the dashboard list;
 *  - on unmount, optimistically write current edits into the cache AND flush a final save, so navigating
 *    away mid-debounce never loses the last edits or shows stale data on return.
 *
 * Failed saves that may succeed later (rate-limited, server error, offline) are retried with backoff,
 * showing "retrying": without limit while the editor is open, up to CLOSED_MAX_ATTEMPTS after it closes.
 * A newer edit's save always supersedes a retry. If the résumé is reopened while its last save is still
 * failing, the new editor starts "unsaved" and saves those edits itself.
 *
 * `flush()` saves a pending edit right away (before a snapshot or restore reads the server copy) and
 * resolves `true` when nothing is left unsaved. `abandonPending()` drops a pending edit so the unmount
 * save/cache write is skipped (used when a restore is about to replace the form).
 */
export interface Autosave {
  status: SaveStatus;
  flush: () => Promise<boolean>;
  abandonPending: () => void;
}

export function useAutosave(id: string, methods: UseFormReturn<EditorValues>): Autosave {
  const patch = usePatchResume();
  const queryClient = useQueryClient();
  const mutateRef = useRef(patch.mutateAsync);
  useEffect(() => {
    mutateRef.current = patch.mutateAsync;
  }, [patch.mutateAsync]);

  // Edits a previous editor for this résumé couldn't save. They reach this form through the
  // query cache; if the cache has since dropped them, the form shows the server copy and
  // there's nothing to inherit (don't claim edits that aren't here).
  const [inherited] = useState(() => {
    const saved = unsaved.get(id);
    if (saved === undefined) return false;
    if (saved === snapshotOf(methods.getValues())) return true;
    unsaved.delete(id);
    return false;
  });
  const [token] = useState(() => Symbol(id));
  const [status, setStatus] = useState<SaveStatus>(inherited ? "unsaved" : "saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(inherited);
  // Bumped on every change. A save only clears `pending` if nothing changed while
  // it was in flight, so edits typed during a PATCH are never marked as saved.
  const edits = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);
  const attempts = useRef(0); // consecutive failures while open
  const closedAttempts = useRef(0); // failures after the editor closed (capped)
  // A retry calls the latest saveNow through this ref (saveNow can't reference itself).
  const saveRef = useRef<(() => Promise<void>) | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const isOwner = useCallback(() => owners.get(id) === token, [id, token]);
  /** A closed editor is done (saved or gave up): stop claiming the résumé. */
  const release = useCallback(() => {
    if (isOwner()) owners.delete(id);
  }, [id, isOwner]);

  const cacheLocalEdits = useCallback(() => {
    const v = methods.getValues();
    const prev = queryClient.getQueryData<Resume>(getGetResumeQueryKey(id));
    if (prev) {
      queryClient.setQueryData<Resume>(getGetResumeQueryKey(id), {
        ...prev,
        title: v.title,
        template: v.template,
        document_font: v.documentFont,
        section_order: v.sectionOrder,
        content: v.content,
      });
    }
  }, [id, methods, queryClient]);

  const saveNow = useCallback((): Promise<void> => {
    const prior = lastSave.get(id);
    const run = (async () => {
      if (prior) await prior.catch(() => {}); // keep this résumé's writes in order
      // While this waited, the résumé may have been reopened: a closed editor stands down.
      if (!mounted.current && !isOwner()) return;
      const valid = await methods.trigger();
      if (!valid) {
        if (mounted.current) setStatus("unsaved");
        else release(); // stays in `unsaved`, so reopening shows the edits as unsaved
        return;
      }
      const at = edits.current;
      const v = methods.getValues();
      if (mounted.current) setStatus("saving");
      try {
        const updated = await mutateRef.current({
          id,
          data: {
            title: v.title,
            template: v.template,
            document_font: v.documentFont,
            section_order: v.sectionOrder,
            content: v.content,
          },
        });
        queryClient.setQueryData(getGetResumeQueryKey(id), updated);
        queryClient.invalidateQueries({ queryKey: getListResumesQueryKey() });
        attempts.current = 0;
        closedAttempts.current = 0;
        if (edits.current === at) {
          pending.current = false;
          if (isOwner()) unsaved.delete(id);
          if (mounted.current) setStatus("saved");
          else release();
        }
      } catch (err) {
        // A newer edit since this save started has its own save coming; let it win.
        if (edits.current !== at) return;
        const open = mounted.current;
        const tries = open ? attempts : closedAttempts;
        const delay = retryDelay(err, tries.current);
        if (delay === null || (!open && tries.current >= CLOSED_MAX_ATTEMPTS)) {
          if (open) setStatus("error");
          else release();
          return;
        }
        tries.current += 1;
        if (open) setStatus("retrying");
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          // A closed editor only keeps trying while it still owns this résumé.
          if (mounted.current || isOwner()) void saveRef.current?.();
        }, delay);
      }
    })();
    inFlight.current = run;
    lastSave.set(id, run);
    void run.finally(() => {
      if (inFlight.current === run) inFlight.current = null;
      if (lastSave.get(id) === run) lastSave.delete(id);
    });
    return run;
  }, [id, methods, queryClient, isOwner, release]);
  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);

  useEffect(() => {
    mounted.current = true;
    owners.set(id, token); // a closed editor still retrying this résumé stands down
    if (pending.current) timer.current = setTimeout(() => void saveNow(), DEBOUNCE_MS); // inherited edits

    const subscription = methods.watch(() => {
      edits.current += 1;
      attempts.current = 0;
      pending.current = true;
      setStatus("unsaved");
      clearTimer();
      timer.current = setTimeout(() => void saveNow(), DEBOUNCE_MS);
    });

    return () => {
      subscription.unsubscribe();
      mounted.current = false;
      clearTimer();
      if (pending.current) {
        unsaved.set(id, snapshotOf(methods.getValues())); // cleared when the save lands
        cacheLocalEdits(); // reflect latest edits immediately for a fast re-entry
        void saveNow(); // persist to the server (retried a few times if it fails)
      } else {
        release();
      }
    };
  }, [id, token, methods, saveNow, cacheLocalEdits, release]);

  const flush = useCallback(async () => {
    clearTimer();
    if (inFlight.current) await inFlight.current; // let a save already underway finish
    clearTimer(); // ...and if it failed, this save replaces its scheduled retry
    if (pending.current) await saveNow();
    return !pending.current;
  }, [saveNow]);

  const abandonPending = useCallback(() => {
    clearTimer();
    pending.current = false;
    if (isOwner()) unsaved.delete(id);
  }, [id, isOwner]);

  return { status, flush, abandonPending };
}
