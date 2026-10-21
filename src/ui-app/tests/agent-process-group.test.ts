/**
 * Agent turns run in an isolated process group; turn end must reap helpers without
 * touching unrelated processes (#0675).
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { processGroupKillSupported } from "../../core/process-group.js";
import { waitFor } from "./helpers";

const FAKE_CHILD_SLEEP = "600";
const FAKE_DECOY_SLEEP = "900";

const FAKEBIN = `#!/usr/bin/env node
const { spawn } = require("child_process");
spawn("sleep", ["${FAKE_CHILD_SLEEP}"], { stdio: "ignore" }).unref();
process.stdout.write("fake output line\\n");
process.stdout.write('{"session_id":"sess-pg"}\\n');
process.exit(0);
`;

const TASK: Task = {
  id: "0675",
  title: "Process group test",
  type: "bug",
  status: "active",
  priority: "p1",
  area: "server",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/pg",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0675-test.md",
  absPath: "/tmp/work/0675-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
};

function agent(cli: string): Agent {
  return { name: "engineer", cli, model: "default", enabled: true };
}

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startDetachedSleep(seconds: string): number {
  const child = spawn("sleep", [seconds], { detached: true, stdio: "ignore" });
  child.unref();
  if (!child.pid) throw new Error("no pid");
  return child.pid;
}

function listSleepPids(seconds: string): number[] {
  const res = spawnSync("pgrep", ["-f", `sleep ${seconds}`], { encoding: "utf8" });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  return res.stdout
    .trim()
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

describe("AgentRunner process group (#0675)", () => {
  let root: string;
  let oldPath: string;

  afterEach(() => {
    process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  });

  it.skipIf(!processGroupKillSupported())(
    "reaps the turn's helper child and leaves an unrelated sleep running",
    async () => {
      root = mkdtempSync(join(tmpdir(), "repoos-pg-"));
      const bin = join(root, "bin");
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, "opencode"), FAKEBIN, { mode: 0o755 });
      oldPath = process.env.PATH ?? "";
      process.env.PATH = `${bin}:${oldPath}`;

      const decoyPid = startDetachedSleep(FAKE_DECOY_SLEEP);
      expect(pidAlive(decoyPid)).toBe(true);

      const runner = new AgentRunner(config(root), () => {});
      const cwd = join(root, "wt");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/pg", agent("opencode"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => !runner.isRunning("0675"), "agent turn exit");

      const childSleeps = listSleepPids(FAKE_CHILD_SLEEP);
      expect(childSleeps).toEqual([]);
      expect(pidAlive(decoyPid)).toBe(true);
      try {
        process.kill(decoyPid, "SIGTERM");
      } catch {
        /* gone */
      }
    },
  );
});
