import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "@/api/queryClient";

import { useAuthStore, isAuthenticated } from "./auth";

const user = { id: "u1", email: "a@b.c", name: "A", is_admin: false } as never;

describe("auth store", () => {
  beforeEach(() =>
    useAuthStore.setState({ user: null, accessToken: null, status: "loading", sessionEnded: false }),
  );

  it("starts in the loading state (bootstrap not yet resolved)", () => {
    expect(useAuthStore.getState().status).toBe("loading");
    expect(isAuthenticated()).toBe(false);
  });

  it("setSession authenticates", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().accessToken).toBe("tok");
    expect(isAuthenticated()).toBe(true);
  });

  it("logout clears tokens and marks unauthenticated", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.status).toBe("unauthenticated");
  });

  it("logout clears the query cache, so the next user never sees cached data", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    queryClient.setQueryData(["/api/resumes/"], [{ id: "r1" }]);
    useAuthStore.getState().logout();
    expect(queryClient.getQueryData(["/api/resumes/"])).toBeUndefined();
  });

  it("logout with sessionEnded remembers that a session in use ended", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    useAuthStore.getState().logout({ sessionEnded: true });
    expect(useAuthStore.getState()).toMatchObject({ status: "unauthenticated", sessionEnded: true });
  });

  it("a plain logout is not a session that ended", () => {
    useAuthStore.getState().setSession({ user, access: "tok" });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().sessionEnded).toBe(false);
  });

  it("a later quiet logout keeps the ended notice", () => {
    useAuthStore.getState().logout({ sessionEnded: true });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().sessionEnded).toBe(true);
  });

  it("clearSessionEnded drops the notice, and a new session does too", () => {
    useAuthStore.getState().logout({ sessionEnded: true });
    useAuthStore.getState().clearSessionEnded();
    expect(useAuthStore.getState().sessionEnded).toBe(false);

    useAuthStore.getState().logout({ sessionEnded: true });
    useAuthStore.getState().setSession({ user, access: "tok" });
    expect(useAuthStore.getState().sessionEnded).toBe(false);
  });
});
