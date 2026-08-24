/**
 * Watchdog tests (#0180): an active task whose agent process is dead or
 * stalled — killed mid-turn, exited without a handoff, or never started — is
 * surfaced: the reason is recorded in the Activity log and the task leaves the
 * silent `active` state (to `review` when its worktree holds work, else back
 * to `ready`). Guards: never fires while the server is mid-reload, never
 * disturbs a deliberately paused task, and surfaces a task at most once.
 *
 * The E2E tests drive a real AgentRunner against a fake `opencode` binary on a
 * fixture PATH, reproducing the #0172 "agent went silent and never handed
 * off" shape and the "killed mid-turn" shape (#0154/#0155 signal bugs).
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { AgentRunner, HANDOFF_READY_SIGNAL } from "../../server/agents";
import { LiveIndex } from "../../server/live-index";
import {
  TaskWatchdog,
  isStuckActiveTask,
  hasRecentWorktreeActivity,
  suggestNextStep,
  classifyDeadAgentReason,
  autoTransitionTarget,
} from "../../server/task-watchdog";
import { parseTask } from "../../core/task";
import { createRepoOS } from "../../core/repoos";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

/** Fake `opencode`: records its argv, prints a line, exits (clean or not). */
const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_WATCHDOG_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
process.stdout.write("fake agent output\\n");
const sleepMs = Number(process.env.REPOOS_WATCHDOG_SLEEP_MS || 0);
if (sleepMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
if (process.env.REPOOS_WATCHDOG_HANDOFF === "1") process.stdout.write("${HANDOFF_READY_SIGNAL}\\n");
if (process.env.REPOOS_WATCHDOG_FAIL === "1") process.exit(1);
`;

interface Fx {
  root: string;
  bin: string;
  log: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

/** An `active` task file whose only Activity entry is the status transition. */
function taskMd(transitionAgeMs: number): string {
  const ts = new Date(Date.now() - transitionAgeMs).toISOString();
  return `---
id: "0001"
title: "Stuck task"
type: feature
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/x
---
## Problem
Stuck.

## Activity

- ${ts} · status inbox→active
`;
}

/** Like taskMd, but with a real (recent) work entry after the transition. */
function taskMdWithFreshActivity(transitionAgeMs: number, freshAgeMs: number): string {
  const transition = new Date(Date.now() - transitionAgeMs).toISOString();
  const fresh = new Date(Date.now() - freshAgeMs).toISOString();
  return `---
id: "0001"
title: "Fresh task"
type: feature
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/x
---
## Problem
Working.

## Activity

- ${transition} · status inbox→active
- ${fresh} · some real work happened
`;
}

interface GitFxOptions {
  /** Create the task's branch worktree with a committed change (→ review). */
  committedWork?: boolean;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

/**
 * Recursively set every file and directory under `dir` to `when`. A worktree
 * checks out the whole tree at HEAD, so "committedWork" fixtures nest files
 * (e.g. the repo's own work/ dir) below the top level — a shallow backdate of
 * just readdirSync(dir)'s top-level entries leaves those nested files with
 * their real, fresh checkout-time mtime, which silently defeats a test that's
 * trying to simulate a genuinely stale worktree.
 */
function backdateTree(dir: string, when: Date): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) backdateTree(full, when);
    utimesSync(full, when, when);
  }
}

/** Fixture without git: no worktree/platform for the task's branch exists. */
function makeFx(transitionAgeMs: number): Fx {
  const root = mkdtempSync(join(tmpdir(), "repoos-watchdog-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
  const taskPath = join(root, "work", "0001-stuck.md");
  writeFileSync(taskPath, taskMd(transitionAgeMs));
  const repoos = createRepoOS(root);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    taskPath,
    config: repoos.config,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Fixture inside a real git repo, optionally with a task worktree of work. */
function makeGitFx(transitionAgeMs: number, opts: GitFxOptions = {}): Fx {
  const fx = makeFx(transitionAgeMs);
  git(fx.root, ["init", "-q"]);
  git(fx.root, ["config", "user.email", "t@example.com"]);
  git(fx.root, ["config", "user.name", "Test"]);
  git(fx.root, ["add", "work/0001-stuck.md"]);
  git(fx.root, ["commit", "-q", "-m", "init"]);
  const wtDir = join(
    dirname(fx.root),
    `${basename(fx.root)}-worktrees`,
    "feat",
    "x",
  );
  if (opts.committedWork) {
    git(fx.root, ["worktree", "add", "-q", "-b", "feat/x", wtDir, "HEAD"]);
    writeFileSync(join(wtDir, "src.ts"), "export const worked = true;\n");
    git(wtDir, ["add", "src.ts"]);
    git(wtDir, ["commit", "-q", "-m", "feat: work done"]);
  }
  const prevClean = fx.clean;
  fx.clean = () => {
    prevClean();
    rmSync(join(dirname(fx.root), `${basename(fx.root)}-worktrees`), {
      recursive: true,
      force: true,
    });
  };
  return fx;
}

function parseTaskAt(fx: Fx): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.config.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

function spawns(fx: Fx): Array<{ args: string[]; cwd: string }> {
  if (!existsSync(fx.log)) return [];
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as { args: string[]; cwd: string });
}

const engineer: Agent = { name: "engineer", cli: "opencode", model: "default", enabled: true };

describe("stuck detection", () => {
  it("flags an active task with no activity past its transition for the threshold", () => {
    const now = Date.now();
    expect(isStuckActiveTask(taskMd(600_000), 5 * 60_000, now)).toBe(true);
    // Sub-threshold staleness is not yet "stuck".
    expect(isStuckActiveTask(taskMd(10_000), 60_000, now)).toBe(false);
  });

  it("does not flag a task with recent activity after its transition", () => {
    const now = Date.now();
    // 10 minutes since the transition, but a real work entry 30s ago.
    expect(isStuckActiveTask(taskMdWithFreshActivity(600_000, 30_000), 5 * 60_000, now)).toBe(false);
  });

  it("does not flag a task with no status→active transition in its Activity log", () => {
    const now = Date.now();
    const body = taskMd(60_000).replace(
      /\n- .*?status inbox→active\n?/,
      "\n- 2020-01-01T00:00:00Z · created\n",
    );
    expect(isStuckActiveTask(body, 5 * 60_000, now)).toBe(false);
  });
});

describe("hasRecentWorktreeActivity (#0203)", () => {
  it("is true when a worktree file was modified within the staleness window", () => {
    const fx = makeGitFx(600_000, { committedWork: true });
    try {
      // Uncommitted, freshly-written — the exact shape of a live agent
      // mid-edit, no commit yet.
      writeFileSync(join(dirname(fx.root), `${basename(fx.root)}-worktrees`, "feat", "x", "live.txt"), "editing now\n");
      expect(hasRecentWorktreeActivity(fx.root, "feat/x", 5 * 60_000, Date.now())).toBe(true);
    } finally {
      fx.clean();
    }
  });

  it("is false once nothing in the worktree has changed within the window", () => {
    const fx = makeGitFx(600_000, { committedWork: true });
    try {
      const now = Date.now();
      // committedWork's file was written well before "now" in wall-clock
      // terms, but to make the boundary deterministic, use a threshold of 0.
      expect(hasRecentWorktreeActivity(fx.root, "feat/x", 0, now)).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("is false when the task has no branch, or the branch has no worktree", () => {
    const fx = makeGitFx(600_000);
    try {
      expect(hasRecentWorktreeActivity(fx.root, undefined, 5 * 60_000, Date.now())).toBe(false);
      expect(hasRecentWorktreeActivity(fx.root, "feat/x", 5 * 60_000, Date.now())).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("ignores node_modules and .git so a scan never pays for their size", () => {
    const fx = makeGitFx(600_000, { committedWork: true });
    try {
      const wt = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, "feat", "x");
      const nm = join(wt, "node_modules", "pkg");
      mkdirSync(nm, { recursive: true });
      writeFileSync(join(nm, "index.js"), "module.exports = {};\n");
      expect(hasRecentWorktreeActivity(fx.root, "feat/x", 0, Date.now())).toBe(false);
    } finally {
      fx.clean();
    }
  });
});

describe("classifyDeadAgentReason", () => {
  it("classifies a task with no session at all as never-started", () => {
    const fx = makeFx(1000);
    const task = parseTaskAt(fx);
    const runner = { output: () => null } as unknown as AgentRunner;
    const cl = classifyDeadAgentReason(task, runner);
    expect(cl.kind).toBe("never-started");
    expect(cl.reason).toContain("never started");
    fx.clean();
  });

  it("classifies a persisted interrupted-turn as crashed", () => {
    const fx = makeFx(1000);
    writeFileSync(
      fx.taskPath,
      readFileSync(fx.taskPath, "utf8") +
        `- ${new Date().toISOString()} · handoff failed · agent turn was interrupted\n`,
    );
    const task = parseTaskAt(fx);
    const runner = { output: () => ({}) } as unknown as AgentRunner;
    const cl = classifyDeadAgentReason(task, runner);
    expect(cl.kind).toBe("crashed");
    expect(cl.reason).toContain("crashed or was interrupted");
    expect(cl.reason).toContain("agent turn was interrupted");
    fx.clean();
  });

  it("classifies a session that ran and ended without a handoff as exited", () => {
    const fx = makeFx(1000);
    const task = parseTaskAt(fx);
    const runner = { output: () => ({ lines: [], pending: "", bytes: 0 }) } as unknown as AgentRunner;
    const cl = classifyDeadAgentReason(task, runner);
    expect(cl.kind).toBe("exited-without-handoff");
    expect(cl.reason).toContain("exited without emitting the handoff signal");
    fx.clean();
  });
});

describe("autoTransitionTarget", () => {
  it("returns ready for a task with no branch", () => {
    const fx = makeFx(1000);
    const task = { ...parseTaskAt(fx), branch: "" };
    expect(autoTransitionTarget(fx.config, task)).toBe("ready");
    fx.clean();
  });

  it("returns ready when the branch has no worktree holding work", () => {
    const fx = makeGitFx(1000);
    expect(autoTransitionTarget(fx.config, parseTaskAt(fx))).toBe("ready");
    fx.clean();
  });

  it("returns review when the branch worktree holds committed work (#0172 never-commit shape)", () => {
    const fx = makeGitFx(1000, { committedWork: true });
    expect(autoTransitionTarget(fx.config, parseTaskAt(fx))).toBe("review");
    fx.clean();
  });
});

describe("suggestNextStep", () => {
  it("matches known failure shapes and falls back to a generic note", () => {
    expect(suggestNextStep("agent turn was interrupted")).toMatch(/interrupted/);
    expect(suggestNextStep("stalled past the timeout")).toMatch(/DEFAULT_STALL_TIMEOUT_MS/);
    expect(suggestNextStep("an answer is waiting on your approval")).toMatch(/permission/);
    expect(suggestNextStep("handoff signal was not detected")).toContain("::repoos-handoff-ready::");
    expect(suggestNextStep("mystery failure")).toMatch(/resume the session manually/);
  });
});

describe("TaskWatchdog", () => {
  let runner: AgentRunner | null;
  let oldPath: string;

  afterEach(() => {
    runner?.dispose();
    runner = null;
    delete process.env.REPOOS_WATCHDOG_LOG;
    delete process.env.REPOOS_WATCHDOG_HANDOFF;
    delete process.env.REPOOS_WATCHDOG_FAIL;
    delete process.env.REPOOS_WATCHDOG_SLEEP_MS;
    if (oldPath !== undefined) process.env.PATH = oldPath;
  });

  it("surfaces an active task whose agent never started → ready, with the reason recorded (acceptance 2)", async () => {
    const fx = makeFx(10_000); // went active 10s ago, past the 1s threshold
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

    await watchdog.checkNow();

    const body = readFileSync(fx.taskPath, "utf8");
    const task = parseTaskAt(fx);
    expect(task.status).toBe("ready");
    expect(task.needsInput).toBe(false);
    expect(body).toContain("watchdog: auto-surfaced stuck task");
    expect(body).toContain("status active→ready");
    expect(body).toContain("agent never started");
    expect(spawns(fx)).toHaveLength(0); // never a forced re-spawn
    fx.clean();
  });

  it("surfaces a task whose agent was killed mid-turn → ready, showing why (acceptance 1)", async () => {
    const fx = makeFx(10_000);
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_WATCHDOG_LOG = fx.log;
    process.env.REPOOS_WATCHDOG_HANDOFF = "1";
    process.env.REPOOS_WATCHDOG_FAIL = "1";
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      runner = new AgentRunner(fx.config, () => {});
      const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

      // An agent starts, reaches the handoff boundary, then its process is
      // killed (exit 1) — the interrupted turn is persisted to the task log.
      const start = runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root });
      expect(start.ok).toBe(true);
      await waitFor(() => !runner!.isRunning("0001"), "crashed turn exits");
      expect(readFileSync(fx.taskPath, "utf8")).toContain("handoff failed · agent turn was interrupted");

      // A killed turn is fresh activity — the task is candidate-stuck only
      // after the staleness threshold since the interruption.
      await new Promise((r) => setTimeout(r, 1200));

      await watchdog.checkNow();

      const body = readFileSync(fx.taskPath, "utf8");
      const task = parseTaskAt(fx);
      expect(task.status).toBe("ready"); // no worktree/work → back to ready
      expect(task.needsInput).toBe(false);
      expect(body).toContain("watchdog: auto-surfaced stuck task");
      expect(body).toContain("retained for recovery");
      expect(body).toContain("agent turn was interrupted");
      expect(spawns(fx)).toHaveLength(1); // the original turn only — no re-spawn
    } finally {
      fx.clean();
    }
  });

  it(
    "on exited-without-handoff, auto-resumes the SAME session instead of immediately surfacing (#0271 follow-up)",
    async () => {
      const fx = makeGitFx(10_000, { committedWork: true });
      oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_WATCHDOG_LOG = fx.log;
      try {
        const index = new LiveIndex(fx.config);
        index.refreshAll();
        runner = new AgentRunner(fx.config, () => {});
        const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

        // A session ran, did the work (committed in the worktree) and exited
        // without emitting the handoff signal — the #0172 shape.
        const start = runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root });
        expect(start.ok).toBe(true);
        await waitFor(() => !runner!.isRunning("0001"), "turn exits without handoff");
        await new Promise((r) => setTimeout(r, 1200));

        await watchdog.checkNow();

        // NOT surfaced yet — a retry was scheduled instead (task #0268 sat
        // surfaced-but-unresumed until a human noticed; this is what replaces
        // that).
        expect(parseTaskAt(fx).status).toBe("active");
        expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdog: auto-surfaced");
        expect(spawns(fx)).toHaveLength(1); // retry hasn't fired yet (3s delay)

        // The scheduled retry fires ~3s later and resumes the SAME session —
        // a second spawn, and the retry count is persisted to the file.
        await waitFor(() => spawns(fx).length === 2, "automatic retry spawns a resumed session", 6000);
        expect(readFileSync(fx.taskPath, "utf8")).toContain("handoff_signal_retry_count: 1");
        expect(parseTaskAt(fx).status).toBe("active");
      } finally {
        fx.clean();
      }
    },
    15_000,
  );

  it(
    "surfaces to review only after both automatic retries are exhausted (#0271 follow-up)",
    async () => {
      const fx = makeGitFx(10_000, { committedWork: true });
      oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_WATCHDOG_LOG = fx.log;
      try {
        const index = new LiveIndex(fx.config);
        index.refreshAll();
        runner = new AgentRunner(fx.config, () => {});
        const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

        // Original turn: exits without handoff.
        expect(runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root }).ok).toBe(true);
        await waitFor(() => !runner!.isRunning("0001"), "turn 1 exits without handoff");
        await new Promise((r) => setTimeout(r, 1200));
        await watchdog.checkNow(); // schedules retry 1

        await waitFor(() => spawns(fx).length === 2, "retry 1 spawns", 6000);
        await waitFor(() => !runner!.isRunning("0001"), "turn 2 (retry 1) exits without handoff — same fake binary, same behavior");
        await new Promise((r) => setTimeout(r, 1200));
        await watchdog.checkNow(); // schedules retry 2 (cap: 2)

        await waitFor(() => spawns(fx).length === 3, "retry 2 spawns", 6000);
        expect(readFileSync(fx.taskPath, "utf8")).toContain("handoff_signal_retry_count: 2");
        await waitFor(() => !runner!.isRunning("0001"), "turn 3 (retry 2) exits without handoff");
        await new Promise((r) => setTimeout(r, 1200));
        await watchdog.checkNow(); // cap reached — falls through to normal surfacing

        const body = readFileSync(fx.taskPath, "utf8");
        const task = parseTaskAt(fx);
        expect(task.status).toBe("review");
        expect(task.needsInput).toBe(false);
        expect(body).toContain("watchdog: auto-surfaced stuck task");
        expect(body).toContain("status active→review");
        expect(body).toContain("exited without emitting the handoff signal");
        expect(spawns(fx)).toHaveLength(3); // the original turn + exactly 2 retries, never a 3rd
      } finally {
        fx.clean();
      }
    },
    30_000,
  );

  it("never touches a task whose agent is legitimately paused", async () => {
    const fx = makeFx(10_000);
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

    runner.markPaused("0001"); // the human paused it; it stays active on purpose
    await watchdog.checkNow();

    const task = parseTaskAt(fx);
    expect(task.status).toBe("active");
    expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdog:");
    expect(spawns(fx)).toHaveLength(0);
    fx.clean();
  });

  it("skips the whole scan while the server is mid-reload", async () => {
    const fx = makeFx(10_000);
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    let canRun = false; // the reload manager reports a handover in flight
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000, { canRun: () => canRun });

    await watchdog.checkNow();
    expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdog:");

    // Handover done — the next scan runs.
    canRun = true;
    await watchdog.checkNow();
    expect(readFileSync(fx.taskPath, "utf8")).toContain("watchdog: auto-surfaced stuck task");
    fx.clean();
  });

  it("surfaces a stuck task exactly once — never a transition loop", async () => {
    const fx = makeFx(10_000);
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

    await watchdog.checkNow();
    const body1 = readFileSync(fx.taskPath, "utf8");
    expect(body1.match(/watchdog: auto-surfaced stuck task/g)).toHaveLength(1);
    expect(parseTaskAt(fx).status).toBe("ready");

    await watchdog.checkNow();
    const body2 = readFileSync(fx.taskPath, "utf8");
    expect(body2.match(/watchdog: auto-surfaced stuck task/g)).toHaveLength(1);
    expect(parseTaskAt(fx).status).toBe("ready");
    fx.clean();
  });

  it("falls back to needsInput escalation when autoTransition is disabled (task stays active)", async () => {
    const fx = makeFx(10_000);
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000, { autoTransition: false });

    await watchdog.checkNow();

    const body = readFileSync(fx.taskPath, "utf8");
    const task = parseTaskAt(fx);
    expect(task.status).toBe("active");
    expect(task.needsInput).toBe(true);
    expect(body).toContain("watchdog: escalated to needs_input");
    expect(body).toContain("agent never started");
    expect(spawns(fx)).toHaveLength(0);
    fx.clean();
  });

  it("does not touch a task with a running agent or a fresh activity entry", async () => {
    const fx = makeFx(10_000);
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_WATCHDOG_LOG = fx.log;
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      runner = new AgentRunner(fx.config, () => {});
      const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

      // A running agent turn is never a "stuck" task — keep the fake agent
      // alive long enough that the scan provably sees it running.
      process.env.REPOOS_WATCHDOG_SLEEP_MS = "2000";
      runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root });
      await waitFor(() => spawns(fx).length === 1, "initial turn spawn logged");
      await watchdog.checkNow();
      expect(spawns(fx)).toHaveLength(1);
      delete process.env.REPOOS_WATCHDOG_SLEEP_MS;
      await waitFor(() => !runner!.isRunning("0001"), "turn exits");

      // Now that the process is gone, a FRESH activity entry keeps the task out
      // of watchdog range (agent did real work recently).
      const fresh = taskMdWithFreshActivity(600_000, 100);
      writeFileSync(fx.taskPath, fresh);
      index.applyFileChange(fx.taskPath);
      await watchdog.checkNow();
      expect(spawns(fx)).toHaveLength(1);
      expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdog:");
    } finally {
      fx.clean();
    }
  });

  it("does not surface a task whose registry entry is gone but its worktree has fresh files (#0203)", async () => {
    // Reproduces the exact reported shape: an agent that "kept running... and
    // kept writing source files" got surfaced as dead anyway. `isRunning()`
    // is a plain in-memory Map — it reports false whenever the registry
    // doesn't know about the task, which is true after every server restart
    // (#0214) and is exactly what this test simulates: a fresh AgentRunner
    // with NO entry for this task, so `isRunning()` is unconditionally false,
    // while the worktree shows genuinely recent file activity.
    const fx = makeGitFx(600_000, { committedWork: true }); // Activity log is stale
    try {
      const wt = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, "feat", "x");
      writeFileSync(join(wt, "still-editing.ts"), "export const inProgress = true;\n");

      const index = new LiveIndex(fx.config);
      index.refreshAll();
      runner = new AgentRunner(fx.config, () => {}); // empty registry — no entry for 0001
      const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

      await watchdog.checkNow();

      expect(readFileSync(fx.taskPath, "utf8")).not.toContain("watchdog:");
      expect(parseTaskAt(fx).status).toBe("active"); // untouched
    } finally {
      fx.clean();
    }
  });

  it("still surfaces a genuinely dead task with a stale worktree and an empty registry", async () => {
    // Regression guard for the fix above: the worktree-mtime check must only
    // SUPPRESS a false surface, never mask a real one. `committedWork`'s own
    // setup commit has a fresh mtime (it just ran), which would otherwise
    // spuriously look like live activity and pass this test for the wrong
    // reason — backdate every file so the worktree is genuinely stale too.
    const fx = makeGitFx(600_000, { committedWork: true });
    try {
      const wt = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, "feat", "x");
      backdateTree(wt, new Date(Date.now() - 600_000));

      const index = new LiveIndex(fx.config);
      index.refreshAll();
      runner = new AgentRunner(fx.config, () => {});
      const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

      await watchdog.checkNow();

      const body = readFileSync(fx.taskPath, "utf8");
      expect(body).toContain("watchdog: auto-surfaced stuck task");
      expect(parseTaskAt(fx).status).toBe("review"); // committedWork → dirty worktree → review
    } finally {
      fx.clean();
    }
  });
});