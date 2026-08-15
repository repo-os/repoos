/**
 * Full end-to-end flow test: create a task → set active → handoff to review
 * → close-out to done. Uses a version-bump that changes 1 line in 1 file
 * (package.json), simulating the simplest possible AI agent output.
 *
 * This is the single integration test that exercises every stage of the
 * pipeline: task creation, worktree setup, handoff (validate/check/commit/
 * review/main), and close-out (merge/build/check/done).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask, serializeTask } from "../../core/task";
import { handoffTask } from "../../server/handoff";
import { completeTask } from "../../server/done";

// ── Fixture ──────────────────────────────────────────────────────────────

interface FlowFixture {
  root: string;
  worktree: string;
  bin: string;
  config: RepoOSConfig;
  /** The test-env "agent" is a shell script that bumps the version. */
  agentScript: string;
  task: Task;
  taskPath: string;
  clean: () => void;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/**
 * Create a minimal repo with a package.json (0.3.0). The "agent" bumps the
 * version to 0.3.1 — a single-line, single-file change.
 */
function makeFlowFixture(): FlowFixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-flow-"));
  const worktree = `${root}-wt`;
  const bin = join(root, "fake-bin");
  const taskPath = join(root, "work", "0001-bump-version.md");

  // Repo structure
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "screenshots"), { recursive: true });
  mkdirSync(bin, { recursive: true });

  // Source: a minimal package.json at 0.3.0
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-repo", version: "0.3.0" }, null, 2) + "\n",
  );

  // A fake "repoos check" binary that always passes (we're testing the
  // orchestration flow, not the check itself). In a real run the check
  // would run `tsc + etc`, but in the fixture it's a no-op pass.
  writeFileSync(join(bin, "repoos"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });

  // Minimal dist/cli/index.js so the worktree's own CLI is found first
  mkdirSync(join(root, "dist", "cli"), { recursive: true });
  writeFileSync(join(root, "dist", "cli", "index.js"), "process.exit(0);\n");

  // Also publish a "repoos check" in dist/ of worktree so local CLI is found
  const wtDistCli = join(worktree, "dist", "cli");

  // Config
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };

  const branch = "feat/bump-version";

  // Create the task file with ACTIVE status and branch set from the start,
  // so both main and the branch agree on the task state after branching.
  const task: Task = {
    id: "0001",
    title: "Bump version to 0.3.1",
    type: "chore",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "general",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "test",
    branch,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    path: "work/0001-bump-version.md",
    absPath: taskPath,
    body: "Bump version from 0.3.0 to 0.3.1\n",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    pmAgentOverride: null,
    pmCliOverride: null,
    pmModelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  };

  writeFileSync(taskPath, serializeTask(task));

  // Init git repo, commit everything (includes task file at status: active)
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);

  // Create the feature branch + worktree
  git(root, ["branch", branch]);
  git(root, ["worktree", "add", "-q", worktree, branch]);

  // In the worktree, create the dist/cli/index.js (local repoos check)
  mkdirSync(join(worktree, "dist", "cli"), { recursive: true });
  writeFileSync(join(worktree, "dist", "cli", "index.js"), "process.exit(0);\n");

  // The worktree inherits the task file from the initial commit. The branch
  // is already set and status is active. Now the "agent" makes its change.
  // Write the worktree task file explicitly so the worktree's own copy is
  // authoritative (it already matches after git worktree add).
  writeFileSync(join(worktree, "work", "0001-bump-version.md"), serializeTask(task));

  // Now the "agent" makes its change: bump version in the worktree
  const pkgPath = join(worktree, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.version = "0.3.1";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Also ensure the worktree has its dist/cli/index.js from a build perspective
  mkdirSync(join(worktree, "dist"), { recursive: true });
  mkdirSync(join(worktree, "dist", "cli"), { recursive: true });
  writeFileSync(join(worktree, "dist", "cli", "index.js"), "process.exit(0);\n");

  return {
    root,
    worktree,
    bin,
    config,
    agentScript: join(bin, "agent"),
    task,
    taskPath,
    clean: () => {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ok */ }
      try { rmSync(worktree, { recursive: true, force: true }); } catch { /* ok */ }
    },
  };
}

function readTask(fx: FlowFixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  })!;
}

function request(fx: FlowFixture) {
  return {
    taskId: fx.task.id,
    runId: "test-run-id",
    branch: fx.task.branch,
    workdir: fx.worktree,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("end-to-end flow: version-bump task", () => {
  it("creates task → agent work → handoff to review → close-out to done", async () => {
    const fx = makeFlowFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;

    try {
      // ── Verify initial state ────────────────────────────────────────
      const initial = readTask(fx);
      expect(initial.status).toBe("active");
      expect(initial.branch).toBe("feat/bump-version");

      // Package.json starts at 0.3.0 on main
      const mainPkg = JSON.parse(readFileSync(join(fx.root, "package.json"), "utf8"));
      expect(mainPkg.version).toBe("0.3.0");

      // ── Agent change is present in worktree ─────────────────────────
      const wtPkg = JSON.parse(readFileSync(join(fx.worktree, "package.json"), "utf8"));
      expect(wtPkg.version).toBe("0.3.1");

      // ── Step 1: Handoff (active → review) ───────────────────────────
      const steps: string[] = [];
      const handoffResult = await handoffTask(
        fx.config,
        initial,
        request(fx),
        (step) => steps.push(step),
      );
      expect(handoffResult).toMatchObject({ ok: true, step: "done" });
      expect(steps).toEqual(["validate", "check", "commit", "review", "main", "done"]);

      // Verify: task is now "review" in BOTH main and worktree copies
      const afterHandoff = readTask(fx);
      expect(afterHandoff.status).toBe("review");

      const wtTaskPath = join(fx.worktree, fx.task.path);
      const wtTaskContent = readFileSync(wtTaskPath, "utf8");
      expect(wtTaskContent).toContain("status: review");

      // Worktree is clean (all changes committed)
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");

      // The version bump commit exists on the branch
      const log = git(fx.worktree, ["log", "--oneline"]);
      expect(log).toContain("feat(0001)");
      expect(log).toContain("implement");

      // Main still has version 0.3.0 (not merged yet)
      const mainPkgStill = JSON.parse(readFileSync(join(fx.root, "package.json"), "utf8"));
      expect(mainPkgStill.version).toBe("0.3.0");

      // ── Step 2: Close-out (review → done) ───────────────────────────
      // Use fake build/check steps that always pass so we don't need
      // a real TypeScript/build pipeline in the test.
      const fakeSteps = {
        build: async (_cwd: string) => ({ ok: true, stage: "build" as const }),
        check: async (_cwd: string) => ({ ok: true, stage: "check" as const }),
      };

      const doneSteps: string[] = [];
      const doneResult = await completeTask(
        fx.config,
        afterHandoff,
        (step) => doneSteps.push(step),
        fakeSteps,
      );

      expect(doneResult).toMatchObject({
        ok: true,
        merged: true,
      });
      expect(doneSteps).toContain("merge");
      expect(doneSteps).toContain("done");

      // Verify: version bump is now on main
      const mergedPkg = JSON.parse(readFileSync(join(fx.root, "package.json"), "utf8"));
      expect(mergedPkg.version).toBe("0.3.1");

      // Verify: task is "done"
      const finalTask = readTask(fx);
      expect(finalTask.status).toBe("done");

      // Verify: branch is gone (merged and deleted)
      const branches = git(fx.root, ["branch"]).split("\n").map((b) => b.trim().replace(/^\*/, "").trim());
      expect(branches).not.toContain("feat/bump-version");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects handoff when repoos check fails in the worktree", async () => {
    const fx = makeFlowFixture();
    const oldPath = process.env.PATH ?? "";
    // Make BOTH the local worktree CLI and the PATH-based repoos fail
    writeFileSync(join(fx.worktree, "dist", "cli", "index.js"), "process.exit(1);\n");
    writeFileSync(join(fx.bin, "repoos"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    process.env.PATH = `${fx.bin}:${oldPath}`;

    try {
      const initial = readTask(fx);
      const result = await handoffTask(fx.config, initial, request(fx));
      expect(result).toMatchObject({ ok: false, step: "check" });
      // Task stays active, no merge happened
      expect(readTask(fx).status).toBe("active");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects vacuous handoff with no source changes", async () => {
    const fx = makeFlowFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      // Revert the agent's change in the worktree
      const pkgPath = join(fx.worktree, "package.json");
      writeFileSync(
        pkgPath,
        JSON.stringify({ name: "test-repo", version: "0.3.0" }, null, 2) + "\n",
      );

      const initial = readTask(fx);
      const result = await handoffTask(fx.config, initial, request(fx));
      expect(result).toMatchObject({ ok: false, step: "commit" });
      expect(result.detail).toMatch(/no implementation found/);
      expect(readTask(fx).status).toBe("active");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects mismatched worktree/branch before changing anything", async () => {
    const fx = makeFlowFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const initial = readTask(fx);
      const result = await handoffTask(
        fx.config,
        initial,
        { ...request(fx), branch: "feat/wrong" },
      );
      expect(result).toMatchObject({ ok: false, step: "validate" });
      expect(readTask(fx).status).toBe("active");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("handoff is idempotent — second call returns already-finalized", async () => {
    const fx = makeFlowFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const initial = readTask(fx);
      const first = await handoffTask(fx.config, initial, request(fx));
      expect(first).toMatchObject({ ok: true, step: "done" });

      const commitCount = Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]));

      const second = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(second).toMatchObject({ ok: true, detail: "handoff was already finalized" });
      expect(Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]))).toBe(commitCount);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });
});
