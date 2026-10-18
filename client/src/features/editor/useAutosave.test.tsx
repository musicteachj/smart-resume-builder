import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/api/generated/resumes/resumes", () => ({
  usePatchResume: () => ({ mutateAsync: patch }),
  getGetResumeQueryKey: (id: string) => ["resume", id],
  getListResumesQueryKey: () => ["resumes"],
}));

import type { EditorValues } from "./editorSchema";
import { retryDelay, useAutosave } from "./useAutosave";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function useHarness(id = "r1", title = "R") {
  // No resolver: validation isn't what's under test here. `title` stands in for values
  // the editor would load from the query cache.
  const methods = useForm<EditorValues>({
    defaultValues: { title, template: "classic", documentFont: "", sectionOrder: [] },
  });
  return { methods, autosave: useAutosave(id, methods) };
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

const httpError = (status: number, headers: Record<string, string> = {}) => ({
  isAxiosError: true,
  response: { status, headers, data: {} },
});
const networkError = () => ({ isAxiosError: true, code: "ERR_NETWORK", message: "Network Error" });

describe("retryDelay", () => {
  it("honors Retry-After on a 429", () => {
    expect(retryDelay(httpError(429, { "retry-after": "7" }), 0)).toBe(7000);
  });

  it("backs off on 5xx and network errors, capped at 30s", () => {
    expect(retryDelay(httpError(503), 0)).toBe(2000);
    expect(retryDelay(httpError(502), 2)).toBe(8000);
    expect(retryDelay(networkError(), 10)).toBe(30_000);
  });

  it("waits the full Retry-After the throttle asks for (up to 2 minutes)", () => {
    expect(retryDelay(httpError(429, { "retry-after": "55" }), 0)).toBe(55_000);
    expect(retryDelay(httpError(429, { "retry-after": "999" }), 0)).toBe(120_000);
  });

  it("doesn't retry errors that won't fix themselves", () => {
    expect(retryDelay(httpError(400), 0)).toBeNull();
    expect(retryDelay(httpError(404), 0)).toBeNull();
    expect(retryDelay(new TypeError("x is undefined"), 0)).toBeNull(); // a bug, not the network
    expect(retryDelay({ isAxiosError: true, code: "ERR_CANCELED" }, 0)).toBeNull();
  });
});

describe("useAutosave retries", () => {
  beforeEach(() => {
    patch.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("retries a rate-limited save after Retry-After, then shows saved", async () => {
    patch.mockRejectedValueOnce(httpError(429, { "retry-after": "3" })).mockResolvedValue({ id: "r1" });
    const { result } = renderHook(useHarness, { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));

    await act(() => vi.advanceTimersByTimeAsync(800)); // debounce → first save fails
    expect(result.current.autosave.status).toBe("retrying");
    expect(patch).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(3000)); // retry succeeds
    expect(patch).toHaveBeenCalledTimes(2);
    expect(result.current.autosave.status).toBe("saved");
  });

  it("shows an error and stops on a non-transient failure", async () => {
    patch.mockRejectedValue(httpError(400));
    const { result } = renderHook(useHarness, { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.autosave.status).toBe("error");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("a new edit replaces the scheduled retry with a fresh save", async () => {
    patch.mockRejectedValueOnce(httpError(503)).mockResolvedValue({ id: "r1" });
    const { result } = renderHook(useHarness, { wrapper });
    act(() => result.current.methods.setValue("title", "One"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // fails; retry scheduled in 2s
    act(() => result.current.methods.setValue("title", "Two"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // debounce save of "Two"
    await act(() => vi.advanceTimersByTimeAsync(5000)); // the old retry must not fire
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1][0].data.title).toBe("Two");
  });

  it("caps retries for a save that fails after the editor closes (incl. one in flight)", async () => {
    let failFirst: (e: unknown) => void = () => {};
    patch.mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)));
    patch.mockRejectedValue(httpError(503));
    const { result, unmount } = renderHook(() => useHarness("closed-cap"), { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // debounced save starts, held open
    unmount(); // the final save also runs and fails
    await act(async () => failFirst(httpError(503)));
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    const calls = patch.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(7); // 2 initial saves + at most 5 retries
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(patch.mock.calls.length).toBe(calls); // and then it stops
  });

  it("a reopened editor takes over edits the closed one couldn't save", async () => {
    patch.mockRejectedValue(httpError(503));
    const first = renderHook(() => useHarness("reopen"), { wrapper });
    act(() => first.result.current.methods.setValue("title", "Edited"));
    first.unmount(); // final save fails; a retry is scheduled
    await act(() => vi.advanceTimersByTimeAsync(0));
    const before = patch.mock.calls.length;

    patch.mockResolvedValue({ id: "reopen" });
    // The reopened form shows the unsaved edits (in the app, via the query cache).
    const second = renderHook(() => useHarness("reopen", "Edited"), { wrapper });
    expect(second.result.current.autosave.status).toBe("unsaved"); // not a false "Saved"
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(second.result.current.autosave.status).toBe("saved");

    const afterReopen = patch.mock.calls.length;
    expect(afterReopen).toBe(before + 1); // the new editor saved once
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(patch.mock.calls.length).toBe(afterReopen); // the closed editor stood down
  });

  it("an edit during a failing save doesn't leave a duplicate save behind", async () => {
    let failFirst: (e: unknown) => void = () => {};
    patch.mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)));
    patch.mockResolvedValue({ id: "typing" });
    const { result } = renderHook(() => useHarness("typing"), { wrapper });
    act(() => result.current.methods.setValue("title", "One"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // save "One" in flight
    act(() => result.current.methods.setValue("title", "Two")); // debounce armed
    await act(async () => failFirst(httpError(503))); // "One" fails: "Two"'s save supersedes it
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1][0].data.title).toBe("Two");
    expect(result.current.autosave.status).toBe("saved");
  });

  it("flush leaves no stray retry behind", async () => {
    let failFirst: (e: unknown) => void = () => {};
    patch.mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)));
    patch.mockResolvedValue({ id: "flush" });
    const { result } = renderHook(() => useHarness("flush"), { wrapper });
    act(() => result.current.methods.setValue("title", "Edited"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // save in flight
    let clean = false;
    await act(async () => {
      const flushing = result.current.autosave.flush();
      failFirst(httpError(503)); // fails and schedules a retry...
      clean = await flushing; // ...which flush's own save replaces
    });
    expect(clean).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("doesn't claim edits a reopened form no longer has (cache expired)", async () => {
    patch.mockRejectedValue(httpError(503));
    const first = renderHook(() => useHarness("expired"), { wrapper });
    act(() => first.result.current.methods.setValue("title", "Edited"));
    first.unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    // Reopened with the server copy: the edits aren't in this form, so no false "Unsaved"/"Saved".
    const second = renderHook(() => useHarness("expired", "R"), { wrapper });
    expect(second.result.current.autosave.status).toBe("saved");
  });

  it("orders saves across editors: a reopened editor's save waits for the closed one's", async () => {
    const order: string[] = [];
    let finishOld: (v: unknown) => void = () => {};
    patch.mockImplementationOnce(
      () => new Promise((r) => (finishOld = () => (order.push("old"), r({ id: "order" })))),
    );
    patch.mockImplementation(async () => (order.push("new"), { id: "order" }));
    const first = renderHook(() => useHarness("order"), { wrapper });
    act(() => first.result.current.methods.setValue("title", "Edited"));
    first.unmount(); // final save in flight, held open
    await act(() => vi.advanceTimersByTimeAsync(0));

    const second = renderHook(() => useHarness("order", "Edited"), { wrapper });
    act(() => second.result.current.methods.setValue("title", "Newer"));
    await act(() => vi.advanceTimersByTimeAsync(800)); // new save queued behind the old one
    expect(order).toEqual([]);
    await act(async () => finishOld(undefined));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(order).toEqual(["old", "new"]);
  });
});

