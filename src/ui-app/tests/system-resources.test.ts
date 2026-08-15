/**
 * 0091 — system resource sampler tests. The sampler's parsing (of `ps` output)
 * and orphan-detection logic are pure functions tested against fixture strings.
 */
import { describe, expect, it } from "vitest";
import { parsePsOutput, parseServeScan, parseServeRoot, parseServePort, sampleSystem } from "../../server/system";
import type { RunningAgentInfo } from "../../server/agents";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
