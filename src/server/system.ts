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
  /** Truly-free pages only (`os.freemem()`). On macOS this is always tiny — the
   *  OS parks everything it can in cache — so it is a poor "headroom" signal. */
  freeMem: number;
  /** Memory the OS can hand back on demand without swapping: free + inactive +
   *  speculative + purgeable (macOS) or `MemAvailable` (Linux). Falls back to
   *  `freeMem` on other platforms or if the probe fails. This is the number to
   *  reason about for "is there room to run a build". */
  availableMem: number;
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

/** A live `repoos serve` process found on the machine. */
export interface ServeProcessInfo {
  pid: number;
  ppid: number;
  port: number | null;
  /** Repo root the process is serving, parsed from its argv. */
  root: string | null;
  /** False when the root directory is gone — the process is definitively garbage. */
  rootExists: boolean;
  /**
   * `in-flight` is the one that stops this from crying wolf: the close-out
   * gate's own test suite spawns fixture servers constantly, and while their
   * spawning process is still alive they are doing legitimate work. Only a
   * process whose parent has died (reparented to PID 1) is abandoned.
   */
  kind: "control-plane" | "known-preview" | "in-flight" | "stray";
}

/**
 * Machine-wide census of `repoos serve` processes (#0216). Preview and fixture
 * servers that outlive their owning task or test accumulate silently, and the
 * load they generate makes the close-out gate fail on timing-sensitive tests
 * that pass fine in isolation — a false failure that is indistinguishable from
 * a real regression. Surfacing the count makes the accumulation visible before
 * it starts costing close-outs.
 */
export interface ServeScan {
  total: number;
  /** Abandoned: unattributable AND the spawning process is gone. */
  strays: number;
  /** Unattributable but still supervised by a live parent — a running test or gate. */
  inFlight: number;
  /** Strays whose root directory no longer exists. */
  deadRoot: number;
  level: "ok" | "notice" | "warn";
  processes: ServeProcessInfo[];
}

export interface SystemStats {
  machine: MachineInfo;
  totals: {
    cpuPercent: number;
    memBytes: number;
    memPercent: number;
  };
  processes: ProcessInfo[];
  serve: ServeScan | null;
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

/**
 * Bytes the OS can reclaim on demand without swapping. `os.freemem()` only
 * counts fully-idle pages, which on macOS is near-zero at all times because the
 * kernel fills unused RAM with cache and inactive pages it will drop the moment
 * anything asks — so the raw "used" figure sits pinned near total and tells you
 * nothing about whether a build will fit. Returns `os.freemem()` when the
 * platform probe is unavailable or fails.
 */
function availableMemBytes(): number {
  const p = platform();
  if (p === "darwin") {
    const out = safeExecFileSync("vm_stat", []);
    if (out) {
      const pageSize = Number(out.match(/page size of (\d+) bytes/)?.[1]) || 4096;
      const pages = (label: string): number =>
        Number(out.match(new RegExp(`${label}:\\s+(\\d+)\\.`))?.[1]) || 0;
      const reclaimable =
        pages("Pages free") +
        pages("Pages inactive") +
        pages("Pages speculative") +
        pages("Pages purgeable");
      if (reclaimable > 0) return reclaimable * pageSize;
    }
  } else if (p === "linux") {
    try {
      const avail = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)\s+kB/m);
      if (avail) return Number(avail[1]) * KB;
    } catch {
      /* fall through to freemem() */
    }
  }
  return freemem();
}

function machineInfo(): MachineInfo {
  return {
    cpuCount: cpus().length,
    totalMem: totalmem(),
    freeMem: freemem(),
    availableMem: availableMemBytes(),
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

/**
 * A stray count at or above this is a real problem, not untidiness: it is the
 * regime where #0211 failed its close-out gate twice on unrelated flaky tests.
 */
const SERVE_WARN_THRESHOLD = 4;

/** Matches both a compiled (`dist/cli/index.js`) and a dev (`src/cli/index.ts`) serve. */
const SERVE_CMD_RE = /[/\\](?:dist[/\\]cli[/\\]index\.js|src[/\\]cli[/\\]index\.ts)\s+serve\b/;

/** Extract the repo root a serve process is running from, or null. */
export function parseServeRoot(command: string): string | null {
  const m = command.match(/(\S+?)[/\\](?:dist[/\\]cli[/\\]index\.js|src[/\\]cli[/\\]index\.ts)\s+serve\b/);
  return m ? m[1] : null;
}

/** Extract `--port N` from a serve command line, or null. */
export function parseServePort(command: string): number | null {
  const m = command.match(/--port[= ](\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Parse `ps ax -o pid=,ppid=,command=` output into serve-process records.
 *
 * Classification order matters. The control plane is checked first because the
 * reload handoff deliberately detaches it, so it also runs with `ppid` 1 and
 * would otherwise look abandoned. Everything else that RepoOS did not start is
 * abandoned only if its parent is gone — a fixture server with a live vitest
 * worker above it is the gate doing its job, not a leak.
 *
 * Exported for testing so classification can be exercised without spawning servers.
 */
export function parseServeScan(
  output: string,
  serverPid: number,
  knownPids: Set<number>,
  rootExists: (root: string | null) => boolean,
): ServeScan {
  const rows: { pid: number; ppid: number; command: string }[] = [];
  const livePids = new Set<number>();
  for (const line of output.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    livePids.add(pid);
    rows.push({ pid, ppid: Number(m[2]), command: m[3] });
  }

  const processes: ServeProcessInfo[] = [];
  for (const { pid, ppid, command } of rows) {
    if (!SERVE_CMD_RE.test(command)) continue;
    const root = parseServeRoot(command);
    // A parent of 1 means the process was reparented after its spawner died.
    const supervised = ppid !== 1 && livePids.has(ppid);
    const kind: ServeProcessInfo["kind"] = pid === serverPid
      ? "control-plane"
      : knownPids.has(pid)
        ? "known-preview"
        : supervised
          ? "in-flight"
          : "stray";
    processes.push({ pid, ppid, port: parseServePort(command), root, rootExists: rootExists(root), kind });
  }

  const strays = processes.filter((p) => p.kind === "stray");
  const deadRoot = strays.filter((p) => !p.rootExists).length;
  const level: ServeScan["level"] = strays.length === 0
    ? "ok"
    : strays.length >= SERVE_WARN_THRESHOLD
      ? "warn"
      : "notice";
  return {
    total: processes.length,
    strays: strays.length,
    inFlight: processes.filter((p) => p.kind === "in-flight").length,
    deadRoot,
    level,
    processes,
  };
}

let serveScanCache: { at: number; scan: ServeScan } | null = null;
/** The census walks every process on the machine, so it runs far less often than the 5s sample. */
const SERVE_SCAN_TTL_MS = 20_000;

/**
 * Census live `repoos serve` processes. Cached — `ps ax` lists every process on
 * the machine, which is much heavier than the targeted per-PID sample.
 */
export function scanServeProcesses(serverPid: number, knownPids: Set<number>): ServeScan | null {
  const now = Date.now();
  if (serveScanCache && now - serveScanCache.at < SERVE_SCAN_TTL_MS) return serveScanCache.scan;
  const output = safeExecFileSync("ps", ["ax", "-o", "pid=,ppid=,command="]);
  if (output === null) return serveScanCache?.scan ?? null;
  const scan = parseServeScan(output, serverPid, knownPids, (root) => root !== null && existsSync(root));
  serveScanCache = { at: now, scan };
  return scan;
}

/** Drop the cached census. Exported for tests. */
export function resetServeScanCache(): void {
  serveScanCache = null;
}

/**
 * Reap every `stray` process the census finds — a process whose spawning
 * parent is confirmed dead (reparented to PID 1). This is safe by
 * construction: `in-flight` processes (a live parent still supervising them,
 * e.g. the close-out gate's own test suite mid-run) are never included, and
 * neither is the control plane or a known preview. Killing a stray destroys
 * no live work — nothing will ever come back to claim it.
 *
 * Root cause this offsets (#0216): a failed reload-replacement handoff kills
 * only the direct child process (`ReloadManager.killChild`, plain SIGTERM,
 * not a process-group kill), so anything that child spawned before failing
 * its readiness check survives as an orphan. Under repeated failed reload
 * attempts this accumulates fast enough to strain the whole machine, not just
 * starve the close-out gate. This periodic sweep is the general safety net;
 * the process-group fix in reload.ts is the more targeted root-cause fix,
 * tracked separately.
 */
export function reapStrayServeProcesses(
  serverPid: number,
  knownPids: Set<number>,
  kill: (pid: number, signal: string) => void = process.kill.bind(process),
  scan: (serverPid: number, knownPids: Set<number>) => ServeScan | null = (p, k) => {
    resetServeScanCache();
    return scanServeProcesses(p, k);
  },
): number {
  const result = scan(serverPid, knownPids);
  if (!result) return 0;
  let reaped = 0;
  for (const p of result.processes) {
    if (p.kind !== "stray") continue;
    try {
      kill(p.pid, "SIGTERM");
      reaped++;
    } catch {
      /* already gone */
    }
  }
  return reaped;
}

/**
 * Kill a single process by PID: SIGTERM first, escalating to SIGKILL after a
 * grace period if it hasn't exited. Same sequence AgentRunner.stop() and the
 * stray-serve reaper already use elsewhere. Backs the manual "Kill" action in
 * the System Resources panel — callers must verify the PID is one RepoOS
 * itself is tracking (a fresh sampleSystem()/scanServeProcesses() result)
 * before calling this; it does not re-check.
 */
export function killTrackedProcess(
  pid: number,
  kill: (pid: number, signal: NodeJS.Signals) => void = process.kill.bind(process),
): boolean {
  try {
    kill(pid, "SIGTERM");
  } catch {
    return false; // already gone, or no such process
  }
  const t = setTimeout(() => {
    try {
      kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 3000);
  t.unref?.();
  return true;
}

export interface SampleSystemOptions {
  serverPid: number;
  cacheDir: string;
  runningAgents: RunningAgentInfo[];
  /** PIDs of preview servers RepoOS knows it started — never counted as strays. */
  knownServePids?: number[];
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
  let totalMemPercent = 0;
  const processes: ProcessInfo[] = [];

  for (const pid of allPids) {
    const ps = psByPid.get(pid);
    if (!ps) continue;
    const memBytes = ps.rssKB * KB;
    totalCpu += ps.cpuPercent;
    totalMem += memBytes;
    totalMemPercent += ps.memPercent;
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
    totalMemPercent += ps.memPercent;
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
      memPercent: Math.round(totalMemPercent * 10) / 10,
    },
    processes,
    serve: scanServeProcesses(serverPid, new Set(opts.knownServePids ?? [])),
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
