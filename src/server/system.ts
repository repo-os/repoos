/**
 * System resource sampler. Uses `node:os` for machine-wide facts and `ps` for
 * per-process CPU/memory stats. One `ps` invocation per interval covers all
 * tracked PIDs — never one call per process. Zero runtime dependencies.
 *
 * Orphan detection: a live process not in the AgentRunner registry, or whose
 * ppid is no longer the server's pid, is marked orphaned.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cpus, totalmem, freemem, loadavg, platform } from "node:os";
import type { RunningAgentInfo } from "./agents.js";

export interface MachineInfo {
  cpuCount: number;
  totalMem: number;
  freeMem: number;
  loadavg: number[];
  platform: string;
}

export interface ProcessInfo {
  pid: number;
  taskId: string | null;
  cpuPercent: number;
  memBytes: number;
  elapsed: string;
  orphaned: boolean;
  /** True when attributed by command-name match only, not by registry. */
  unverified: boolean;
}

export interface SystemStats {
  machine: MachineInfo;
  totals: {
    cpuPercent: number;
    memBytes: number;
    memPercent: number;
  };
  processes: ProcessInfo[];
  serverPid: number;
  at: string;
}

interface PsRecord {
  pid: number;
  ppid: number;
  cpuPercent: number;
  memPercent: number;
  rssKB: number;
  elapsed: string;
}

export interface OwnershipRecord {
  pid: number;
  taskId: string;
  startedAt: string;
  executable: string;
  workdir: string;
}

const OWNERSHIP_FILE = "repoos-ownership.json";
const KB = 1024;

function safeExecFileSync(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {
    return null;
  }
}

function parsePsLine(line: string): PsRecord | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const pid = Number(parts[0]);
  const ppid = Number(parts[1]);
  const cpuPercent = Number(parts[2]);
  const memPercent = Number(parts[3]);
  const rssKB = Number(parts[4]);
  const elapsed = parts.slice(5).join(" ");
  if (isNaN(pid) || isNaN(ppid) || isNaN(cpuPercent) || isNaN(memPercent) || isNaN(rssKB)) {
    return null;
  }
  return { pid, ppid, cpuPercent, memPercent, rssKB, elapsed };
}

/**
 * Parse `ps -o pid=,ppid=,%cpu=,%mem=,rss=,etime=` output into records.
 * One `ps` call covers all PIDs at once. Export for testing.
 */
export function parsePsOutput(output: string): PsRecord[] {
  return output.split("\n").map(parsePsLine).filter((r): r is PsRecord => r !== null);
}

function machineInfo(): MachineInfo {
  return {
    cpuCount: cpus().length,
    totalMem: totalmem(),
    freeMem: freemem(),
    loadavg: loadavg(),
    platform: platform(),
  };
}

function sampleProcesses(pids: number[]): PsRecord[] {
  if (pids.length === 0) return [];
  const pidArgs = pids.map(String);
  const output = safeExecFileSync("ps", [
    "-o", "pid=,ppid=,%cpu=,%mem=,rss=,etime=",
    "-p", ...pidArgs,
  ]);
  if (!output) return [];
  return parsePsOutput(output);
}

/**
 * Persist RepoOS process ownership so orphan detection survives a server restart.
 */
function readOwnership(cacheDir: string): OwnershipRecord[] {
  const file = join(cacheDir, OWNERSHIP_FILE);
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(raw) as OwnershipRecord[];
  } catch {
    return [];
  }
}

function writeOwnership(cacheDir: string, records: OwnershipRecord[]): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, OWNERSHIP_FILE), JSON.stringify(records, null, 2), "utf8");
  } catch {
    /* best-effort: sampling should never fail on a writable-directory problem */
  }
}

/**
 * Update the persisted ownership records: add entries for newly-spawned agents
 * (registry entries not yet persisted) and remove entries whose PIDs are dead.
 */
function syncOwnership(
  cacheDir: string,
  running: RunningAgentInfo[],
  livePids: Set<number>,
): OwnershipRecord[] {
  const existing = readOwnership(cacheDir);
  const byPid = new Map<number, OwnershipRecord>();
  for (const r of existing) byPid.set(r.pid, r);

  for (const info of running) {
    if (info.pid <= 0) continue;
    if (!byPid.has(info.pid)) {
      byPid.set(info.pid, {
        pid: info.pid,
        taskId: info.id,
        startedAt: info.startedAt,
        executable: "",
        workdir: info.workdir ?? "",
      });
    }
  }

  const out: OwnershipRecord[] = [];
  for (const [pid, rec] of byPid) {
    if (livePids.has(pid) || running.some((r) => r.pid === pid)) {
      out.push(rec);
    }
  }

  writeOwnership(cacheDir, out);
  return out;
}

export interface SampleSystemOptions {
  serverPid: number;
  cacheDir: string;
  runningAgents: RunningAgentInfo[];
}

/**
 * Sample the system: machine facts, RepoOS process totals, and a per-process
 * breakdown with orphan detection. One `ps` call covers all tracked + agent PIDs.
 */
export function sampleSystem(opts: SampleSystemOptions): SystemStats {
  const machine = machineInfo();
  const serverPid = opts.serverPid;

  const agentPids = new Set(opts.runningAgents.map((a) => a.pid).filter((p) => p > 0));
  const idByPid = new Map<number, string>();
  for (const a of opts.runningAgents) {
    if (a.pid > 0) idByPid.set(a.pid, a.id);
  }

  const allPids = [serverPid, ...agentPids];
  const ownership = syncOwnership(opts.cacheDir, opts.runningAgents, new Set(allPids));
  const ownershipByPid = new Map<number, OwnershipRecord>();
  for (const o of ownership) ownershipByPid.set(o.pid, o);

  const records = sampleProcesses(allPids);
  const psByPid = new Map<number, PsRecord>();
  for (const r of records) psByPid.set(r.pid, r);

  let totalCpu = 0;
  let totalMem = 0;
  const processes: ProcessInfo[] = [];

  for (const pid of allPids) {
    const ps = psByPid.get(pid);
    if (!ps) continue;
    const memBytes = ps.rssKB * KB;
    totalCpu += ps.cpuPercent;
    totalMem += memBytes;
    const owned = ownershipByPid.get(pid);
    const taskId = idByPid.get(pid) ?? owned?.taskId ?? null;
    const orphaned = ps.ppid !== serverPid && pid !== serverPid;
    processes.push({
      pid,
      taskId,
      cpuPercent: ps.cpuPercent,
      memBytes,
      elapsed: ps.elapsed,
      orphaned,
      unverified: !idByPid.has(pid) && !owned,
    });
  }

  // Discover orphaned RepoOS processes: PIDs that are NOT in the current
  // running registry but WERE persisted as RepoOS-owned. Also include
  // REGISTERED agents whose ppid is no longer the server.
  const seenPids = new Set(allPids);
  for (const [pid, owned] of ownershipByPid) {
    if (seenPids.has(pid)) continue;
    if (!isProcessAlive(pid)) continue;
    const ps = sampleSingleProcess(pid);
    if (!ps) continue;
    const memBytes = ps.rssKB * KB;
    totalCpu += ps.cpuPercent;
    totalMem += memBytes;
    processes.push({
      pid,
      taskId: owned.taskId,
      cpuPercent: ps.cpuPercent,
      memBytes,
      elapsed: ps.elapsed,
      orphaned: true,
      unverified: false,
    });
  }

  // Sort: orphans first, then by CPU descending
  processes.sort((a, b) => {
    if (a.orphaned !== b.orphaned) return a.orphaned ? -1 : 1;
    return b.cpuPercent - a.cpuPercent;
  });

  return {
    machine,
    totals: {
      cpuPercent: Math.round(totalCpu * 10) / 10,
      memBytes: totalMem,
      memPercent: machine.totalMem > 0 ? Math.round((totalMem / machine.totalMem) * 1000) / 10 : 0,
    },
    processes,
    serverPid,
    at: new Date().toISOString(),
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sampleSingleProcess(pid: number): PsRecord | null {
  const output = safeExecFileSync("ps", [
    "-o", "pid=,ppid=,%cpu=,%mem=,rss=,etime=",
    "-p", String(pid),
  ]);
  if (!output) return null;
  const records = parsePsOutput(output);
  return records[0] ?? null;
}

/**
 * True when the current platform can run the `ps` command with the expected
 * flags (pid=,ppid=,%cpu=,%mem=,rss=,etime=). Windows `ps` (PowerShell alias)
 * does not support these flags, so per-process stats are unavailable there.
 */
export function psAvailable(): boolean {
  if (platform() === "win32") return false;
  return safeExecFileSync("ps", ["-o", "pid=", "-p", String(process.pid)]) !== null;
}
