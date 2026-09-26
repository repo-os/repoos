/**
 * #0507 — every route into `review` goes through the same handoff finalization,
 * and the route agents actually use no longer kills the agent that asked.
 *
 * Four things are under test, one per acceptance criterion:
 *
 *  1. `repoos mv <own id> review` from inside the runner session records a
 *     handoff request, leaves `status: active`, exits 0, and the runner
 *     finalizes it at turn end.
 *  2. A route that skips or fails the check leaves the task `active` with the
 *     failure shown — it never reaches `review`.
 *  3. "Skip checks" moves to `review` on the commit gate alone and records the
 *     override in the activity log.
 *  4. A deliberate stop (the task left `active` under the asking agent) is not
 *     escalated: no `needs_input`, no `dev_error_count` bump, and the failure
 *     detail RepoOS would otherwise invent is not one of its own progress
 *     lines (#0501 generalized).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, sysLineDescribesFailure } from "../../server/agents";
import {
  clearHandoffRequest,
  handoffRequestPath,
  readHandoffRequest,
  writeHandoffRequest,
} from "../../server/handoff-request";
import { cmdMv, isRunnerSessionForTask } from "../../commands/tasks";
import { parseTask } from "../../core/task";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const roots: string[] = [];
/** `cmdMv` and the runner both resolve paths from `process.cwd()`, so a test that
 *  chdirs into a fixture worktree must hand the cwd back before that fixture is
 *  deleted — otherwise the next call walks up from a directory that no longer
 *  exists. */
const originalCwd = process.cwd();

const AGENT_ENV_KEYS = [
  "REPOOS_AGENT",
  "REPOOS_TASK_ID",
  "REPOOS_RUN_ID",
  "REPOOS_FAKEBIN_HANDOFF",
  "REPOOS_FAKEBIN_FAIL",
] as const;

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

/**
 * A real git repo with a task on a branch and a registered worktree holding
 * the task file, so the finalization's worktree resolution succeeds. `worktrees`
 * is exported because `boardRoot()` resolves the main checkout from it and the
 * CLI must write its handoff request there, not in the worktree.
 */
function fixture(opts: { sourceChange?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "repoos-0507-"));
  roots.push(root);
  const worktrees = `${root}-worktrees`;
  const work = join(root, "work");
  const bin = join(root, "bin");
  const branch = "feat/0507-unify";
  const worktree = join(worktrees, branch);
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(worktrees, { recursive: true });

  const taskText = (status: string) => `---
id: "0507"
title: Unify every route into review
type: bug
status: ${status}
priority: p1
area: server
assigned_to: ai
branch: ${branch}
---
## Problem
Body
`;
  const taskFile = join(work, "0507-unify.md");
  writeFileSync(taskFile, taskText("active"));
  writeFileSync(join(root, "source.txt"), "base\n");

  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  git(root, ["worktree", "add", "-q", "-b", branch, worktree]);
  // A provisioned worktree has its own copy of the task file; the finalization
  // reads THAT one, and refuses to proceed without it.
  writeFileSync(join(worktree, "work", "0507-unify.md"), taskText("active"));
  if (opts.sourceChange !== false) {
    writeFileSync(join(worktree, "source.txt"), "implemented\n");
  }

  // A CLI that stays alive until it is told to stop, so a turn is still
  // running when the test writes the handoff request.
  writeFileSync(
    join(bin, "qwen"),
    ["#!/usr/bin/env node", 'process.stdout.write("working\\n");', "setInterval(() => {}, 1000);"].join(
      "\n",
    ),
    { mode: 0o755 },
  );

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
  const task = parseTask({
    content: readFileSync(taskFile, "utf8"),
    absPath: taskFile,
    root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
  return { root, worktrees, worktree, branch, bin, config, task, taskFile, cacheDir: join(root, ".repoos") };
}

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

function waitFor(fn: () => boolean, label: string, ms = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fn()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(`timeout: ${label}`));
      setTimeout(check, 10);
    };
    check();
  });
}

async function waitForAsync(fn: () => Promise<boolean>, label: string, ms = 20_000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > ms) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function readStatus(fx: ReturnType<typeof fixture>): string {
  return parseTask({
    content: readFileSync(fx.taskFile, "utf8"),
    absPath: fx.taskFile,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  }).status;
}

function readBody(fx: ReturnType<typeof fixture>): string {
  return readFileSync(fx.taskFile, "utf8");
}

function gitStatus(cwd: string): string {
  return execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim();
}

// Snapshot the agent marker env before any test mutates it, so `afterEach` can
// restore exactly what was there.
const originalEnv: Record<string, string | undefined> = Object.fromEntries(
  AGENT_ENV_KEYS.map((k) => [k, process.env[k]]),
);

afterEach(() => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  process.chdir(originalCwd);
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
    rmSync(`${root}-worktrees`, { recursive: true, force: true });
  }
  process.exitCode = 0;
});

describe("repoos mv <own id> review records a handoff request (#0507)", () => {
  it("writes the request to the board's cache dir, keyed to this run", () => {
    const fx = fixture();
    process.env.REPOOS_AGENT = "1";
    process.env.REPOOS_TASK_ID = "0507";
    process.env.REPOOS_RUN_ID = "run-abc";

    expect(isRunnerSessionForTask("0507")).toBe(true);
    // The CLI resolves the BOARD (the main checkout) from inside the worktree,
    // which is the whole point: a handoff request must never land in the
    // worktree it is asking RepoOS to commit.
    process.chdir(fx.worktree);
    try {
      cmdMv("0507", "review");
    } finally {
      process.chdir(fx.root);
    }

    expect(process.exitCode).toBeUndefined();
    const request = readHandoffRequest(fx.root, fx.config.cacheDir, "0507");
    expect(request).toMatchObject({ taskId: "0507", runId: "run-abc", source: "repoos-mv" });
    expect(existsSync(handoffRequestPath(fx.worktree, ".repoos", "0507"))).toBe(false);
  });
  it("leaves status: active — the asking agent does not move its own task", () => {
    const fx = fixture();
    process.env.REPOOS_AGENT = "1";
    process.env.REPOOS_TASK_ID = "0507";
    process.env.REPOOS_RUN_ID = "run-abc";

    cmdMv("0507", "review");

    expect(readStatus(fx)).toBe("active");
    expect(readBody(fx)).not.toContain("status: review");
  });

  it("is not triggered outside a runner session, or for a different task", () => {
    const fx = fixture();
    // A human in their own shell: no agent markers at all.
    delete process.env.REPOOS_AGENT;
    cmdMv("0507", "review");
    expect(readStatus(fx)).toBe("review");
    expect(existsSync(handoffRequestPath(fx.root, fx.config.cacheDir, "0507"))).toBe(false);

    // An agent working on a DIFFERENT task must not hijack this one.
    writeFileSync(fx.taskFile, readBody(fx).replace(/^status: review$/m, "status: active"));
    process.env.REPOOS_AGENT = "1";
    process.env.REPOOS_TASK_ID = "0999";
    process.env.REPOOS_RUN_ID = "run-abc";
    cmdMv("0507", "review");
    expect(readStatus(fx)).toBe("review");
    expect(existsSync(handoffRequestPath(fx.root, fx.config.cacheDir, "0507"))).toBe(false);
  });

  it("is not triggered without a run id — a request must bind to a live turn", () => {
    const fx = fixture();
    process.env.REPOOS_AGENT = "1";
    process.env.REPOOS_TASK_ID = "0507";
    delete process.env.REPOOS_RUN_ID;

    expect(isRunnerSessionForTask("0507")).toBe(false);
    cmdMv("0507", "review");
    expect(readStatus(fx)).toBe("review");
  });
});

describe("the runner finalizes a `repoos mv review` request at turn end (#0507)", () => {
  it("treats the recorded request exactly like the handoff signal", async () => {
    const fx = fixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    const handoffs: { taskId: string; branch: string; workdir: string; runId: string }[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      stallTimeoutMs: 60_000,
      stallCheckIntervalMs: 20,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        if (!runner.consumeHandoff(request)) return;
        handoffs.push(request);
        runner.completeHandoffFinalization(request.taskId);
      },
    });
    try {
      runner.start(fx.task, fx.branch, agent, { cwd: fx.worktree });
      await waitFor(() => runner.isRunning(fx.task.id), "the turn starts");

      // Exactly what `repoos mv 0507 review` writes from inside the session.
      const runId = (runner as unknown as { entries: Map<string, { runId: string }> }).entries.get(
        fx.task.id,
      )!.runId;
      expect(writeHandoffRequest(fx.root, fx.config.cacheDir, {
        taskId: fx.task.id,
        runId,
        at: new Date().toISOString(),
        source: "repoos-mv",
      })).toBe(true);

      // The status is untouched until finalization.
      expect(readStatus(fx)).toBe("active");

      await waitFor(() => handoffs.length > 0, "the runner finalizes the recorded request");
      expect(handoffs[0]).toMatchObject({
        taskId: fx.task.id,
        branch: fx.branch,
        workdir: fx.worktree,
      });
      // Same durable record the signal writes, so a server crash mid-turn
      // recovers it exactly the same way.
      const pending = join(fx.cacheDir, "pending-handoffs.json");
      expect(existsSync(pending)).toBe(true);
      // The marker is consumed, never left to be re-read by the next turn.
      expect(existsSync(handoffRequestPath(fx.root, fx.config.cacheDir, fx.task.id))).toBe(false);
    } finally {
      runner.stop(fx.task.id);
      process.env.PATH = oldPath;
    }
  });

  it("ignores a marker left behind by an earlier turn", async () => {
    const fx = fixture();
    // A stale request from a run that already ended. Finalizing it would let a
    // finished turn move a task it never finished.
    writeHandoffRequest(fx.root, fx.config.cacheDir, {
      taskId: fx.task.id,
      runId: "a-previous-run",
      at: new Date().toISOString(),
      source: "repoos-mv",
    });
    const handoffs: unknown[] = [];
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      stallTimeoutMs: 200,
      stallCheckIntervalMs: 20,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
      onHandoff: (request) => {
        handoffs.push(request);
      },
    });
    try {
      runner.start(fx.task, fx.branch, agent, { cwd: fx.worktree });
      await waitFor(() => !runner.isRunning(fx.task.id), "the turn ends");
      await new Promise((r) => setTimeout(r, 200));
      expect(handoffs).toEqual([]);
      // A stale marker is cleaned up rather than lingering forever.
      expect(existsSync(handoffRequestPath(fx.root, fx.config.cacheDir, fx.task.id))).toBe(false);
    } finally {
      runner.stop(fx.task.id);
    }
  });
});

describe("a failed handoff leaves the task active (#0507)", () => {
  it("reports the failed step and never writes review", async () => {
    const fx = fixture({ sourceChange: false });
    // No source change at all, so the commit/vacuity gate rejects a vacuous
    // handoff — the check is skipped here so the GATE is what fails.
    const { finalizeReviewHandoff } = await import("../../server/handoff");
    const task = parseTask({
      content: readFileSync(fx.taskFile, "utf8"),
      absPath: fx.taskFile,
      root: fx.root,
      defaultStatus: fx.config.defaultStatus,
      defaultAssignee: fx.config.defaultAssignee,
    });
    const result = await finalizeReviewHandoff(fx.config, task, {
      origin: "ui-review",
      skipChecks: true,
    });
    expect(result.ok).toBe(false);
    expect(result.step).toBe("commit");
    expect(result.detail).toMatch(/no implementation found/);
    expect(readStatus(fx)).toBe("active");
  });
});

describe("skip checks records the override (#0507)", () => {
  it("lands in review and writes the activity entry naming who skipped", async () => {
    const fx = fixture();
    const { finalizeReviewHandoff } = await import("../../server/handoff");
    const task = parseTask({
      content: readFileSync(fx.taskFile, "utf8"),
      absPath: fx.taskFile,
      root: fx.root,
      defaultStatus: fx.config.defaultStatus,
      defaultAssignee: fx.config.defaultAssignee,
    });
    const result = await finalizeReviewHandoff(fx.config, task, {
      origin: "ui-review",
      skipChecks: true,
      actor: "hello@repoos.org",
    });
    expect(result.ok).toBe(true);
    expect(readStatus(fx)).toBe("review");
    expect(readBody(fx)).toContain("review without checks by hello@repoos.org");
    // The work is still committed by the gate — skipping the CHECK is not
    // skipping the commit.
    expect(gitStatus(fx.worktree)).toBe("");
  });
});

describe("a deliberate stop is not a dev error (#0507)", () => {
  it("does not set needs_input or bump dev_error_count", async () => {
    const fx = fixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    const runner = new AgentRunner(fx.config, () => {}, {
      writeDelayMs: 5,
      getTask: (id: string) => (id === fx.task.id ? fx.task : null),
    });
    try {
      runner.start(fx.task, fx.branch, agent, { cwd: fx.worktree });
      await waitFor(() => runner.isRunning(fx.task.id), "the turn starts");

      // This is what the server does when the task leaves `active`
      // (stopAgentIfLeftActive → runner.stop). SIGTERM kills the child, so the
      // turn exits non-zero — and that must not read as a failure.
      const stopped = runner.stop(fx.task.id);
      expect(stopped.stopped).toBe(true);
      await waitForAsync(
        async () => !runner.isRunning(fx.task.id),
        "the deliberately stopped turn exits",
      );
      await new Promise((r) => setTimeout(r, 300));

      const after = parseTask({
        content: readFileSync(fx.taskFile, "utf8"),
        absPath: fx.taskFile,
        root: fx.root,
        defaultStatus: fx.config.defaultStatus,
        defaultAssignee: fx.config.defaultAssignee,
      });
      expect(after.needsInput).toBe(false);
      expect(after.needsInputReason ?? null).toBeNull();
      expect(after.extra?.dev_error_count ?? 0).toBe(0);
      expect(readBody(fx)).not.toMatch(/agent exited with an error/);
    } finally {
      runner.stop(fx.task.id);
      process.env.PATH = oldPath;
    }
  });
});

describe("sysLineDescribesFailure only accepts real failures (#0501 generalized, #0507)", () => {
  it("accepts RepoOS's own failure lines", () => {
    expect(sysLineDescribesFailure("✗ Server finalization stopped at check: boom")).toBe(true);
    expect(sysLineDescribesFailure("✗ managed preview failed: port taken")).toBe(true);
    expect(sysLineDescribesFailure("Antigravity reported a failed result")).toBe(true);
    expect(sysLineDescribesFailure("error: spawn ENOENT")).toBe(true);
    expect(sysLineDescribesFailure("could not acquire publication lock")).toBe(true);
    expect(sysLineDescribesFailure("timed out waiting for the review")).toBe(true);
  });

  it("refuses progress and status lines — the exact #0505 detail", () => {
    // #0505 reported these as the reason a deliberately-stopped agent "failed".
    expect(sysLineDescribesFailure("Server finalization: check")).toBe(false);
    expect(sysLineDescribesFailure("Server finalization: commit")).toBe(false);
    expect(sysLineDescribesFailure("Skill routing: code-review, frontend-design")).toBe(false);
    expect(sysLineDescribesFailure("✓ Server finalization complete")).toBe(false);
    expect(sysLineDescribesFailure("↻ automatically resuming after check failure")).toBe(false);
    expect(sysLineDescribesFailure("Agent is thinking")).toBe(false);
    expect(sysLineDescribesFailure("")).toBe(false);
  });

  it("does not let a success glyph's wording override its meaning", () => {
    // Mentions a failure, but the line says it is fine — reporting this as the
    // reason would be worse than reporting nothing.
    expect(sysLineDescribesFailure("✓ repoos check failed earlier, now green")).toBe(false);
  });
});

describe("clearHandoffRequest is safe to call for a task that never asked", () => {
  it("is a no-op", () => {
    const fx = fixture();
    expect(() => clearHandoffRequest(fx.root, fx.config.cacheDir, "9999")).not.toThrow();
    expect(readHandoffRequest(fx.root, fx.config.cacheDir, "9999")).toBeNull();
  });
});

describe("the handoff request file survives a crash mid-turn", () => {
  it("is readable by a later process and carries the run it belongs to", () => {
    const fx = fixture();
    writeHandoffRequest(fx.root, fx.config.cacheDir, {
      taskId: fx.task.id,
      runId: "run-xyz",
      at: "2026-09-26T00:00:00.000Z",
      source: "repoos-mv",
    });
    // Read back the way recoverPendingHandoffs-style recovery would.
    const raw = JSON.parse(
      readFileSync(handoffRequestPath(fx.root, fx.config.cacheDir, fx.task.id), "utf8"),
    ) as Record<string, unknown>;
    expect(raw).toMatchObject({ taskId: "0507", runId: "run-xyz", source: "repoos-mv" });
    // It lives under the cache dir, which is gitignored — so `guardReviewTransition`'s
    // `git add -A` in the worktree can never fold a request into a commit.
    expect(handoffRequestPath(fx.root, fx.config.cacheDir, fx.task.id)).toContain(".repoos");
  });
});
