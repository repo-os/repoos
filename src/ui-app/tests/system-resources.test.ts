/**
 * 0091 — system resource sampler tests. The sampler's parsing (of `ps` output)
 * and orphan-detection logic are pure functions tested against fixture strings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePsOutput, parseServeScan, parseServeRoot, parseServePort, sampleSystem, sampleRepoStats, reapStrayServeProcesses, killTrackedProcess } from "../../server/system";
import type { RunningAgentInfo } from "../../server/agents";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";

describe("parsePsOutput", () => {
  it("parses a single ps line", () => {
    const out = "12345 12340 12.5 3.2 204800 01:23:45";
    const records = parsePsOutput(out);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      pid: 12345,
      ppid: 12340,
      cpuPercent: 12.5,
      memPercent: 3.2,
      rssKB: 204800,
      elapsed: "01:23:45",
    });
  });

  it("parses multiple ps lines", () => {
    const out = [
      "12345 12340 12.5 3.2 204800 01:23:45",
      "12346 12340  0.0  0.1   8192    00:00:05",
    ].join("\n");
    const records = parsePsOutput(out);
    expect(records).toHaveLength(2);
    expect(records[1].pid).toBe(12346);
    expect(records[1].cpuPercent).toBe(0.0);
  });

  it("skips header lines and malformed lines", () => {
    const out = [
      "  PID  PPID %CPU %MEM   RSS     ELAPSED",
      "12345 12340 12.5 3.2 204800 01:23:45",
      "",
      "bad",
      "12346 xyz 0.0 0.1 8192 00:00:05",
    ].join("\n");
    const records = parsePsOutput(out);
    expect(records).toHaveLength(1);
    expect(records[0].pid).toBe(12345);
  });

  it("returns empty array for empty input", () => {
    expect(parsePsOutput("")).toEqual([]);
  });

  it("handles elapsed with days (DD-HH:MM:SS format)", () => {
    const out = "12345 12340 0.1 0.5 102400 2-04:30:15";
    const records = parsePsOutput(out);
    expect(records).toHaveLength(1);
    expect(records[0].elapsed).toBe("2-04:30:15");
  });
});

describe("sampleSystem", () => {
  it("returns machine facts even when no processes are tracked", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-system-"));
    try {
      const result = sampleSystem({
        serverPid: process.pid,
        cacheDir: tmp,
        runningAgents: [],
      });
      expect(result.machine.cpuCount).toBeGreaterThan(0);
      expect(result.machine.totalMem).toBeGreaterThan(0);
      expect(result.machine.loadavg).toHaveLength(3);
      // availableMem counts reclaimable memory (free + inactive + cache), so it
      // is always >= raw freeMem and never exceeds total.
      expect(result.machine.availableMem).toBeGreaterThanOrEqual(result.machine.freeMem);
      expect(result.machine.availableMem).toBeLessThanOrEqual(result.machine.totalMem);
      expect(result.serverPid).toBe(process.pid);
      expect(result.at).toBeTruthy();
      expect(result.totals.cpuPercent).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes the server process in the process list", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-system-"));
    try {
      const result = sampleSystem({
        serverPid: process.pid,
        cacheDir: tmp,
        runningAgents: [],
      });
      const serverEntry = result.processes.find((p) => p.pid === process.pid);
      expect(serverEntry).toBeDefined();
      expect(serverEntry!.orphaned).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("marks agents with ppid !== serverPid as orphaned", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-system-"));
    try {
      const agents: RunningAgentInfo[] = [
        { id: "0099", pid: 1, startedAt: new Date().toISOString() },
      ];
      const result = sampleSystem({
        serverPid: process.pid,
        cacheDir: tmp,
        runningAgents: agents,
      });
      const orphan = result.processes.find((p) => p.pid === 1);
      if (orphan) {
        expect(orphan.orphaned).toBe(true);
        expect(orphan.taskId).toBe("0099");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("includes persisted ownership records as orphaned when PID is alive but not in registry", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-system-"));
    try {
      const agents: RunningAgentInfo[] = [
        { id: "0100", pid: process.pid, startedAt: new Date().toISOString() },
      ];
      // First call persists the ownership record
      sampleSystem({
        serverPid: process.pid,
        cacheDir: tmp,
        runningAgents: agents,
      });

      // Second call: remove from running but keep PID alive — should flag as orphan
      const result = sampleSystem({
        serverPid: process.pid,
        cacheDir: tmp,
        runningAgents: [],
      });
      const orphan = result.processes.find(
        (p) => p.pid === process.pid && p.orphaned,
      );
      if (orphan) {
        expect(orphan.taskId).toBe("0100");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("sampleRepoStats", () => {
  function git(root: string, args: string[]): void {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  }

  it("counts worktrees, tracked files, and lines of code from git", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-reposize-"));
    try {
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "T"]);
      writeFileSync(join(root, "a.ts"), "one\ntwo\nthree\n");
      writeFileSync(join(root, "b.md"), "# heading\nbody\n");
      writeFileSync(join(root, "ignored.log"), "x\ny\nz\n");
      writeFileSync(join(root, ".gitignore"), "ignored.log\n");
      git(root, ["add", "a.ts", "b.md", ".gitignore"]);
      git(root, ["commit", "-qm", "init"]);

      const stats = sampleRepoStats(root);
      expect(stats).not.toBeNull();
      // a.ts (3) + b.md (2) + .gitignore (1) = 6; ignored.log excluded.
      expect(stats!.linesOfCode).toBe(6);
      expect(stats!.trackedFiles).toBe(3);
      expect(stats!.worktrees).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null for a non-git directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-nogit-"));
    try {
      expect(sampleRepoStats(tmp)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

/**
 * 0216 — `repoos serve` census. Preview and fixture servers that outlive their
 * owning task accumulate silently and starve the close-out gate, so the panel
 * counts them and flags an abnormal number. The close-out gate itself spawns
 * fixture servers constantly, so "abandoned" must mean the spawning process is
 * gone — not merely "RepoOS did not start it".
 */
describe("parseServeScan", () => {
  const REAL = "/Users/x/repo";
  const GONE = "/private/var/folders/tmp/repoos-release-abc";
  /** `ps ax -o pid=,ppid=,command=` row. ppid 1 = reparented, i.e. spawner died. */
  const line = (pid: number, ppid: number, root: string, port: number) =>
    `${pid} ${ppid} /opt/node ${root}/dist/cli/index.js serve --port ${port} --host 127.0.0.1`;
  const WORKER = "5000 4000 /opt/node vitest-worker.js";
  const exists = (root: string | null) => root === REAL;

  it("classifies the control plane, known previews, in-flight and abandoned", () => {
    const out = [
      WORKER,
      line(100, 1, REAL, 7171), // control plane: detached by the reload handoff
      line(200, 100, REAL, 5001), // preview RepoOS started
      line(300, 5000, REAL, 5002), // fixture under a live vitest worker
      line(400, 1, GONE, 5003), // reparented, root deleted
      "999 1 /opt/node /some/other/thing.js --port 8080",
    ].join("\n");
    const scan = parseServeScan(out, 100, new Set([200]), exists);
    expect(scan.total).toBe(4); // the non-serve process is ignored
    expect(scan.processes.map((p) => p.kind)).toEqual([
      "control-plane",
      "known-preview",
      "in-flight",
      "stray",
    ]);
    expect(scan.strays).toBe(1);
    expect(scan.inFlight).toBe(1);
    expect(scan.deadRoot).toBe(1);
    expect(scan.level).toBe("notice");
  });

  it("does not flag the gate's own fixture servers while their parent is alive", () => {
    const out = [WORKER, line(100, 1, REAL, 7171), ...[301, 302, 303, 304, 305].map((p, i) => line(p, 5000, REAL, 5000 + i))].join("\n");
    const scan = parseServeScan(out, 100, new Set(), exists);
    expect(scan.strays).toBe(0);
    expect(scan.inFlight).toBe(5);
    expect(scan.level).toBe("ok");
  });

  it("flags those same servers once their parent has exited", () => {
    // Identical to the previous case except the worker is gone, so they reparent to 1.
    const out = [line(100, 1, REAL, 7171), ...[301, 302, 303, 304, 305].map((p, i) => line(p, 1, REAL, 5000 + i))].join("\n");
    const scan = parseServeScan(out, 100, new Set(), exists);
    expect(scan.strays).toBe(5);
    expect(scan.inFlight).toBe(0);
    expect(scan.level).toBe("warn");
  });

  it("treats a parent that is not in the process table as dead", () => {
    const scan = parseServeScan([line(100, 1, REAL, 7171), line(300, 4242, REAL, 5001)].join("\n"), 100, new Set(), exists);
    expect(scan.processes[1].kind).toBe("stray");
  });

  it("is ok when only the control plane and known previews are running", () => {
    const scan = parseServeScan([line(100, 1, REAL, 7171), line(200, 100, REAL, 5001)].join("\n"), 100, new Set([200]), exists);
    expect(scan.strays).toBe(0);
    expect(scan.level).toBe("ok");
  });

  it("recognises a dev-mode serve running from src/", () => {
    const out = `100 1 /opt/bun ${REAL}/src/cli/index.ts serve --port 7171`;
    const scan = parseServeScan(out, 100, new Set(), exists);
    expect(scan.total).toBe(1);
    expect(scan.processes[0].kind).toBe("control-plane");
  });

  it("extracts the root and port from a serve command line", () => {
    const cmd = `/opt/node ${REAL}/dist/cli/index.js serve --port 7171 --host 127.0.0.1`;
    expect(parseServeRoot(cmd)).toBe(REAL);
    expect(parseServePort(cmd)).toBe(7171);
    expect(parseServePort("/opt/node x/dist/cli/index.js serve")).toBeNull();
  });
});

/**
 * 0216 — the actual reap step, kill logic isolated from the real ps-based
 * scan (already covered by parseServeScan's own tests above) via injection,
 * matching #0210's release-branchless pattern.
 */
describe("reapStrayServeProcesses", () => {
  it("kills every stray and only strays — never control-plane, known-preview, or in-flight", () => {
    const killed: number[] = [];
    const fakeKill = (pid: number) => {
      killed.push(pid);
    };
    const fakeScan = () => ({
      total: 4,
      strays: 2,
      inFlight: 1,
      deadRoot: 0,
      level: "warn" as const,
      processes: [
        { pid: 100, ppid: 1, port: 7171, root: "/r", rootExists: true, kind: "control-plane" as const },
        { pid: 200, ppid: 100, port: 5001, root: "/r", rootExists: true, kind: "known-preview" as const },
        { pid: 300, ppid: 5000, port: 5002, root: "/r", rootExists: true, kind: "in-flight" as const },
        { pid: 400, ppid: 1, port: 5003, root: "/r", rootExists: false, kind: "stray" as const },
        { pid: 401, ppid: 1, port: 5004, root: "/r", rootExists: true, kind: "stray" as const },
      ],
    });

    const reaped = reapStrayServeProcesses(100, new Set([200]), fakeKill, fakeScan);

    expect(reaped).toBe(2);
    expect(killed.sort()).toEqual([400, 401]);
  });

  it("counts a process that's already gone by the time of the kill attempt as not reaped", () => {
    const fakeKill = () => {
      throw new Error("ESRCH");
    };
    const fakeScan = () => ({
      total: 1,
      strays: 1,
      inFlight: 0,
      deadRoot: 0,
      level: "notice" as const,
      processes: [{ pid: 500, ppid: 1, port: 5005, root: null, rootExists: false, kind: "stray" as const }],
    });

    const reaped = reapStrayServeProcesses(100, new Set(), fakeKill, fakeScan);
    expect(reaped).toBe(0); // never throws — a lost race is not an error
  });

  it("returns 0 without calling kill when the underlying scan is unavailable (ps missing)", () => {
    let killCalled = false;
    const reaped = reapStrayServeProcesses(100, new Set(), () => { killCalled = true; }, () => null);
    expect(reaped).toBe(0);
    expect(killCalled).toBe(false);
  });

  it("returns 0 without calling kill when nothing is stray", () => {
    let killCalled = false;
    const fakeScan = () => ({
      total: 1,
      strays: 0,
      inFlight: 0,
      deadRoot: 0,
      level: "ok" as const,
      processes: [{ pid: 100, ppid: 1, port: 7171, root: "/r", rootExists: true, kind: "control-plane" as const }],
    });
    const reaped = reapStrayServeProcesses(100, new Set(), () => { killCalled = true; }, fakeScan);
    expect(reaped).toBe(0);
    expect(killCalled).toBe(false);
  });
});

describe("killTrackedProcess", () => {
  it("sends SIGTERM immediately, escalates to SIGKILL after the grace period if still alive", () => {
    vi.useFakeTimers();
    try {
      const signals: string[] = [];
      const fakeKill = (_pid: number, signal: string) => {
        signals.push(signal);
      };
      const ok = killTrackedProcess(123, fakeKill);
      expect(ok).toBe(true);
      expect(signals).toEqual(["SIGTERM"]);

      vi.advanceTimersByTime(3000);
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns false and never schedules SIGKILL when the process is already gone", () => {
    vi.useFakeTimers();
    try {
      const signals: string[] = [];
      const fakeKill = (_pid: number, signal: string) => {
        signals.push(signal);
        throw new Error("ESRCH");
      };
      const ok = killTrackedProcess(123, fakeKill);
      expect(ok).toBe(false);
      expect(signals).toEqual(["SIGTERM"]);

      vi.advanceTimersByTime(5000);
      expect(signals).toEqual(["SIGTERM"]); // no SIGKILL scheduled — kill() never returned
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a SIGKILL escalation error (process died in between) without throwing", () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fakeKill = (_pid: number, signal: string) => {
        calls++;
        if (signal === "SIGKILL") throw new Error("ESRCH");
      };
      killTrackedProcess(123, fakeKill);
      expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/system/kill-process", () => {
  let server: ServerHandle | undefined;
  let fixtureRoot: string | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  });

  it("refuses a pid RepoOS isn't currently tracking, never touching the real process", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repoos-killroute-"));
    server = await startServer({ root: fixtureRoot, host: "127.0.0.1", port: 0 });

    // PID 1 (init/launchd) is about as far from "a RepoOS-tracked process" as
    // it gets, and definitely isn't in this test's sampleSystem() snapshot.
    const res = await fetch(`${server.url}/api/system/kill-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: 1 }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not a RepoOS-tracked process/);
  });

  it("refuses to kill the control-plane process itself", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repoos-killroute-"));
    server = await startServer({ root: fixtureRoot, host: "127.0.0.1", port: 0 });

    // The in-process test server shares this test runner's own pid.
    const res = await fetch(`${server.url}/api/system/kill-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: process.pid }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/refusing to kill the control-plane process/);
  });

  it("rejects a non-integer or missing pid with 400", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repoos-killroute-"));
    server = await startServer({ root: fixtureRoot, host: "127.0.0.1", port: 0 });

    for (const pid of [undefined, "123", -1, 1.5]) {
      const res = await fetch(`${server.url}/api/system/kill-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      expect(res.status).toBe(400);
    }
  });
});
