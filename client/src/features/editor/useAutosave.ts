import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { Resume } from "@/api/generated/model";
import {
  getGetResumeQueryKey,
  getListResumesQueryKey,
  usePatchResume,
} from "@/api/generated/resumes/resumes";

import type { EditorValues } from "./editorSchema";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

const DEBOUNCE_MS = 800;

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

  const [status, setStatus] = useState<SaveStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  // Bumped on every change. A save only clears `pending` if nothing changed while
  // it was in flight, so edits typed during a PATCH are never marked as saved.
  const edits = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

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

  const saveNow = useCallback(
    (announce: boolean): Promise<void> => {
      const run = (async () => {
        const valid = await methods.trigger();
        if (!valid) {
          if (announce) setStatus("unsaved");
          return;
        }
        const at = edits.current;
        const v = methods.getValues();
        if (announce) setStatus("saving");
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
          if (edits.current === at) {
            pending.current = false;
            if (announce) setStatus("saved");
          }
        } catch {
          if (announce) setStatus("error");
        }
      })();
      inFlight.current = run;
      void run.finally(() => {
        if (inFlight.current === run) inFlight.current = null;
      });
      return run;
    },
    [id, methods, queryClient],
  );

  useEffect(() => {
    const subscription = methods.watch(() => {
      edits.current += 1;
      pending.current = true;
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNow(true), DEBOUNCE_MS);
    });

    return () => {
      subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) {
        cacheLocalEdits(); // reflect latest edits immediately for a fast re-entry
        void saveNow(false); // persist to the server
      }
    };
  }, [methods, saveNow, cacheLocalEdits]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current; // let a debounced save already underway finish
    if (pending.current) await saveNow(true);
    return !pending.current;
  }, [saveNow]);

  const abandonPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = false;
  }, []);

  return { status, flush, abandonPending };
}
