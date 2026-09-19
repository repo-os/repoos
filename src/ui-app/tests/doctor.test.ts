import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  doctorRemediations,
  findConfigValueProblems,
  isKnownConfigKey,
  runDoctor,
  type DoctorReport,
} from "../../core/doctor";

const dirs: string[] = [];

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A hermetic machine: only the tools a test names are "installed". */
function tools(...names: string[]): (t: string) => boolean {
  const set = new Set(names);
  return (t) => set.has(t);
}

/** Initialize a real git repo so `git rev-parse` state checks are exercised. */
function gitInit(dir: string): void {
  const r = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr || r.error?.message}`);
}

/** The default healthy project: git, a work dir, and a declared check plan. */
function cleanProject(): string {
  const dir = tmp("repoos-doctor-clean-");
  gitInit(dir);
  mkdirSync(join(dir, "work"));
  writeFileSync(
    join(dir, "repoos.toml"),
    [
      'workDir = "work"',
      'docsDir = "docs"',
      'cacheDir = ".repoos"',
      "",
      "[check]",
      "version = 1",
      'defaultProfile = "default"',
      "",
      "[[check.steps]]",
      'name = "build"',
      'command = "true"',
      "",
    ].join("\n"),
  );
  return dir;
}

function findingById(report: DoctorReport, id: string) {
  return report.findings.find((f) => f.id === id);
}

describe("runDoctor", () => {
  it("reports a clean, declared-plan project with no warnings or failures", async () => {
    const root = cleanProject();
    const report = await runDoctor({
      root,
      probePort: 1,
      hasBinary: tools("git", "bun", "node"),
    });
    expect(report.project.root).toBe(root);
    expect(report.schemaVersion).toBe(1);
    expect(report.findings.every((f) => f.id && f.title && f.detail)).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.warn).toBe(0);
    expect(findingById(report, "gate.check-plan")?.severity).toBe("pass");
    expect(findingById(report, "lifecycle.server")?.severity).toBe("pass");
  });

  it("fails a repoos.toml syntax error with the offending line", async () => {
    const root = cleanProject();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "unterminated\n');
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git", "bun") });
    const syntax = findingById(report, "config.toml-syntax");
    expect(syntax?.severity).toBe("fail");
    expect(syntax?.detail.toLowerCase()).toContain("line");
    expect(syntax?.remediation).toBeTruthy();
    expect(report.summary.fail).toBeGreaterThan(0);
  });

  it("warns on unrecognized keys and invalid values instead of failing", async () => {
    const root = cleanProject();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        'workDir = "work"',
        'bogusKey = "x"',
        'defaultStatus = "nope"',
        "servePort = 999999",
        "",
        "[check]",
        "version = 1",
        "",
        "[[check.steps]]",
        'name = "build"',
        'command = "true"',
        "",
      ].join("\n"),
    );
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git", "bun") });
    expect(findingById(report, "config.unknown-keys")?.severity).toBe("warn");
    expect(findingById(report, "config.unknown-keys")?.detail).toContain("bogusKey");
    const values = findingById(report, "config.values");
    expect(values?.severity).toBe("warn");
    expect(values?.detail).toContain("defaultStatus");
    expect(values?.detail).toContain("servePort");
  });

  it("fails when no JavaScript runtime is available", async () => {
    const root = cleanProject();
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git") });
    expect(findingById(report, "runtime.core")?.severity).toBe("fail");
    expect(findingById(report, "identity.git-binary")?.severity).toBe("pass");
  });

  it("warns (not fails) when only some enabled agent CLIs are installed", async () => {
    const root = cleanProject();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        'workDir = "work"',
        "",
        "[check]",
        "version = 1",
        "",
        "[[check.steps]]",
        'name = "build"',
        'command = "true"',
        "",
        "[[agents]]",
        'name = "engineer"',
        'cli = "opencode"',
        "enabled = true",
        "",
      ].join("\n"),
    );
    const report = await runDoctor({
      root,
      probePort: 1,
      hasBinary: tools("git", "bun"), // opencode deliberately absent
    });
    const agents = findingById(report, "runtime.agent-clis");
    expect(agents?.severity).toBe("warn");
    expect(agents?.detail).toContain("engineer");
    expect(report.summary.fail).toBe(0);
  });

  it("resolves a nested layout up to the project root", async () => {
    const root = cleanProject();
    const deep = join(root, "packages", "app", "src");
    mkdirSync(deep, { recursive: true });
    const report = await runDoctor({
      cwd: deep,
      probePort: 1,
      hasBinary: tools("git", "bun"),
    });
    expect(report.project.root).toBe(root);
    expect(findingById(report, "identity.project-root")?.severity).toBe("pass");
  });

  it("handles an existing repository with no repoos.toml via built-in defaults", async () => {
    const root = tmp("repoos-doctor-existing-");
    gitInit(root);
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git", "bun") });
    const toml = findingById(report, "config.repoos-toml");
    expect(toml?.severity).toBe("pass");
    expect(toml?.detail).toContain("defaults");
    expect(findingById(report, "identity.git-repo")?.severity).toBe("pass");
    expect(findingById(report, "gate.check-plan")?.severity).toBe("fail");
  });

  it("identifies a linked worktree and its main checkout", async () => {
    const main = tmp("repoos-doctor-main-");
    gitInit(main);
    writeFileSync(join(main, "README.md"), "x\n");
    const git = (...args: string[]) =>
      spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd: main,
        encoding: "utf8",
      });
    git("add", ".");
    git("commit", "-qm", "init");
    const worktree = join(main, "..", `wt-${Date.now()}`);
    const added = spawnSync("git", ["worktree", "add", "-q", worktree, "-b", "wt-branch"], {
      cwd: main,
      encoding: "utf8",
    });
    expect(added.status).toBe(0);

    const report = await runDoctor({
      root: worktree,
      probePort: 1,
      hasBinary: tools("git", "bun"),
    });
    const context = findingById(report, "identity.worktree-context");
    expect(context?.severity).toBe("pass");
    expect(context?.title).toContain("worktree");
    expect(report.project.fromWorktree).toBe(true);
    rmSync(worktree, { recursive: true, force: true });
  });

  it("reports invalid task frontmatter as a warning, not a failure", async () => {
    const root = cleanProject();
    writeFileSync(join(root, "work", "0001-ok.md"), "---\nid: '0001'\ntitle: Fine\n---\nbody\n");
    writeFileSync(join(root, "work", "0002-bad.md"), "---\ntitle: No id\n---\nbody\n");
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git", "bun") });
    const fm = findingById(report, "layout.task-frontmatter");
    expect(fm?.severity).toBe("warn");
    expect(fm?.detail).toContain("0002-bad.md");
    expect(report.summary.fail).toBe(0);
  });

  it("never throws even when the root does not exist", async () => {
    const report = await runDoctor({
      root: join(tmpdir(), "repoos-doctor-does-not-exist-xyz"),
      probePort: 1,
      hasBinary: tools("git", "bun"),
    });
    expect(report.findings.length).toBeGreaterThan(0);
  });
});

describe("config key and value helpers", () => {
  it("recognizes supported, nested, array-table and RepoOS-persisted keys", () => {
    expect(isKnownConfigKey("workDir")).toBe(true);
    expect(isKnownConfigKey("tunnel.apps.dev.hostname")).toBe(true);
    expect(isKnownConfigKey("check.steps")).toBe(true);
    expect(isKnownConfigKey("agents")).toBe(true);
    expect(isKnownConfigKey("theme")).toBe(true);
    expect(isKnownConfigKey("repoos.workDir")).toBe(true);
    expect(isKnownConfigKey("totallyBogus")).toBe(false);
  });

  it("flags invalid enum, range, boolean and array values", () => {
    const problems = findConfigValueProblems({
      defaultStatus: "nope",
      servePort: 70000,
      strictBuild: "yes",
      taskExtensions: ".md",
    });
    expect(problems.some((p) => p.includes("defaultStatus"))).toBe(true);
    expect(problems.some((p) => p.includes("servePort"))).toBe(true);
    expect(problems.some((p) => p.includes("strictBuild"))).toBe(true);
    expect(problems.some((p) => p.includes("taskExtensions"))).toBe(true);
    expect(findConfigValueProblems({ defaultStatus: "inbox" })).toEqual([]);
  });

  it("collects only non-pass remediations, deduplicated", async () => {
    const root = cleanProject();
    writeFileSync(join(root, "repoos.toml"), 'bogus = "x"\n');
    const report = await runDoctor({ root, probePort: 1, hasBinary: tools("git") });
    const fixes = doctorRemediations(report);
    expect(fixes.length).toBeGreaterThan(0);
    expect(new Set(fixes).size).toBe(fixes.length);
  });
});
