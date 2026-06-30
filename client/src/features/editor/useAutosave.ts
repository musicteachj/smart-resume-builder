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
 */
export function useAutosave(id: string, methods: UseFormReturn<EditorValues>): SaveStatus {
  const patch = usePatchResume();
  const queryClient = useQueryClient();
  const mutateRef = useRef(patch.mutateAsync);
  useEffect(() => {
    mutateRef.current = patch.mutateAsync;
  }, [patch.mutateAsync]);

  const [status, setStatus] = useState<SaveStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

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
    async (announce: boolean) => {
      const valid = await methods.trigger();
      if (!valid) {
        if (announce) setStatus("unsaved");
        return;
      }
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
        pending.current = false;
        if (announce) setStatus("saved");
      } catch {
        if (announce) setStatus("error");
      }
    },
    [id, methods, queryClient],
  );

  useEffect(() => {
    const subscription = methods.watch(() => {
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

  return status;
}
