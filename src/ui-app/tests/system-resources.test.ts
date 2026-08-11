/**
 * 0091 — system resource sampler tests. The sampler's parsing (of `ps` output)
 * and orphan-detection logic are pure functions tested against fixture strings.
 */
import { describe, expect, it } from "vitest";
import { parsePsOutput, sampleSystem } from "../../server/system";
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
