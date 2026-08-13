/**
 * Watchdog tests (#0156): a task stuck in `active` with no running agent and no
 * activity is resumed exactly once, then escalated to `needsInput` — never
 * silent, never an infinite retry loop.
 *
 * The E2E tests drive a real AgentRunner against a fake `opencode` binary on a
 * fixture PATH: the fake agent prints output and exits cleanly WITHOUT emitting
 * the handoff signal, reproducing the #0154/#0155 "missed handoff" shape the
 * watchdog exists to catch.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, HANDOFF_READY_SIGNAL } from "../../server/agents";
import { LiveIndex } from "../../server/live-index";
import {
  TaskWatchdog,
  isStuckActiveTask,
  suggestNextStep,
  WATCHDOG_NUDGE_MESSAGE,
} from "../../server/task-watchdog";
import { parseTask } from "../../core/task";
import { createRepoOS } from "../../core/repoos";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

/** Fake `opencode`: records its argv, prints a line, exits 0 (no handoff). */
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

  it("resumes a stuck task exactly once, then escalates to needsInput (not silent, no infinite loop)", async () => {
    const fx = makeFx(10_000); // went active 10s ago
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_WATCHDOG_LOG = fx.log;
    try {
      const index = new LiveIndex(fx.config);
      index.refreshAll();
      runner = new AgentRunner(fx.config, () => {});
      const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

      // The task got here the normal way: an agent turn ran (creating the
      // session) and ended without emitting the handoff signal.
      const start = runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root });
      expect(start.ok).toBe(true);
      await waitFor(() => !runner!.isRunning("0001"), "stuck first turn exits");
      expect(spawns(fx)).toHaveLength(1);

      // Scan 1: exactly one automatic resume nudge.
      await watchdog.checkNow();
      await waitFor(() => spawns(fx).length === 2, "watchdog resume spawn");
      expect(spawns(fx)[1].args.join(" ")).toContain(WATCHDOG_NUDGE_MESSAGE);
      expect(readFileSync(fx.taskPath, "utf8")).toContain("watchdog: automatic resume attempted");

      // The resumed turn also ends without a clean handoff.
      await waitFor(() => !runner!.isRunning("0001"), "resume turn exits");

      // Let the staleness threshold elapse again so the stuck state is visible.
      await new Promise((r) => setTimeout(r, 1100));

      // Scan 2: escalate — set needsInput, record the reason + a next step,
      // and do NOT spawn another resume.
      await watchdog.checkNow();
      expect(parseTaskAt(fx).needsInput).toBe(true);
      const body = readFileSync(fx.taskPath, "utf8");
      expect(body).toContain("watchdog: escalated to needs_input");
      expect(body).toContain("handoff signal was not detected after the automatic resume");
      expect(body).toContain("::repoos-handoff-ready::");
      expect(spawns(fx)).toHaveLength(2);

      // Scan 3: still no re-spawn and no double escalation.
      await watchdog.checkNow();
      const bodyAfter = readFileSync(fx.taskPath, "utf8");
      expect(bodyAfter.match(/watchdog: escalated to needs_input/g)).toHaveLength(1);
      expect(spawns(fx)).toHaveLength(2);
    } finally {
      fx.clean();
    }
  });

  it("escalates immediately when a stuck task cannot be resumed (no session)", async () => {
    const fx = makeFx(10_000);
    const index = new LiveIndex(fx.config);
    index.refreshAll();
    runner = new AgentRunner(fx.config, () => {});
    const watchdog = new TaskWatchdog(fx.config, index, runner, 1000);

    // No session was ever created, so the resume path cannot run — the task
    // escalates on the very first scan instead of being left to rot.
    await watchdog.checkNow();

    const body = readFileSync(fx.taskPath, "utf8");
    expect(body).toContain("needs_input: true");
    expect(body).toContain("watchdog: escalated to needs_input");
    expect(body).toContain("could not resume agent: no session for this task");
    expect(spawns(fx)).toHaveLength(0);
    fx.clean();
  });

  it("persists the handoff-failure reason when a turn crashes mid-handoff", async () => {
    const fx = makeFx(10_000);
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_WATCHDOG_LOG = fx.log;
    process.env.REPOOS_WATCHDOG_HANDOFF = "1";
    process.env.REPOOS_WATCHDOG_FAIL = "1";
    try {
      runner = new AgentRunner(fx.config, () => {});
      const start = runner.start(parseTaskAt(fx), "feat/x", engineer, { cwd: fx.root });
      expect(start.ok).toBe(true);
      await waitFor(() => !runner!.isRunning("0001"), "crashed turn exits");

      // The reason survives in the task's own Activity log, not just the
      // in-memory transcript (survives reloads).
      const body = readFileSync(fx.taskPath, "utf8");
      expect(body).toContain("handoff failed · agent turn was interrupted");
    } finally {
      fx.clean();
    }
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
});
