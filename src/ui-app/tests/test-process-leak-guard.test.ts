/**
 * Test helper process leak guard (#1017).
 *
 * A worker killed mid-test (check timeout, Ctrl-C, OOM) never runs its own
 * try/finally, so the fake CLIs, preview servers and `bun -e` service stubs it
 * spawned reparent to pid 1 and sit there for days. These tests pin the two
 * recovery paths:
 *
 *   - teardown kills the process GROUPS whose command line names the run root
 *     (covers helpers that never wrote a pid log), including children of a
 *     shell wrapper;
 *   - a later run kills helpers whose run root is already gone, and reaps the
 *     real OS temp dir even when a managed agent's TMPDIR points elsewhere.
 *
 * Everything is matched by the unique run-root path in the process command
 * line, never by process name (docs/agent-process-safety.md).
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  defaultOsTmpdir,
  findProcessesMatchingRoots,
  readTestProcessRecords,
  recordTestProcess,
  reapStaleFixtures,
  STALE_FIXTURE_AGE_MS,
  sweepOrphanedRunRootProcesses,
  testRunRoot,
} from "./helpers";
import { teardown } from "./setup/global-reap";

const PREFIX = "repoos-leak-guard-";
const made: string[] = [];
const pids: number[] = [];

/** A helper that stays alive and starts a grandchild in the same process group. */
const HELPER = `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(process.env.GUARD_CHILD_PID ?? "/dev/null", String(child.pid));
if (process.env.GUARD_READY) fs.writeFileSync(process.env.GUARD_READY, "ready");
setInterval(() => {}, 1000);
`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid: number, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !alive(pid);
}

async function waitForFile(path: string, timeoutMs = 5_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return Number(readFileSync(path, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${path}`);
}

function fixtureRoot(parent = defaultOsTmpdir()): string {
  const root = mkdtempSync(join(parent, PREFIX));
  made.push(root);
  return root;
}

/** Spawn a long-lived helper whose argv names a file under `root`, detached. */
function spawnHelper(root: string, childPidFile?: string): number {
  const script = join(root, "helper.cjs");
  writeFileSync(script, HELPER);
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      GUARD_CHILD_PID: childPidFile ?? "/dev/null",
      GUARD_READY: join(root, "helper.ready"),
    },
  });
  if (!child.pid) throw new Error("helper failed to spawn");
  child.unref();
  pids.push(child.pid);
  return child.pid;
}

afterEach(() => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("test helper process leak guard", () => {
  it("matches the exact run root, not a sibling whose name shares the prefix", () => {
    const root = fixtureRoot();
    const sibling = fixtureRoot(defaultOsTmpdir());
    // Give the sibling a name that starts with the root name, exercising the
    // path-boundary check rather than a naive string prefix.
    const renamed = `${root}longer`;
    made.push(renamed);
    rmSync(renamed, { recursive: true, force: true });
    mkdirSync(renamed, { recursive: true });
    const pid = spawnHelper(renamed);
    try {
      expect(findProcessesMatchingRoots([root]).map((entry) => entry.pid)).not.toContain(pid);
      expect(findProcessesMatchingRoots([renamed]).map((entry) => entry.pid)).toContain(pid);
      expect(sibling).not.toBe(root);
    } finally {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
  });

  it("teardown kills the spawned process group even with no pid log", async () => {
    const root = fixtureRoot();
    const grandchildPidFile = join(root, "grandchild.pid");
    const pid = spawnHelper(root, grandchildPidFile);
    const grandchildPid = await waitForFile(grandchildPidFile);
    expect(alive(pid)).toBe(true);
    expect(alive(grandchildPid)).toBe(true);

    await teardown(root);

    await expect(waitDead(pid)).resolves.toBe(true);
    await expect(waitDead(grandchildPid)).resolves.toBe(true);
    expect(() => readFileSync(join(root, "helper.cjs"))).toThrow();
  });

  it("records pids at the run root so a later run can kill a helper with no path in argv", () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: "ignore",
    });
    if (!child.pid) throw new Error("helper failed to spawn");
    child.unref();
    pids.push(child.pid);
    recordTestProcess(child.pid, "no-path-in-argv");
    const records = readTestProcessRecords(testRunRoot());
    expect(records.some((rec) => rec.pid === child.pid && rec.label === "no-path-in-argv")).toBe(
      true,
    );
  });

  it("reaps a stale run root from the real OS tmpdir even when TMPDIR points elsewhere", async () => {
    const root = fixtureRoot(defaultOsTmpdir());
    const pid = spawnHelper(root);
    const old = new Date(Date.now() - STALE_FIXTURE_AGE_MS - 60_000);
    utimesSync(root, old, old);

    const removed = reapStaleFixtures(PREFIX);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(() => readFileSync(join(root, "helper.cjs"))).toThrow();
    await expect(waitDead(pid)).resolves.toBe(true);
  });

  it("kills helpers whose named repoos-vitest run root no longer exists", async () => {
    // Mimic a worker kill: the run root is deleted while a detached helper's
    // argv still names it.
    const base = fixtureRoot(defaultOsTmpdir());
    const runRoot = join(base, "repoos-vitest-LeakAb");
    mkdirSync(runRoot, { recursive: true });
    const pid = spawnHelper(runRoot);
    await waitForFile(join(runRoot, "helper.ready"));
    rmSync(base, { recursive: true, force: true });
    made.splice(made.indexOf(base), 1);

    expect(sweepOrphanedRunRootProcesses(0)).toBeGreaterThanOrEqual(1);
    await expect(waitDead(pid)).resolves.toBe(true);
  });
});
