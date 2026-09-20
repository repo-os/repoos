/**
 * The Checks surface data layer (#0447): `resolveCheckPlanView` explains the
 * plan for a selected profile — which steps run, why the rest don't, which
 * declared prerequisites are missing, and what the last run did. The endpoint
 * must never execute anything or call a missing tool a success, so these tests
 * assert the view's explanation, not an execution.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { resolveCheckPlanView } from "../../server/check-plan-info.js";
import { writeCheckRun } from "../../core/check-results-store.js";
import type { RepoOSConfig } from "../../core/types.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function cfg(root: string): RepoOSConfig {
  return { root, check: loadConfig(root).check, cacheDir: ".repoos" } as RepoOSConfig;
}

function tmpRepo(toml: string): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-plan-view-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

const DECLARED = `[check]
version = 1

[[check.steps]]
name = "go-build"
command = "go build ./..."
requires = ["definitely-not-installed-xyz"]

[[check.steps]]
name = "go-test"
command = "go test ./..."
whenChanged = ["**/*.go"]

[[check.steps]]
name = "contract"
command = "make contract"

[[check.steps]]
name = "release-smoke"
command = "make release"
profiles = ["release"]
`;

describe("resolveCheckPlanView", () => {
  it("explains declared steps, their scope and their declared prerequisites", () => {
    const root = tmpRepo(DECLARED);
    const view = resolveCheckPlanView(cfg(root));
    expect(view.source).toBe("declared");
    expect(view.profile).toBe("default");
    // default, the named profile the plan declares, and the universal full one.
    expect(view.profiles).toEqual(["default", "release", "full"]);
    expect(view.steps.map((s) => s.name)).toEqual([
      "go-build",
      "go-test",
      "contract",
      "release-smoke",
    ]);

    const build = view.steps[0];
    expect(build.selected).toBe(true);
    expect(build.requires).toEqual(["definitely-not-installed-xyz"]);
    // A missing tool is never a pass: it is named, with install advice.
    expect(build.missing.map((m) => m.tool)).toEqual(["definitely-not-installed-xyz"]);
    expect(build.missing[0].hint).toMatch(/PATH/);

    // `contract` has no whenChanged — it is the cross-cutting step.
    expect(view.steps[2].crossCutting).toBe(true);
    expect(view.steps[1].crossCutting).toBe(false);
  });

  it("lists named profiles and marks a step held back from the default with why", () => {
    const root = tmpRepo(DECLARED);
    const view = resolveCheckPlanView(cfg(root), { profile: "release" });
    expect(view.profile).toBe("release");
    expect(view.profiles).toEqual(["default", "release", "full"]);
    const smoke = view.steps.find((s) => s.name === "release-smoke")!;
    expect(smoke.selected).toBe(true);
    expect(smoke.skip).toBeUndefined();

    const dflt = resolveCheckPlanView(cfg(root));
    const heldBack = dflt.steps.find((s) => s.name === "release-smoke")!;
    expect(heldBack.selected).toBe(false);
    expect(heldBack.skip?.reason).toBe("profile");
    expect(heldBack.skip?.detail).toMatch(/not in profile "default"/);
  });

  it("surfaces the last recorded run", () => {
    const root = tmpRepo(DECLARED);
    writeCheckRun(root, {
      profile: "default",
      source: "declared",
      startedAt: "2026-09-20T00:00:00.000Z",
      finishedAt: "2026-09-20T00:01:00.000Z",
      durationMs: 60_000,
      passed: false,
      results: [
        {
          name: "go-build",
          status: "missing-prereq",
          durationMs: 0,
          required: true,
          detail: "missing prerequisite: definitely-not-installed-xyz",
        },
      ],
    });
    const view = resolveCheckPlanView(cfg(root));
    expect(view.lastRun?.passed).toBe(false);
    expect(view.lastRun?.results[0].status).toBe("missing-prereq");
    expect(view.lastRun?.durationMs).toBe(60_000);
  });

  it("degrades to an empty view for a repo with no recognisable plan", () => {
    const d = mkdtempSync(join(tmpdir(), "repoos-plan-view-empty-"));
    roots.push(d);
    const view = resolveCheckPlanView(cfg(d));
    expect(view.source).toBe("empty");
    expect(view.steps).toEqual([]);
    expect(view.lastRun).toBeNull();
  });

  it("warns rather than errors on a changed ref git cannot resolve", () => {
    const root = tmpRepo(DECLARED);
    const view = resolveCheckPlanView(cfg(root), { changedRef: "no-such-ref-xyz" });
    expect(view.warnings.join(" ")).toMatch(/no-such-ref-xyz/);
    // The full plan is shown instead of a silently-empty selection: no step is
    // skipped for a changed-path reason.
    expect(view.steps.some((s) => s.name === "go-build" && s.selected)).toBe(true);
    expect(view.steps.some((s) => s.skip?.reason === "changed")).toBe(false);
  });
});
