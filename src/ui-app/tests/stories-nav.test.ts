/**
 * Stories navigation gating and position (#0480). The nav item must appear
 * only when `stories.enabled` is true, and exactly between Work and Checks.
 */
import { describe, expect, it } from "vitest";
import { NAV, navFor, navFromConfig, STORIES_NAV } from "../src/nav";

describe("navFor stories gating", () => {
  it("hides Stories by default and leaves the base nav untouched", () => {
    expect(navFor(false, false, false)).toEqual(NAV);
    expect(navFor(false, false, false).map((n) => n.id)).not.toContain("stories");
  });

  it("places Stories exactly between Work and Checks", () => {
    const ids = navFor(false, false, true).map((n) => n.id);
    expect(ids).toEqual([
      "dashboard",
      "inputs",
      "work",
      "stories",
      "checks",
      "agents",
      "repo",
      "settings",
    ]);
    expect(STORIES_NAV.path).toBe("/stories");
  });

  it("keeps Stories between Work and Checks even with Releases/Deployments on", () => {
    const ids = navFor(true, true, true).map((n) => n.id);
    expect(ids).toEqual([
      "dashboard",
      "inputs",
      "work",
      "stories",
      "checks",
      "releases",
      "deployments",
      "agents",
      "repo",
      "settings",
    ]);
  });
});

describe("navFromConfig stories gate", () => {
  it("enables Stories only for a boolean true", () => {
    expect(navFromConfig({ stories: { enabled: true } }).map((n) => n.id)).toContain("stories");
    expect(navFromConfig({ stories: { enabled: false } }).map((n) => n.id)).not.toContain(
      "stories",
    );
    expect(navFromConfig({ stories: { enabled: "yes" } }).map((n) => n.id)).not.toContain(
      "stories",
    );
    expect(navFromConfig({}).map((n) => n.id)).not.toContain("stories");
    expect(navFromConfig(null).map((n) => n.id)).not.toContain("stories");
  });

  it("still honors the existing release/deployments gates", () => {
    const ids = navFromConfig({ release: { enabled: true }, deployments: [{ name: "x" }] }).map(
      (n) => n.id,
    );
    expect(ids).toContain("releases");
    expect(ids).toContain("deployments");
  });
});
