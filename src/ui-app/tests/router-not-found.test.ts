// @vitest-environment jsdom
/**
 * #1252 — unknown paths resolve to the friendly not-found view instead of
 * silently redirecting to the dashboard. Known routes, and their query
 * params, keep resolving to their own named route.
 */
import { describe, expect, it } from "vitest";
import { router } from "../src/router.js";

describe("route table: unknown paths and deep links", () => {
  it.each([
    ["/no-such-page", "not-found"],
    ["/work/extra/segments", "not-found"],
    ["/tasks/9999", "not-found"],
    ["/tasks/9999/bogus", "not-found"],
  ])("%s resolves to the not-found view", (path, name) => {
    const resolved = router.resolve(path);
    expect(resolved.name).toBe(name);
    // A real redirect would hide the bad link; the not-found view must keep it.
    expect(resolved.redirectedFrom).toBeUndefined();
  });

  it.each([
    ["/", "dashboard"],
    ["/work", "work"],
    ["/work?task=1252&tab=changes", "work"],
    ["/settings?tab=notifications&section=general", "settings"],
    ["/tasks/1252/diff", "diff"],
  ])("%s still resolves to %s", (path, name) => {
    expect(router.resolve(path).name).toBe(name);
  });
});
