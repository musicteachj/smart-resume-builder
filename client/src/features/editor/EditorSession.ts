import { createContext, useContext } from "react";

import type { Resume } from "@/api/generated/model";

/**
 * Editor-wide actions for components deep in the tree (top-bar modals) that need to
 * coordinate with autosave. Null outside the editor, so callers treat it as optional.
 */
export interface EditorSession {
  resumeId: string;
  /** Save any pending edit now; resolves true when nothing is left unsaved. */
  flush: () => Promise<boolean>;
  /** A restore replaced the résumé on the server: show it in the editor. */
  onRestored: (resume: Resume) => void;
}

const EditorSessionContext = createContext<EditorSession | null>(null);

export const EditorSessionProvider = EditorSessionContext.Provider;

export function useEditorSession(): EditorSession | null {
  return useContext(EditorSessionContext);
}

/** For components that only ever render inside the editor. */
export function useRequiredEditorSession(): EditorSession {
  const session = useContext(EditorSessionContext);
  if (!session) throw new Error("useRequiredEditorSession must be used inside the editor");
  return session;
}
