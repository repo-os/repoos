/**
 * Concurrency gate on agent spawns: with maxConcurrentAgents set,
 * extra start()/send() calls queue instead of spawning immediately, and are
 * drained one at a time as running agents exit.
 *
 * Deterministic by construction (#0891): every fake turn stays alive until the
 * test releases it with SIGTERM, so the slot transition never depends on how
 * fast a spawned process exits, and host memory/load can never pre-empt the
 * concurrency cap being measured.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

const FAKEBIN = `#!/usr/bin/env node
const fs = require("fs");
// Install the release handler BEFORE publishing the pid: a test may signal us
// the instant the pid file appears, and a default SIGTERM would look unclean.
process.on("SIGTERM", () => process.exit(0));
fs.appendFileSync(
  process.env.REPOOS_FAKEBIN_LOG,
  (process.env.REPOOS_TASK_ID || "") + " " + process.pid + "\\n",
);
// Hold the turn open until the test releases it. Exiting on its own made the
// drain assertion depend on how fast this process finished; the signal makes
// each "slot frees up" step an explicit event the test controls.
setInterval(() => {}, 60_000);
// Fail-safe if a crashed run never gets to release us.
setTimeout(() => process.exit(0), 10 * 60_000).unref();
`;

interface Spawn {
  id: string;
  pid: number;
}

interface Fixture {
  bin: string;
  log: string;
  /** One workdir per task — #0837 refuses two live engineers in the same worktree. */
  workdir: (taskId: string) => string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-concurrency-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "qwen"), FAKEBIN, { mode: 0o755 });
  return {
    bin,
    log: join(root, "spawns.log"),
    workdir: (taskId: string) => {
      const wt = join(root, `wt-${taskId}`);
      mkdirSync(wt, { recursive: true });
      return wt;
    },
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function withFakePath(fx: Fixture): string {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  return oldPath;
}

function config(root: string, maxConcurrentAgents: number): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    maxConcurrentAgents,
    // This suite measures the slot cap, not the machine. With the guard on
    // (the default), a loaded or memory-tight runner queues the first start
    // for `pressure` before the cap is consulted, and a passing local run
    // fails remotely (#0891). Pressure behaviour has its own suite.
    pressureGuard: { enabled: false },
  };
}

const task = (id: string): Task => ({
  id,
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: `feat/${id}`,
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: `work/${id}-test.md`,
  absPath: `/tmp/work/${id}-test.md`,
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
});

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

function spawns(fx: Fixture): Spawn[] {
  try {
    return readFileSync(fx.log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, pid] = line.split(" ");
        return { id, pid: Number(pid) };
      });
  } catch {
    return [];
  }
}

function spawnOrder(fx: Fixture): string[] {
  return spawns(fx).map((spawn) => spawn.id);
}

/** PIDs already signalled this test, so cleanup never signals a recycled pid. */
const released = new Set<number>();

/** Release the fake turn for `id`, letting the runner drain the next one. */
function release(fx: Fixture, id: string): void {
  const spawn = spawns(fx).find((s) => s.id === id);
  if (!spawn) throw new Error(`task ${id} has not spawned yet`);
  releasePid(spawn.pid);
}

function releasePid(pid: number): void {
  if (released.has(pid)) return;
  released.add(pid);
  process.kill(pid, "SIGTERM");
}

/** Never leave a gated child behind if an assertion fails mid-test. */
function releaseAll(fx: Fixture): void {
  for (const spawn of spawns(fx)) {
    try {
      releasePid(spawn.pid);
    } catch {
      /* already exited */
    }
  }
}

afterEach(() => {
  released.clear();
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("agent start concurrency cap", () => {
  it("removes dead durable engineer entries before they can block a review, while live entries still block", () => {
    const fx = makeFixture();
    const runner = new AgentRunner(config(fx.bin, 1), () => {});
    const cacheDir = join(fx.bin, ".repoos");
    mkdirSync(cacheDir, { recursive: true });
    const deadWorkdir = fx.workdir("dead");
    const liveWorkdir = fx.workdir("live");
    const registryPath = join(cacheDir, "agents.json");
    const entry = (taskId: string, pid: number, workdir: string) => ({
      taskId,
      pid,
      workdir,
      branch: `feat/${taskId}`,
      runId: `run-${taskId}`,
      kind: "engineer",
    });
    try {
      writeFileSync(
        registryPath,
        JSON.stringify({
          entries: [
            entry("dead", Number.MAX_SAFE_INTEGER, deadWorkdir),
            entry("live", process.pid, liveWorkdir),
          ],
        }),
      );

      expect(runner.isRunning("dead")).toBe(false);
      expect(
        JSON.parse(readFileSync(registryPath, "utf8")).entries.map(
          (row: { taskId: string }) => row.taskId,
        ),
      ).toEqual(["live"]);
      expect(runner.isRunning("live")).toBe(true);
    } finally {
      runner.dispose();
      fx.clean();
    }
  });

  it("queues starts beyond maxConcurrentAgents and drains them as slots free", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const runner = new AgentRunner(config(fx.bin, 1), () => {});
    try {
      const r1 = runner.start(task("0001"), "feat/0001", agent, { cwd: fx.workdir("0001") });
      const r2 = runner.start(task("0002"), "feat/0002", agent, { cwd: fx.workdir("0002") });
      const r3 = runner.start(task("0003"), "feat/0003", agent, { cwd: fx.workdir("0003") });

      expect(r1.ok).toBe(true);
      expect(r1.queued).toBeFalsy();
      expect(r2.ok).toBe(true);
      expect(r2.queued).toBe(true);
      expect(r3.ok).toBe(true);
      expect(r3.queued).toBe(true);

      // Only one process should actually be running at a time.
      expect(runner.isRunning("0001")).toBe(true);
      expect(runner.isRunning("0002")).toBe(false);
      expect(runner.isRunning("0003")).toBe(false);

      // The first turn is the only one that has spawned; the other two are
      // still held by the cap, not merely slow to start.
      await waitFor(() => spawnOrder(fx).length === 1, "the first turn to spawn");
      expect(spawnOrder(fx)).toEqual(["0001"]);
      expect(runner.isQueued("0002")).toBe(true);
      expect(runner.isQueued("0003")).toBe(true);

      // Freeing the slot drains exactly one waiter, in FIFO order.
      release(fx, "0001");
      await waitFor(() => spawnOrder(fx).length === 2, "the second turn to spawn");
      expect(spawnOrder(fx)).toEqual(["0001", "0002"]);
      expect(runner.isRunning("0002")).toBe(true);
      expect(runner.isRunning("0003")).toBe(false);

      release(fx, "0002");
      await waitFor(() => spawnOrder(fx).length === 3, "the third turn to spawn");
      expect(spawnOrder(fx)).toEqual(["0001", "0002", "0003"]);

      release(fx, "0003");
      await waitFor(() => !runner.isRunning("0003"), "the last turn to exit");
    } finally {
      releaseAll(fx);
      runner.dispose();
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("a queued task cannot be double-started while waiting for a slot", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const runner = new AgentRunner(config(fx.bin, 1), () => {});
    try {
      const first = runner.start(task("0001"), "feat/0001", agent, { cwd: fx.workdir("0001") });
      expect(first.queued).toBeFalsy();
      await waitFor(() => spawnOrder(fx).length === 1, "the first turn to spawn");

      const queued = runner.start(task("0002"), "feat/0002", agent, { cwd: fx.workdir("0002") });
      expect(queued.queued).toBe(true);

      const dupe = runner.start(task("0002"), "feat/0002", agent, { cwd: fx.workdir("0002") });
      expect(dupe.ok).toBe(false);

      // The duplicate was refused, so only the running turn has spawned.
      expect(spawnOrder(fx)).toEqual(["0001"]);

      release(fx, "0001");
      await waitFor(() => spawnOrder(fx).length === 2, "the queued turn to spawn");
      expect(spawnOrder(fx)).toEqual(["0001", "0002"]);

      release(fx, "0002");
      await waitFor(() => !runner.isRunning("0002"), "the queued turn to exit");
    } finally {
      releaseAll(fx);
      runner.dispose();
      process.env.PATH = oldPath;
      fx.clean();
    }
  });
});
