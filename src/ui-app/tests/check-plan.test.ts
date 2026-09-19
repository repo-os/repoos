/**
 * The declarative check plan (#0446): how `repoos.toml` becomes the list of
 * steps `repoos check` runs, and how a profile / changed-path run selects from
 * it.
 *
 * The behaviour this locks down is the point of #0446: a repo runs exactly the
 * commands it declares (Go gets `go`, Rust gets `cargo`, Android gets
 * `./gradlew`), a step that is excluded says why instead of vanishing, and a
 * repo with no plan at all gets NO steps — never a vacuous green.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import {
  CHECK_PLAN_VERSION,
  EMPTY_MARKERS,
  FULL_PROFILE,
  formatPlanToml,
  globToRegExp,
  hasLegacyCheckConfig,
  resolveCheckPlan,
  selectSteps,
  stepInProfile,
  stepMatchesChanged,
  type CheckStep,
  type RepoMarkers,
} from "../../core/check-plan.js";
import { parseCheckArgs } from "../../commands/check.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmpRepo(toml = ""): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-plan-"));
  roots.push(d);
  if (toml !== "") writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

function markers(over: Partial<RepoMarkers> = {}): RepoMarkers {
  return { ...EMPTY_MARKERS, ...over };
}

function step(over: Partial<CheckStep> = {}): CheckStep {
  return {
    name: "s",
    command: "true",
    timeoutMs: 1000,
    required: true,
    profiles: [],
    whenChanged: [],
    requires: [],
    dependsOn: [],
    ...over,
  };
}

describe("loadConfig — [[check.steps]] parsing", () => {
  it("reads the plan version, default profile and step rows", () => {
    const root = tmpRepo(`[check]
version = 1
defaultProfile = "default"

[[check.steps]]
name = "go-build"
command = "go build ./..."
requires = ["go"]
timeoutMs = 300000

[[check.steps]]
name = "go-test"
kind = "tests"
required = false
profiles = ["full"]
whenChanged = ["backend/**"]
dependsOn = ["go-build"]
`);
    const cfg = loadConfig(root);
    expect(cfg.check?.version).toBe(1);
    expect(cfg.check?.defaultProfile).toBe("default");
    expect(cfg.check?.steps).toEqual([
      {
        name: "go-build",
        command: "go build ./...",
        requires: ["go"],
        timeoutMs: 300000,
      },
      {
        name: "go-test",
        kind: "tests",
        required: false,
        profiles: ["full"],
        whenChanged: ["backend/**"],
        dependsOn: ["go-build"],
      },
    ]);
  });

  it("ignores unusable rows and non-numeric timeouts rather than failing to load", () => {
    const root = tmpRepo(`[check]
version = "one"

[[check.steps]]
command = "go build ./..."

[[check.steps]]
name = "dropped"

[[check.steps]]
name = "ok"
command = "true"
timeoutMs = "500"
`);
    const cfg = loadConfig(root);
    // A non-integer version is ignored; the plan still resolves at v1.
    expect(cfg.check?.version).toBeUndefined();
    // A row with no name is kept (the step gets a generated one later); a row
    // with only a name and nothing to run is kept here too and dropped by the
    // plan resolver, which is where the "needs kind or command" warning lives.
    expect(cfg.check?.steps?.map((s) => s.name)).toEqual([undefined, "dropped", "ok"]);
    expect(cfg.check?.steps?.[2].timeoutMs).toBe(500);
  });
});

describe("resolveCheckPlan — where the plan comes from", () => {
  it("runs exactly the declared steps, for any stack", () => {
    const root = tmpRepo(`[check]
version = 1

[[check.steps]]
name = "build"
command = "go build ./..."

[[check.steps]]
name = "tests"
command = "go test ./..."
`);
    const plan = resolveCheckPlan({ check: loadConfig(root).check, markers: markers() });
    expect(plan.source).toBe("declared");
    expect(plan.version).toBe(CHECK_PLAN_VERSION);
    expect(plan.steps.map((s) => s.command)).toEqual(["go build ./...", "go test ./..."]);
    expect(plan.warnings).toEqual([]);
    expect(plan.errors).toEqual([]);
  });

  it("keeps legacy [check] keys working, with a migration warning", () => {
    const root = tmpRepo(`[check]
uiSmoke = "bun run smoke"
uiStylesheet = "src/app.css"
`);
    expect(hasLegacyCheckConfig(loadConfig(root).check)).toBe(true);
    const plan = resolveCheckPlan({ check: loadConfig(root).check, markers: markers() });
    expect(plan.source).toBe("legacy");
    // Same coverage as before #0446: the JS guards plus the stylesheet ones.
    expect(plan.steps.map((s) => s.name)).toEqual([
      "staleness",
      "lockfile-sync",
      "zero-runtime-deps",
      "check-fmt:check",
      "check-lint",
      "build",
      "css-layers",
      "theme-contrast",
      "bare-require",
      "task-assets",
      "tests",
      "ui-smoke",
    ]);
    // …with fmt/lint still gating build/tests/smoke.
    expect(plan.steps.find((s) => s.name === "build")?.dependsOn).toEqual([
      "check-fmt:check",
      "check-lint",
    ]);
    expect(plan.warnings.join(" ")).toMatch(/--print-plan/);
  });

  it("infers a Go plan from go.mod alone", () => {
    const plan = resolveCheckPlan({ check: undefined, markers: markers({ hasGoMod: true }) });
    expect(plan.source).toBe("inferred");
    // The stack's own commands, bookended by the two RepoOS-generic guards —
    // and nothing JS-shaped anywhere.
    expect(plan.steps.map((s) => s.name)).toEqual(["staleness", "build", "tests", "task-assets"]);
    expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual([
      "go build ./...",
      "go test ./...",
    ]);
    expect(
      plan.steps.filter((s) => s.kind === "staleness" || s.kind === "task-assets").length,
    ).toBe(2);
    expect(plan.warnings.join(" ")).toMatch(/inferred/i);
  });

  it("infers a Rust plan including the formatter's own check mode", () => {
    const plan = resolveCheckPlan({ check: undefined, markers: markers({ hasCargoToml: true }) });
    expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual([
      "cargo build",
      "cargo fmt --check",
      "cargo test",
    ]);
  });

  it("prefers the committed Gradle wrapper over a PATH gradle", () => {
    const plan = resolveCheckPlan({ check: undefined, markers: markers({ hasGradlew: true }) });
    expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual([
      "./gradlew assemble",
      "./gradlew test",
    ]);
    // The wrapper is committed, so no `gradle` binary is required.
    expect(plan.steps.filter((s) => s.command).every((s) => s.requires.length === 0)).toBe(true);
  });

  it("falls back to a PATH gradle when there is no wrapper", () => {
    const plan = resolveCheckPlan({
      check: undefined,
      markers: markers({ hasGradleBuild: true }),
    });
    expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual([
      "gradle build",
      "gradle test",
    ]);
    expect(plan.steps.filter((s) => s.command).every((s) => s.requires.includes("gradle"))).toBe(
      true,
    );
  });

  it("infers a JS plan from package.json scripts only, never an unconditional build", () => {
    const plan = resolveCheckPlan({
      check: undefined,
      markers: markers({
        hasPackageJson: true,
        hasBunLock: true,
        scripts: { "fmt:check": "oxfmt --check", lint: "oxlint", test: "vitest run" },
      }),
    });
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "staleness",
      "lockfile-sync",
      "format",
      "lint",
      "tests",
      "task-assets",
    ]);
    // No build script → no build step. That is the #0446 fix.
    expect(plan.steps.some((s) => s.name === "build")).toBe(false);
  });

  it("mixes stacks in one plan when the repo is mixed", () => {
    const plan = resolveCheckPlan({
      check: undefined,
      markers: markers({
        hasGoMod: true,
        hasPackageJson: true,
        scripts: { build: "vite build", test: "vitest run" },
      }),
    });
    // Both stacks run, and the second one is name-tagged rather than dropped.
    expect(plan.steps.map((s) => s.name)).toEqual([
      "staleness",
      "build",
      "tests",
      "build-js",
      "tests-js",
      "task-assets",
    ]);
    expect(plan.steps.map((s) => s.command).filter(Boolean)).toEqual([
      "go build ./...",
      "go test ./...",
    ]);
  });

  it("yields an EMPTY plan (never a green one) when nothing is recognised", () => {
    const plan = resolveCheckPlan({ check: undefined, markers: markers() });
    expect(plan.source).toBe("empty");
    expect(plan.steps).toEqual([]);
  });

  it("reports an unknown kind and drops the row rather than failing the gate", () => {
    const plan = resolveCheckPlan({
      check: {
        steps: [
          { name: "bogus", kind: "typecheck" },
          { name: "ok", command: "true" },
        ],
      },
      markers: markers(),
    });
    expect(plan.steps.map((s) => s.name)).toEqual(["ok"]);
    expect(plan.warnings.join(" ")).toMatch(/unknown kind "typecheck"/);
  });

  it("drops a row with neither kind nor command", () => {
    const plan = resolveCheckPlan({
      check: { steps: [{ name: "empty" }] },
      markers: markers(),
    });
    expect(plan.steps).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/needs either/);
  });

  it("fails loudly on a plan version from the future", () => {
    const plan = resolveCheckPlan({
      check: { version: 99, steps: [{ name: "build", command: "true" }] },
      markers: markers(),
    });
    expect(plan.errors.join(" ")).toMatch(/newer than this repoos build/);
  });

  it("ignores duplicate step names instead of letting dependsOn match the wrong one", () => {
    const plan = resolveCheckPlan({
      check: {
        steps: [
          { name: "build", command: "go build ./..." },
          { name: "build", command: "cargo build" },
        ],
      },
      markers: markers(),
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].command).toBe("go build ./...");
    expect(plan.warnings.join(" ")).toMatch(/duplicate name "build"/);
  });
});

describe("selectSteps — profiles and changed paths", () => {
  const plan = {
    version: 1,
    defaultProfile: "default",
    source: "declared" as const,
    warnings: [],
    errors: [],
    steps: [
      step({ name: "always", command: "true" }),
      step({ name: "slow", command: "true", profiles: ["full"] }),
      step({ name: "backend", command: "true", whenChanged: ["backend/**"] }),
    ],
  };

  it("runs every step under the full profile", () => {
    const selected = selectSteps(plan, { profile: FULL_PROFILE });
    expect(selected.every((s) => !s.skip)).toBe(true);
  });

  it("excludes a step held back from the default profile, and says why", () => {
    const selected = selectSteps(plan, { profile: "default" });
    const slow = selected.find((s) => s.step.name === "slow");
    expect(slow?.skip?.reason).toBe("profile");
    expect(slow?.skip?.detail).toMatch(/not in profile "default"/);
  });

  it("scopes whenChanged steps to changed paths", () => {
    const selected = selectSteps(plan, {
      profile: "default",
      changedPaths: ["backend/api.go", "README.md"],
    });
    expect(selected.find((s) => s.step.name === "backend")?.skip).toBeUndefined();
    expect(selected.find((s) => s.step.name === "always")?.skip).toBeUndefined();
  });

  it("skips a whenChanged step when nothing it watches changed", () => {
    const selected = selectSteps(plan, { profile: "default", changedPaths: ["README.md"] });
    const backend = selected.find((s) => s.step.name === "backend");
    expect(backend?.skip?.reason).toBe("changed");
    expect(backend?.skip?.detail).toMatch(/no changed path matches/);
  });

  it("treats a full run as unscoped — whenChanged never narrows it", () => {
    const selected = selectSteps(plan, { profile: "default" });
    expect(selected.find((s) => s.step.name === "backend")?.skip).toBeUndefined();
  });

  it("stepInProfile: an unprofiled step belongs to every profile", () => {
    expect(stepInProfile(step(), "anything")).toBe(true);
    expect(stepInProfile(step({ profiles: ["ci"] }), "ci")).toBe(true);
    expect(stepInProfile(step({ profiles: ["ci"] }), "default")).toBe(false);
  });
});

describe("glob matching for whenChanged", () => {
  it("matches nested paths with **", () => {
    const s = step({ whenChanged: ["backend/**"] });
    expect(stepMatchesChanged(s, ["backend/api.go"])).toBe(true);
    expect(stepMatchesChanged(s, ["frontend/app.ts"])).toBe(false);
  });

  it("matches a bare directory as its whole subtree", () => {
    const s = step({ whenChanged: ["work"] });
    expect(stepMatchesChanged(s, ["work/0446-x.md"])).toBe(true);
    expect(stepMatchesChanged(s, ["workflow/ci.yml"])).toBe(false);
  });

  it("matches single-segment wildcards and file extensions", () => {
    expect(globToRegExp("*.go").test("main.go")).toBe(true);
    expect(globToRegExp("*.go").test("pkg/main.go")).toBe(false);
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
  });

  it("treats a step with no whenChanged as always relevant", () => {
    expect(stepMatchesChanged(step(), [])).toBe(true);
  });
});

describe("formatPlanToml — the migration aid behind --print-plan", () => {
  it("emits parseable [[check.steps]] for a legacy plan", () => {
    const plan = resolveCheckPlan({ check: { uiSmoke: "bun run smoke" }, markers: markers() });
    const root = tmpRepo(formatPlanToml(plan));
    const reparsed = resolveCheckPlan({ check: loadConfig(root).check, markers: markers() });
    expect(reparsed.source).toBe("declared");
    expect(reparsed.steps.map((s) => s.name)).toEqual(plan.steps.map((s) => s.name));
  });

  it("keeps a step's cwd, requirements and dependencies", () => {
    const root = tmpRepo(`[check]
version = 1

[[check.steps]]
name = "build"
command = "go build ./..."
cwd = "backend"
requires = ["go"]
whenChanged = ["backend/**"]
required = false
timeoutMs = 120000
`);
    const plan = resolveCheckPlan({ check: loadConfig(root).check, markers: markers() });
    const toml = formatPlanToml(plan);
    expect(toml).toContain('cwd = "backend"');
    expect(toml).toContain('requires = ["go"]');
    expect(toml).toContain("required = false");
    // A default timeout isn't worth restating.
    expect(toml).not.toContain("timeoutMs = 600000");
  });
});

describe("parseCheckArgs — repoos check flags", () => {
  it("reads --profile, --changed and --print-plan", () => {
    expect(parseCheckArgs(["--profile", "full"])).toEqual({ profile: "full" });
    expect(parseCheckArgs(["--changed", "main"])).toEqual({ changed: "main" });
    expect(parseCheckArgs(["--print-plan"])).toEqual({ printPlan: true });
  });

  it("ignores unknown flags rather than failing the gate on them", () => {
    expect(parseCheckArgs(["--nope"])).toEqual({});
    expect(parseCheckArgs([])).toEqual({});
  });
});
