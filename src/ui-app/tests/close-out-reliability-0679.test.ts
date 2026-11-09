/**
 * #0679 — adaptive close-out timeout, monotonic budget, repair handback, review messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adaptiveCloseOutTimeoutMs,
  CLOSE_OUT_MIN_TIMEOUT_MS,
  CLOSE_OUT_TIMEOUT_SCALE,
  effectiveCloseOutTimeoutMs,
  readCloseOutGateTimingStats,
  recordCloseOutGateTimingStats,
} from "../../core/close-out-timing.js";
import { isLockfileOnlyConflicts } from "../../core/lockfile-conflict.js";
import { dropDistBeforeMerge, mergeBranch } from "../../core/git.js";
import type { RepoOSConfig, Task } from "../../core/types";
import { scheduleCloseOutRepairHandback } from "../../server/close-out-repair.js";
import {
  closeOutMonotonicElapsedMs,
  closeOutTimeoutMs,
} from "../../server/integration-orchestrator.js";
import type { IntegrationJob } from "../../server/integration-job.js";
import type { AgentRunner } from "../../server/agents.js";
import { parseTask } from "../../core/task";

describe("adaptive close-out timeout (#0679)", () => {
  it("uses 10 min minimum when there is no gate history", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      expect(adaptiveCloseOutTimeoutMs(root)).toBe(CLOSE_OUT_MIN_TIMEOUT_MS);
      const config: RepoOSConfig = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 360_000 },
      };
      expect(effectiveCloseOutTimeoutMs(config)).toBe(CLOSE_OUT_MIN_TIMEOUT_MS);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scales from the last successful gate duration when not explicitly configured", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      recordCloseOutGateTimingStats(root, ".repoos", 120_000);
      expect(adaptiveCloseOutTimeoutMs(root)).toBe(
        Math.max(CLOSE_OUT_MIN_TIMEOUT_MS, 120_000 * CLOSE_OUT_TIMEOUT_SCALE),
      );
      const stats = readCloseOutGateTimingStats(root);
      expect(stats?.lastSuccessfulGateDurationMs).toBe(120_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("honours an explicit repoos.toml timeout over the adaptive default", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      recordCloseOutGateTimingStats(root, ".repoos", 500_000);
      const config: RepoOSConfig = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 180_000, timeoutMsFromToml: true },
      };
      expect(closeOutTimeoutMs(config)).toBe(180_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("monotonic close-out budget (#0679)", () => {
  it("tracks elapsed time from budgetMonotonicStartNs", () => {
    const job: IntegrationJob = {
      taskId: "0001",
      phase: "validating",
      enqueuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      baseMainSha: null,
      branchSha: null,
      candidateSha: null,
      budgetMonotonicStartNs: process.hrtime.bigint().toString(),
    };
    const elapsed = closeOutMonotonicElapsedMs(job);
    expect(elapsed).not.toBeNull();
    expect(elapsed!).toBeGreaterThanOrEqual(0);
    expect(elapsed!).toBeLessThan(50);
  });
});

describe("lockfile-only conflicts (#0679)", () => {
  it("recognises lockfile-only path lists", () => {
    expect(isLockfileOnlyConflicts(["bun.lock"])).toBe(true);
    expect(isLockfileOnlyConflicts(["bun.lock", "package-lock.json"])).toBe(true);
    expect(isLockfileOnlyConflicts(["bun.lock", "src/a.ts"])).toBe(false);
  });
});

describe("lockfile-only conflict completes the merge commit (#1076)", () => {
  function sh(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  }

  it("completes a lockfile-only merge and keeps a dirty sibling out of the commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-lockfile-"));
    // A fake `bun` so `bun install` returns 0 without a network call.
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "bun"),
      '#!/bin/sh\nprintf "regenerated lock\\n" > bun.lock\nexit 0\n',
      {
        mode: 0o755,
      },
    );
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    try {
      sh(root, ["init", "-q", "-b", "main"]);
      sh(root, ["config", "user.email", "t@example.com"]);
      sh(root, ["config", "user.name", "T"]);
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, "package.json"), '{"name":"x","version":"1.0.0"}\n');
      writeFileSync(join(root, "bun.lock"), "main lock\n");
      writeFileSync(join(root, "src.ts"), "base\n");
      writeFileSync(join(root, "work/2000-other.md"), '---\nid: "2000"\n---\nMAIN\n');
      sh(root, ["add", "-A"]);
      sh(root, ["commit", "-q", "-m", "init"]);

      // A feature branch that changes the lockfile, and a main that changes it
      // differently — a lockfile-only conflict.
      sh(root, ["checkout", "-q", "-b", "feat/t"]);
      writeFileSync(join(root, "bun.lock"), "feature lock\n");
      sh(root, ["commit", "-qam", "feature lock"]);
      sh(root, ["checkout", "-q", "main"]);
      writeFileSync(join(root, "bun.lock"), "main lock v2\n");
      sh(root, ["commit", "-qam", "main lock"]);
      // A sibling task's bookkeeping appears in the worktree (an untracked
      // board write) while the lockfile merge completes. The scoped `add`
      // must not sweep it into the merge commit.
      writeFileSync(join(root, "work", "2001-sibling.md"), '---\nid: "2001"\n---\nBOARD\n');

      const conflict = await mergeBranch(root, "feat/t", { regenerateLockfileConflicts: true });
      expect(conflict.merged).toBe(true);

      const committed = sh(root, ["show", "--name-only", "--format=", "HEAD"])
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      // The sibling file is never folded into the merge commit.
      expect(committed).not.toContain("work/2001-sibling.md");
      // The merge is a real merge commit (two parents), not a partial commit.
      const parents = sh(root, ["log", "-1", "--format=%P"]).trim().split(/\s+/).filter(Boolean);
      expect(parents.length).toBe(2);
      // The sibling is still an uncommitted working-tree change.
      expect(sh(root, ["status", "--porcelain"])).toContain("work/2001-sibling.md");
    } finally {
      process.env.PATH = oldPath;
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("unstages a sibling staged DURING the lockfile regeneration, before the bare merge commit", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-lockfile-staged-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    // The real `bun install` can run for minutes; a concurrent board write can
    // stage a sibling's bookkeeping into the index in that window, after the
    // merge already started (so git's merge-start guard cannot help). The fake
    // `bun` stands in for that: it writes and stages a sibling's file, exactly
    // the shape the commit boundary must survive (#1076).
    writeFileSync(
      join(bin, "bun"),
      '#!/bin/sh\nprintf "regenerated lock\\n" > bun.lock\n' +
        'mkdir -p work/reports/2000\n' +
        'printf "DRIFT\\n" > work/2000-other.md\n' +
        'printf "stale\\n" > work/reports/2000/review-1.md\n' +
        'git add -- work/2000-other.md work/reports/2000/review-1.md\n' +
        "exit 0\n",
      { mode: 0o755 },
    );
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    try {
      sh(root, ["init", "-q", "-b", "main"]);
      sh(root, ["config", "user.email", "t@example.com"]);
      sh(root, ["config", "user.name", "T"]);
      mkdirSync(join(root, "work", "reports", "2000"), { recursive: true });
      writeFileSync(join(root, "package.json"), '{"name":"x","version":"1.0.0"}\n');
      writeFileSync(join(root, "bun.lock"), "main lock\n");
      writeFileSync(join(root, "src.ts"), "base\n");
      writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nMAIN\n');
      writeFileSync(join(root, "work", "reports", "2000", "review-1.md"), "main report\n");
      sh(root, ["add", "-A"]);
      sh(root, ["commit", "-q", "-m", "init"]);

      sh(root, ["checkout", "-q", "-b", "feat/t"]);
      writeFileSync(join(root, "bun.lock"), "feature lock\n");
      sh(root, ["commit", "-qam", "feature lock"]);
      sh(root, ["checkout", "-q", "main"]);
      writeFileSync(join(root, "bun.lock"), "main lock v2\n");
      sh(root, ["commit", "-qam", "main lock"]);

      const conflict = await mergeBranch(root, "feat/t", {
        regenerateLockfileConflicts: true,
        taskId: "1076",
        workFileFilter: { workDir: "work", cacheDir: ".repoos" },
      });
      expect(conflict.merged).toBe(true);

      const committed = sh(root, ["show", "--name-only", "--format=", "HEAD"])
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(committed).not.toContain("work/2000-other.md");
      expect(committed).not.toContain("work/reports/2000/review-1.md");
      // The merge is a real merge commit (two parents).
      const parents = sh(root, ["log", "-1", "--format=%P"]).trim().split(/\s+/).filter(Boolean);
      expect(parents.length).toBe(2);
    } finally {
      process.env.PATH = oldPath;
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("dropDistBeforeMerge (#1076)", () => {
  function sh(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  }

  it("drops tracked dist/ as one commit and keeps a staged sibling out of it", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1076-dropdist-"));
    try {
      sh(root, ["init", "-q", "-b", "main"]);
      sh(root, ["config", "user.email", "t@example.com"]);
      sh(root, ["config", "user.name", "T"]);
      mkdirSync(join(root, "dist"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(join(root, "dist", "a.js"), "old\n");
      writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nMAIN\n');
      writeFileSync(join(root, "work", "1076-own.md"), '---\nid: "1076"\n---\nown\n');
      writeFileSync(join(root, "src.ts"), "base\n");
      sh(root, ["add", "-A"]);
      sh(root, ["commit", "-q", "-m", "init"]);

      // A sibling's file is left staged (a board write + `git add`), plus the
      // task's own file. The bare drop commit must not carry either.
      writeFileSync(join(root, "work", "2000-other.md"), '---\nid: "2000"\n---\nDRIFT\n');
      sh(root, ["add", "work/2000-other.md"]);

      const committed = await dropDistBeforeMerge(root, {
        workDir: "work",
        cacheDir: ".repoos",
        taskId: "1076",
      });
      expect(committed).toBe(true);

      // dist/ is actually gone from HEAD (the pathspec no-op this replaced
      // would have left it tracked).
      expect(sh(root, ["ls-files", "dist/"]).trim()).toBe("");
      const inCommit = sh(root, ["show", "--name-only", "--format=", "HEAD"])
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      expect(inCommit).toContain("dist/a.js");
      expect(inCommit).not.toContain("work/2000-other.md");
      // The sibling is unstaged again, not committed.
      expect(sh(root, ["diff", "--cached", "--name-only"])).not.toContain("work/2000-other.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when dist/ is not tracked", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-1076-dropdist-noop-"));
    try {
      sh(root, ["init", "-q", "-b", "main"]);
      sh(root, ["config", "user.email", "t@example.com"]);
      sh(root, ["config", "user.name", "T"]);
      writeFileSync(join(root, "src.ts"), "base\n");
      sh(root, ["add", "-A"]);
      sh(root, ["commit", "-q", "-m", "init"]);
      const before = sh(root, ["rev-parse", "HEAD"]).trim();
      expect(await dropDistBeforeMerge(root, { workDir: "work", taskId: "1076" })).toBe(false);
      expect(sh(root, ["rev-parse", "HEAD"]).trim()).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scheduleCloseOutRepairHandback (#0679)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("moves a review task to active and messages the engineer", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-repair-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const path = join(root, "work/0001-fixture.md");
    writeFileSync(
      path,
      `---
id: "0001"
title: Fixture
type: feature
status: review
priority: p2
area: server
assigned_to: ai
branch: feat/fixture
---
`,
    );
    const task = parseTask({
      content: readFileSync(path, "utf8"),
      absPath: path,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    const sent: string[] = [];
    const runner = {
      send: (_id: string, message: string) => {
        sent.push(message);
        return { ok: true };
      },
      system: () => {},
      persistHandoffFailure: () => {},
    } as unknown as AgentRunner;
    const config: RepoOSConfig = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      agents: [{ name: "engineer", enabled: true, cli: "cursor", model: "test" }],
    };
    try {
      const scheduled = scheduleCloseOutRepairHandback(
        config,
        task,
        "gate-failure",
        "check failed: tests — foo is not a function",
        runner,
      );
      expect(scheduled).toBe(true);
      await vi.runAllTimersAsync();
      expect(sent[0]).toContain("foo is not a function");
      expect(sent[0]).toContain("Merge main into your branch");
      const updated = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(updated.status).toBe("active");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
