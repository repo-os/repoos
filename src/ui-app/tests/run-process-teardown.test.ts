/**
 * Live integration for #1134: a fake agent turn spawns a detached grandchild
 * (its own session via `setsid`/`detached: true`) running a busy loop in the
 * worktree. Ending the turn must kill it even after it leaves the turn's
 * process group and even after it is reparented to PID 1.
 *
 * The cwd probe is exercised on both platforms: `/proc/<pid>/cwd` on Linux and
 * a batched `lsof` call on macOS. The env-marker probe is Linux-only (macOS
 * SIP hides another process's environment); both paths are also covered by the
 * injectable unit tests in `run-processes.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findOrphanedRunProcesses,
  listProcessRows,
  pathInside,
  reapAgentTurnProcessTree,
  reapRunProcesses,
  readProcessCwds,
  turnMarker,
} from "../../core/run-processes.js";
import { rmFixture, spawnTestProcess, terminateTestPidsSync, waitFor } from "./helpers";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface FakeTurn {
  parentPid: number;
  grandchildPid: number;
}

describe.skipIf(process.platform === "win32")("turn teardown kills escaped grandchildren", () => {
  let root = "";
  const pids: number[] = [];

  afterEach(() => {
    terminateTestPidsSync(pids);
    if (root) rmFixture(root);
    root = "";
    pids.length = 0;
  });

  function fixture() {
    root = mkdtempSync(join(tmpdir(), "repoos-vitest-reap1134-"));
    const worktreesRoot = join(root, "worktrees");
    const worktree = join(worktreesRoot, "feat/1134-detached");
    mkdirSync(worktree, { recursive: true });
    return { worktree, worktreesRoot, pidFile: join(root, "grandchild.pid") };
  }

  /**
   * Start a fake turn whose script itself spawns the detached grandchild.
   * This is the exact escape shape from the incident: the parent is in the
   * turn's group, the grandchild `setsid`s into its own session.
   */
  async function startTurn(worktree: string, marker: string, pidFile: string): Promise<FakeTurn> {
    const turnScript =
      `const { spawn } = require("node:child_process");` +
      `const { writeFileSync } = require("node:fs");` +
      `const child = spawn(process.execPath, ["-e", ` +
      `"setInterval(() => { for (let i = 0; i < 20000; i++); }, 200)"], ` +
      `{ cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env });` +
      `child.unref();` +
      `writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));` +
      `setInterval(() => {}, 1000);`;
    const parent = spawnTestProcess(process.execPath, ["-e", turnScript], {
      cwd: worktree,
      env: { ...process.env, REPOOS_TURN_MARKER: marker },
      stdio: "ignore",
    });
    if (!parent.pid) throw new Error("fake turn did not start");
    pids.push(parent.pid);

    let grandchildPid = 0;
    await waitFor(() => {
      try {
        grandchildPid = Number(readFileSync(pidFile, "utf8"));
      } catch {
        return false;
      }
      return grandchildPid > 0 && pidAlive(grandchildPid);
    }, "detached grandchild pid file");
    pids.push(grandchildPid);
    return { parentPid: parent.pid, grandchildPid };
  }

  it("kills a setsid grandchild when the turn ends", async () => {
    const { worktree, pidFile } = fixture();
    const marker = turnMarker(root, "1134", "run-teardown");
    const { parentPid, grandchildPid } = await startTurn(worktree, marker, pidFile);

    // Prove it really escaped: the grandchild leads its own session/group.
    const grandchildRow = listProcessRows().find((row) => row.pid === grandchildPid);
    expect(grandchildRow?.pgid).toBe(grandchildPid);
    expect(grandchildRow?.pgid).not.toBe(parentPid);

    const result = await reapAgentTurnProcessTree({
      repoRoot: root,
      leaderPid: parentPid,
      workdir: worktree,
      marker,
      taskId: "1134",
      graceMs: 250,
    });
    expect(result.processes.some((process) => process.pid === grandchildPid)).toBe(true);
    expect(result.survivors).not.toContain(grandchildPid);
    await waitFor(() => !pidAlive(grandchildPid), "detached grandchild exit");
    expect(pidAlive(parentPid)).toBe(false);
  });

  it("finds and kills a grandchild reparented to PID 1 by worktree cwd", async () => {
    const { worktree, worktreesRoot, pidFile } = fixture();
    const marker = turnMarker(root, "1134", "run-orphan");
    const { parentPid, grandchildPid } = await startTurn(worktree, marker, pidFile);

    // End only the turn's process group, like an agent CLI that vanished.
    // The setsid grandchild survives and is reparented to PID 1.
    process.kill(-parentPid, "SIGKILL");
    await waitFor(
      () => listProcessRows().some((row) => row.pid === grandchildPid && row.ppid === 1),
      "grandchild reparented to PID 1",
    );
    expect(pathInside(worktree, readProcessCwds([grandchildPid]).get(grandchildPid) ?? "")).toBe(
      true,
    );

    // The server sweep's classifier must name it as orphaned by cwd, with no
    // live turn claiming the worktree — and must not match it by name.
    const orphans = findOrphanedRunProcesses(listProcessRows(), {
      uid: process.getuid?.() ?? -1,
      repoRoot: root,
      worktreesRoot,
      liveTurns: [],
      minAgeMs: 0,
    });
    const found = orphans.find((process) => process.pid === grandchildPid);
    expect(found).toBeTruthy();
    expect(found?.matchedBy).toBe("worktree-cwd");

    await reapRunProcesses([grandchildPid], { graceMs: 250 });
    await waitFor(() => !pidAlive(grandchildPid), "reparented grandchild exit");
  });
});
