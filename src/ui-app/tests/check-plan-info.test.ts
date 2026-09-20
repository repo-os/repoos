/**
 * `resolvePipelineCheckPlan` (#0458): the integration pipeline's tooltips render
 * the real merge-gate steps from this repo's `repoos.toml`, so the resolver has
 * to surface labels, commands, timeouts and dependencies with the plan defaults
 * applied — and degrade to an empty plan (never throw) when there is none.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { resolvePipelineCheckPlan } from "../../server/check-plan-info.js";
import type { RepoOSConfig } from "../../core/types.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmpRepo(toml = ""): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-plan-info-"));
  roots.push(d);
  if (toml !== "") writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

describe("resolvePipelineCheckPlan", () => {
  it("resolves declared [[check.steps]] with defaults applied", () => {
    const root = tmpRepo(`[check]
version = 1

[[check.steps]]
name = "compile"
command = "go build ./..."
requires = ["go"]

[[check.steps]]
name = "unit"
kind = "tests"
dependsOn = ["compile"]
timeoutMs = 1200000
required = false
`);
    const plan = resolvePipelineCheckPlan({
      root,
      check: loadConfig(root).check,
    } as RepoOSConfig);

    expect(plan.source).toBe("declared");
    expect(plan.defaultProfile).toBe("default");
    expect(plan.steps.map((s) => s.name)).toEqual(["compile", "unit"]);

    const compile = plan.steps[0];
    expect(compile.command).toBe("go build ./...");
    expect(compile.timeoutMs).toBe(600_000);
    expect(compile.required).toBe(true);
    expect(compile.dependsOn).toEqual([]);

    const unit = plan.steps[1];
    expect(unit.kind).toBe("tests");
    expect(unit.timeoutMs).toBe(1_200_000);
    expect(unit.required).toBe(false);
    expect(unit.dependsOn).toEqual(["compile"]);
  });

  it("never throws and returns an empty plan when there is none", () => {
    const root = tmpRepo("");
    const plan = resolvePipelineCheckPlan({ root, check: undefined } as RepoOSConfig);
    expect(plan.source).toBe("empty");
    expect(plan.steps).toEqual([]);
  });

  it("re-reads the on-disk plan, so an edit mid-run is reflected (#0458)", () => {
    const root = tmpRepo(`[check]
version = 1

[[check.steps]]
name = "one"
command = "echo one"
`);
    const config = { root, check: loadConfig(root).check } as RepoOSConfig;
    expect(resolvePipelineCheckPlan(config).steps.map((s) => s.name)).toEqual(["one"]);

    writeFileSync(
      join(root, "repoos.toml"),
      `[check]
version = 1

[[check.steps]]
name = "two"
command = "echo two"
`,
    );
    // The boot-time config is unchanged, but the tooltip reads the file.
    expect(resolvePipelineCheckPlan(config).steps.map((s) => s.name)).toEqual(["two"]);
  });
});
