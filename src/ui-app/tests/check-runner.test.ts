/**
 * The check-plan execution engine (#0446): fixture repos for the four stacks
 * the gate has to serve, and the five ways a step can end.
 *
 * The acceptance criterion these cover is "a Go-only fixture, a
 * Gradle/Android fixture, a Rust fixture and a mixed web-plus-backend fixture
 * each run only their declared commands" — proven by pointing every fixture's
 * commands at fake binaries that log every invocation, then asserting on the
 * log. Nothing here runs a real build.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { resolveCheckPlan, type CheckPlan } from "../../core/check-plan.js";
import {
  detectRepoMarkers,
  hasBinary,
  installHint,
  missingBinaries,
  runCommand,
} from "../../core/check-runner.js";
import { changedPathsSince, runCheckPlan } from "../../commands/check.js";

interface Fixture {
  root: string;
  /** Directory of fake executables, prepended to PATH for the test. */
  binDir: string;
  /** Every fake binary invocation is appended here, one line per call. */
  log: string;
}

const dirs: string[] = [];
const originalPath = process.env.PATH ?? "";

afterEach(() => {
  process.env.PATH = originalPath;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

/**
 * Stand in for a toolchain binary. Each call appends `<name> <args>` and its
 * working directory to the fixture log, so a test can assert not just that a
 * command ran but that nothing else did.
 */
function fakeBin(dir: string, name: string, log: string, exitCode = 0): void {
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> "${log}"\nprintf 'cwd:%s\\n' "$PWD" >> "${log}"\nexit ${exitCode}\n`,
  );
  chmodSync(path, 0o755);
}

function fixture(toml: string, opts: { bins?: string[]; dirs?: string[] } = {}): Fixture {
  const root = tmpDir("repoos-fixture-");
  const binDir = tmpDir("repoos-bin-");
  // The log lives inside binDir so it is cleaned up with the fixture instead
  // of being left behind in the system temp directory.
  const log = join(binDir, "calls.log");
  dirs.push(binDir);
  writeFileSync(join(root, "repoos.toml"), toml);
  for (const d of opts.dirs ?? []) mkdirSync(join(root, d), { recursive: true });
  for (const b of opts.bins ?? []) fakeBin(binDir, b, log);
  // A `./gradlew` wrapper lives in the repo, not on PATH.
  if ((opts.bins ?? []).includes("gradlew")) fakeBin(root, "gradlew", log);
  process.env.PATH = `${binDir}${originalPath ? `:${originalPath}` : ""}`;
  return { root, binDir, log };
}

function planFor(root: string): CheckPlan {
  return resolveCheckPlan({
    check: loadConfig(root).check,
    markers: detectRepoMarkers(root),
    bunRunner: false,
  });
}

function logLines(f: Fixture): string[] {
  if (!existsSync(f.log)) return [];
  return readFileSync(f.log, "utf8").split("\n").filter(Boolean);
}

/** Commands that ran (the `<name> <args>` lines, without cwd markers). */
function commandsRun(f: Fixture): string[] {
  return logLines(f).filter((l) => !l.startsWith("cwd:"));
}

const GO_TOML = `[check]
version = 1

[[check.steps]]
name = "build"
command = "go build ./..."
requires = ["go"]

[[check.steps]]
name = "tests"
command = "go test ./..."
requires = ["go"]
`;

describe("runCheckPlan — one stack per fixture, only declared commands", () => {
  it("a Go-only repo runs go and nothing else", async () => {
    const f = fixture(GO_TOML, { bins: ["go"], dirs: [] });
    writeFileSync(join(f.root, "go.mod"), "module example.com/api\n");
    const plan = planFor(f.root);
    expect(plan.source).toBe("declared");

    const results = await runCheckPlan(plan, { repoRoot: f.root });
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["build", "passed"],
      ["tests", "passed"],
    ]);
    expect(commandsRun(f)).toEqual(["go build ./...", "go test ./..."]);
    // No JS/RepoOS pipeline was assumed: no bun, no npm, no package.json step.
    expect(commandsRun(f).join(" ")).not.toMatch(/\b(bun|npm|cargo|gradlew)\b/);
  });

  it("a Gradle/Android repo runs the committed wrapper, with no gradle on PATH", async () => {
    const f = fixture(
      `[check]
version = 1

[[check.steps]]
name = "build"
command = "./gradlew assemble"

[[check.steps]]
name = "tests"
command = "./gradlew test"
`,
      { bins: ["gradlew"] },
    );
    // The wrapper is the project's own; `gradle` is deliberately NOT installed.
    expect(hasBinary("gradle")).toBe(false);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results.every((r) => r.status === "passed")).toBe(true);
    // The wrapper is what ran — not a `gradle` off PATH.
    expect(commandsRun(f)).toEqual(["gradlew assemble", "gradlew test"]);
  });

  it("a Rust repo runs cargo build/test and skips a step whose paths didn't change", async () => {
    const f = fixture(
      `[check]
version = 1

[[check.steps]]
name = "build"
command = "cargo build"
requires = ["cargo"]

[[check.steps]]
name = "tests"
command = "cargo test"
requires = ["cargo"]

[[check.steps]]
name = "format"
command = "cargo fmt --check"
whenChanged = ["crates/**"]
`,
      { bins: ["cargo"] },
    );
    const results = await runCheckPlan(planFor(f.root), {
      repoRoot: f.root,
      changedPaths: ["README.md"],
    });
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["build", "passed"],
      ["tests", "passed"],
      ["format", "skipped"],
    ]);
    // An explicit skip says why — it never reads as a pass.
    expect(results[2].detail).toMatch(/^skipped — no changed path matches/);
    expect(commandsRun(f)).toEqual(["cargo build", "cargo test"]);
  });

  it("a mixed web + backend repo runs each step in its own cwd", async () => {
    const f = fixture(
      `[check]
version = 1

[[check.steps]]
name = "web-build"
command = "npm run build"
cwd = "web"

[[check.steps]]
name = "api-test"
command = "go test ./..."
cwd = "api"
requires = ["go"]
`,
      { bins: ["npm", "go"], dirs: ["web", "api"] },
    );
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results.every((r) => r.status === "passed")).toBe(true);
    expect(commandsRun(f)).toEqual(["npm run build", "go test ./..."]);
    const cwds = logLines(f).filter((l) => l.startsWith("cwd:"));
    // macOS `mkdtempSync` returns a /var path whose real path is /private/var;
    // compare the directory the step was declared to run in, not the prefix.
    expect(cwds[0].replace("cwd:", "")).toMatch(/\/web$/);
    expect(cwds[1].replace("cwd:", "")).toMatch(/\/api$/);
  });

  it("a monorepo step reads the package.json of its own cwd, not the root's", async () => {
    const f = fixture(
      `[check]
version = 1

[[check.steps]]
name = "web-build"
kind = "build"
cwd = "web"

[[check.steps]]
name = "root-build"
kind = "build"
`,
      { bins: ["bun"], dirs: ["web"] },
    );
    // Only the sub-package has a build script (and a lockfile, so Bun is the runner).
    writeFileSync(join(f.root, "package.json"), JSON.stringify({ name: "root" }));
    writeFileSync(
      join(f.root, "web", "package.json"),
      JSON.stringify({ name: "web", scripts: { build: "vite build" } }),
    );
    writeFileSync(join(f.root, "web", "bun.lock"), "");

    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["web-build", "passed"],
      // The root declares no build script, so the step skips instead of
      // running a build that doesn't exist.
      ["root-build", "skipped"],
    ]);
    expect(results[1].detail).toMatch(/no `build` script in package.json/);
    expect(commandsRun(f)).toEqual(["bun run build"]);
    expect(logLines(f).find((l) => l.startsWith("cwd:"))).toMatch(/\/web$/);
  });

  it("runs nothing for a repo with no plan at all (the gate fails instead)", async () => {
    const f = fixture(`workDir = "work"\n`);
    const plan = planFor(f.root);
    expect(plan.steps).toEqual([]);
    const results = await runCheckPlan(plan, { repoRoot: f.root });
    expect(results).toEqual([]);
    expect(commandsRun(f)).toEqual([]);
  });
});

describe("runCheckPlan — a step that doesn't apply skips before prerequisites are checked", () => {
  it("lockfile-sync skips for a repo with no bun.lock even when bun isn't installed", async () => {
    // The regression: legacy plans give lockfile-sync `requires = ["bun"]`
    // unconditionally. Checking that before the handler's own applicability
    // test turned "no Bun pipeline here" into a hard failure on Node-only
    // machines — a compatibility break for repos still on the legacy keys.
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "lockfile-sync"
kind = "lockfile-sync"
requires = ["bun"]
`);
    // Whether bun is installed here is irrelevant: the step must skip either
    // way, because there is no bun.lock to check.
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("skipped");
    expect(results[0].detail).toMatch(/no bun\.lock/);
  });

  it("a build step with no build script skips instead of failing on a missing runner", async () => {
    const f = fixture(
      `[check]
version = 1

[[check.steps]]
name = "build"
kind = "build"
requires = ["definitely-not-a-real-tool"]
`,
      { dirs: [] },
    );
    writeFileSync(join(f.root, "package.json"), JSON.stringify({ name: "x" }));
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("skipped");
    expect(results[0].detail).toMatch(/no `build` script/);
  });

  it("a step that DOES apply still fails on a missing prerequisite", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "build"
kind = "build"
requires = ["definitely-not-a-real-tool"]
`);
    writeFileSync(
      join(f.root, "package.json"),
      JSON.stringify({ name: "x", scripts: { build: "true" } }),
    );
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("missing-prereq");
    expect(results[0].detail).toMatch(/definitely-not-a-real-tool/);
  });
});

describe("runCheckPlan — the tests kind runs the project's own runner", () => {
  it("uses npm for a repo with no bun.lock, and bun for one with", async () => {
    const npm = fixture(
      `[check]
version = 1

[[check.steps]]
name = "tests"
kind = "tests"
`,
      { bins: ["npm"] },
    );
    writeFileSync(
      join(npm.root, "package.json"),
      JSON.stringify({ name: "x", scripts: { test: "vitest run" } }),
    );
    const npmResults = await runCheckPlan(planFor(npm.root), { repoRoot: npm.root });
    expect(npmResults[0].status).toBe("passed");
    expect(commandsRun(npm)).toEqual(["npm run test"]);

    const bun = fixture(
      `[check]
version = 1

[[check.steps]]
name = "tests"
kind = "tests"
`,
      { bins: ["bun"] },
    );
    writeFileSync(
      join(bun.root, "package.json"),
      JSON.stringify({ name: "x", scripts: { test: "vitest run" } }),
    );
    writeFileSync(join(bun.root, "bun.lock"), "");
    const bunResults = await runCheckPlan(planFor(bun.root), { repoRoot: bun.root });
    expect(bunResults[0].status).toBe("passed");
    expect(commandsRun(bun)).toEqual(["bun run --bun test"]);
  });
});

describe("runCheckPlan — every outcome is distinguishable", () => {
  it("a command that exits non-zero is a failure that names the exit code", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "build"
command = "false"
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("failed");
    expect(results[0].detail).toMatch(/exit 1/);
    expect(results[0].required).toBe(true);
  });

  it("a step that overruns its timeout is a timeout, not a failure or a pass", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "slow"
command = "sleep 5"
timeoutMs = 1000
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("timeout");
    expect(results[0].detail).toMatch(/timed out after 1s/);
    expect(results[0].durationMs).toBeLessThan(4_000);
  });

  it("a missing prerequisite fails the step with install advice and runs nothing", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "build"
command = "definitely-not-a-real-tool build"
requires = ["definitely-not-a-real-tool"]
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("missing-prereq");
    expect(results[0].detail).toMatch(/missing prerequisite: definitely-not-a-real-tool/);
    // …and the command was never attempted.
    expect(commandsRun(f)).toEqual([]);
  });

  it("an OPTIONAL step's failure never blocks the required steps that depend on it", async () => {
    // The regression: counting an advisory failure as a blocker let a required
    // `build` be skipped as "blocked", so the run could exit 0 without ever
    // building. Optional means advisory — it must not gate anything else.
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "lint"
command = "false"
required = false

[[check.steps]]
name = "build"
command = "true"
dependsOn = ["lint"]
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["lint", "failed"],
      ["build", "passed"],
    ]);
  });

  it("a step blocked by a failed dependency is skipped, naming the cause", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "lint"
command = "false"

[[check.steps]]
name = "build"
command = "true"
dependsOn = ["lint"]
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["lint", "failed"],
      ["build", "skipped"],
    ]);
    expect(results[1].detail).toMatch(/blocked by failed step\(s\): lint/);
  });

  it("an optional step's failure is reported as failed but not required", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "coverage"
command = "false"
required = false
`);
    const results = await runCheckPlan(planFor(f.root), { repoRoot: f.root });
    expect(results[0].status).toBe("failed");
    expect(results[0].required).toBe(false);
  });

  it("a step outside the selected profile is skipped, naming the profile", async () => {
    const f = fixture(`[check]
version = 1

[[check.steps]]
name = "build"
command = "true"

[[check.steps]]
name = "integration"
command = "true"
profiles = ["full"]
`);
    const plan = planFor(f.root);
    const scoped = await runCheckPlan(plan, { repoRoot: f.root, profile: "default" });
    expect(scoped.map((r) => [r.name, r.status])).toEqual([
      ["build", "passed"],
      ["integration", "skipped"],
    ]);
    expect(scoped[1].detail).toMatch(/not in profile "default"/);

    // …and the same plan runs it under --profile full.
    const full = await runCheckPlan(plan, { repoRoot: f.root, profile: "full" });
    expect(full.every((r) => r.status === "passed")).toBe(true);
  });
});

describe("runCommand — the subprocess primitive", () => {
  it("reports a passing command with its exit code and duration", async () => {
    const res = await runCommand({ command: "exit 0", echo: false });
    expect(res.status).toBe("passed");
    expect(res.exitCode).toBe(0);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures output while a command runs", async () => {
    const res = await runCommand({ command: "echo hello-from-the-step", echo: false });
    expect(res.status).toBe("passed");
    expect(res.output).toContain("hello-from-the-step");
  });

  it("reports a non-zero exit as failed, keeping the output for the diagnosis", async () => {
    const res = await runCommand({ command: "echo boom; exit 3", echo: false });
    expect(res.status).toBe("failed");
    expect(res.exitCode).toBe(3);
    expect(res.output).toContain("boom");
  });

  it("kills a command that overruns its timeout", async () => {
    const res = await runCommand({ command: "sleep 30", timeoutMs: 500, echo: false });
    expect(res.status).toBe("timeout");
  });

  it("reports a command that cannot be spawned", async () => {
    const res = await runCommand({
      command: "definitely-not-a-real-tool-xyz arg",
      echo: false,
    });
    expect(res.status).toBe("failed");
    expect(res.exitCode).not.toBe(0);
  });
});

describe("changedPathsSince — a ref git can't resolve is an error, not an empty diff", () => {
  it("returns null for a bogus ref so the gate fails instead of scoping to nothing", () => {
    const root = tmpDir("repoos-ref-");
    expect(changedPathsSince(root, "definitely-not-a-branch")).toBeNull();
  });

  it("returns the changed paths for a real ref", () => {
    const root = tmpDir("repoos-ref-");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "base"], { cwd: root });
    writeFileSync(join(root, "a.txt"), "hello\n");
    execFileSync("git", ["add", "a.txt"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "add a.txt"], { cwd: root });
    expect(changedPathsSince(root, "HEAD~1")).toEqual(["a.txt"]);
  });
});

describe("runCommand — the subprocess primitive", () => {
  it("kills a command's whole process group, so a surviving grandchild can't hold the pipes", async () => {
    // `sh -c` spawns a grandchild that ignores SIGTERM and outlives it;
    // killing only the wrapper would leave the pipes open and `close` pending.
    const res = await runCommand({
      command: "(trap '' TERM; sleep 30) & wait",
      timeoutMs: 700,
      echo: false,
    });
    expect(res.status).toBe("timeout");
    // Resolved promptly rather than waiting out the grandchild's own 30s.
    expect(res.durationMs).toBeLessThan(10_000);
  });
});

describe("prerequisites — install-oriented diagnostics", () => {
  it("finds a real binary and misses an invented one", () => {
    expect(hasBinary("sh")).toBe(true);
    expect(hasBinary("definitely-not-a-real-tool-xyz")).toBe(false);
  });

  it("reports only the missing tools", () => {
    expect(missingBinaries(["sh", "definitely-not-a-real-tool-xyz"])).toEqual([
      "definitely-not-a-real-tool-xyz",
    ]);
  });

  it("gives copy-pasteable install advice per tool", () => {
    expect(installHint("go")).toMatch(/go\.dev/);
    expect(installHint("cargo")).toMatch(/rustup/);
    expect(installHint("gradle")).toMatch(/gradlew|gradle\.org/);
    // …and says something actionable even for a tool it doesn't know.
    expect(installHint("some-tool")).toMatch(/install "some-tool"/);
  });
});
