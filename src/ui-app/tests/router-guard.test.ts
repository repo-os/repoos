/**
 * The server already gates every API route and redirects a full-page
 * navigation to /login when auth is enabled (server.ts's auth middleware),
 * but that only covers a fresh document load. A client-side route change
 * inside the already-mounted SPA never round-trips through that middleware,
 * so without a router guard an unauthenticated visitor (or an expired
 * session) landing on any route just renders the dashboard chrome with
 * every API call failing 401 instead of being sent to /login.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { router } from "../src/router";

function mockAuthMe(body: { authEnabled: boolean; authenticated: boolean }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("router auth guard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("redirects an unauthenticated visitor from a protected route to /login", async () => {
    mockAuthMe({ authEnabled: true, authenticated: false });
    await router.push("/");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe("/");
  });

  it("redirects an unauthenticated visitor away from /settings too", async () => {
    mockAuthMe({ authEnabled: true, authenticated: false });
    await router.push("/settings");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe("/settings");
  });

  it("lets an authenticated visitor through", async () => {
    mockAuthMe({ authEnabled: true, authenticated: true });
    await router.push("/work");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/work");
  });

  it("lets any visitor through when auth is disabled", async () => {
    mockAuthMe({ authEnabled: false, authenticated: false });
    await router.push("/settings");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/settings");
  });

  it("never redirects away from /login itself", async () => {
    mockAuthMe({ authEnabled: true, authenticated: false });
    await router.push("/login");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("only checks auth once per store instance, not on every navigation", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ authEnabled: false, authenticated: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await router.push("/");
    await router.isReady();
    await router.push("/work");
    await router.push("/settings");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
