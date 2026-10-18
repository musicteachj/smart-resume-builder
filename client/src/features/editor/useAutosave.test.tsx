import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/api/generated/resumes/resumes", () => ({
  usePatchResume: () => ({ mutateAsync: patch }),
  getGetResumeQueryKey: (id: string) => ["resume", id],
  getListResumesQueryKey: () => ["resumes"],
}));

import type { EditorValues } from "./editorSchema";
import { useAutosave } from "./useAutosave";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function useHarness() {
  // No resolver: validation isn't what's under test here.
  const methods = useForm<EditorValues>({
    defaultValues: { title: "R", template: "classic", documentFont: "", sectionOrder: [] },
  });
  return { methods, autosave: useAutosave("r1", methods) };
}

describe("useAutosave", () => {
  beforeEach(() => {
    patch.mockReset();
    patch.mockResolvedValue({ id: "r1" });
  });

  it("flush saves a pending edit right away, without waiting for the debounce", async () => {
    const { result } = renderHook(useHarness, { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));

    let clean = false;
    await act(async () => {
      clean = await result.current.autosave.flush();
    });
    expect(clean).toBe(true);
    expect(patch).toHaveBeenCalledOnce();
    expect(patch.mock.calls[0][0].data.title).toBe("Edited");
  });

  it("flush is a no-op when nothing is pending", async () => {
    const { result } = renderHook(useHarness, { wrapper });
    await act(async () => {
      expect(await result.current.autosave.flush()).toBe(true);
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it("abandonPending skips the save on unmount", () => {
    const { result, unmount } = renderHook(useHarness, { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));
    act(() => result.current.autosave.abandonPending());
    unmount();
    expect(patch).not.toHaveBeenCalled();
  });

  it("flush waits for a save already in flight, then saves edits typed during it", async () => {
    let finishFirst: (v: unknown) => void = () => {};
    patch.mockImplementationOnce(() => new Promise((r) => (finishFirst = r)));
    const { result } = renderHook(useHarness, { wrapper });

    act(() => result.current.methods.setValue("title", "First"));
    let flushing: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      flushing = result.current.autosave.flush(); // starts save #1 (held open)
      await Promise.resolve();
    });
    act(() => result.current.methods.setValue("title", "Second")); // typed while #1 is in flight
    let second: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      second = result.current.autosave.flush();
      finishFirst({ id: "r1" });
      await flushing;
    });
    await act(async () => {
      expect(await second).toBe(true);
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1][0].data.title).toBe("Second");
  });
});
