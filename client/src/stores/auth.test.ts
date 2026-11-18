import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "@/api/queryClient";

import { useAuthStore, isAuthenticated } from "./auth";

const user = { id: "u1", email: "a@b.c", name: "A", is_admin: false } as never;

describe("auth store", () => {
  beforeEach(() => useAuthStore.setState({ user: null, accessToken: null, status: "loading" }));

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
});
