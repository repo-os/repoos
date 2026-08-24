/**
 * Concurrency gate on agent spawns (#0293): with maxConcurrentAgents set,
 * extra start()/send() calls queue instead of spawning immediately, and are
 * drained one at a time as running agents exit.
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
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, (process.env.REPOOS_TASK_ID || "") + "\\n");
process.stdout.write("done\\n");
`;

interface Fixture {
  bin: string;
  log: string;
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

function spawnOrder(fx: Fixture): string[] {
  try {
    return readFileSync(fx.log, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("agent start concurrency cap", () => {
  it("queues starts beyond maxConcurrentAgents and drains them as slots free", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd, 1), () => {});
    try {
      const r1 = runner.start(task("0001"), "feat/0001", agent, { cwd });
      const r2 = runner.start(task("0002"), "feat/0002", agent, { cwd });
      const r3 = runner.start(task("0003"), "feat/0003", agent, { cwd });

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

      await waitFor(() => spawnOrder(fx).length === 3, "all three turns to have spawned in sequence");
      expect(spawnOrder(fx)).toEqual(["0001", "0002", "0003"]);
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("a queued task cannot be double-started while waiting for a slot", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd, 1), () => {});
    try {
      runner.start(task("0001"), "feat/0001", agent, { cwd });
      const queued = runner.start(task("0002"), "feat/0002", agent, { cwd });
      expect(queued.queued).toBe(true);

      const dupe = runner.start(task("0002"), "feat/0002", agent, { cwd });
      expect(dupe.ok).toBe(false);

      await waitFor(() => spawnOrder(fx).length === 2, "both turns to have spawned");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      fx.clean();
    }
  });
});
