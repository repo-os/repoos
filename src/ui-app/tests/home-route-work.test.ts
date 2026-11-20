// @vitest-environment jsdom
/**
 * #1258: Work is the home page. Opening the app root (and so the Hub's start
 * URL, which is the server root) lands on /work; Mission Control moved to
 * /control. Deep links keep working, and unknown paths reach the not-found
 * view (#1252) rather than a redirect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { router } from "../src/router";
import { NAV, navFor } from "../src/nav";

function mockAuthOff(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => ({ authEnabled: false, authenticated: false }),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("home route", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockAuthOff();
  });

  it("opens the app root on Work", async () => {
    await router.push("/");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/work");
    expect(router.currentRoute.value.name).toBe("work");
  });

  it("keeps unknown paths on the not-found view instead of redirecting", async () => {
    await router.push("/no-such-page");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/no-such-page");
    expect(router.currentRoute.value.name).toBe("not-found");
  });

  it("keeps Mission Control on its own /control path", async () => {
    await router.push("/control");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/control");
    expect(router.currentRoute.value.name).toBe("dashboard");
  });

  it("keeps deep links with their query", async () => {
    await router.push("/work?task=1258&tab=changes");
    await router.isReady();
    expect(router.currentRoute.value.path).toBe("/work");
    expect(router.currentRoute.value.query).toEqual({ task: "1258", tab: "changes" });
  });

  it("points the Control nav entry at /control and keeps Work at /work", () => {
    const control = NAV.find((item) => item.id === "dashboard");
    expect(control?.path).toBe("/control");
    expect(NAV.some((item) => item.path === "/")).toBe(false);
    expect(navFor(false).find((item) => item.id === "work")?.path).toBe("/work");
  });
});
