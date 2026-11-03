/**
 * System resource sampler. Uses `node:os` for machine-wide facts and `ps` for
 * per-process CPU/memory stats. One `ps` invocation per interval covers all
 * tracked PIDs — never one call per process. Zero runtime dependencies.
 *
 * Orphan detection: a live process not in the AgentRunner registry, or whose
 * ppid is no longer the server's pid, is marked orphaned.
 */
import { execFile } from "node:child_process";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { basename, join } from "node:path";
import { cpus, totalmem, freemem, loadavg, platform } from "node:os";
import { type PressureSnapshot } from "../core/pressure-guard.js";
import { localCheckLockRoot } from "../core/cross-process-slots.js";
import { registeredEngineerCount, type GlobalEngineerCount } from "../core/global-engineers.js";
import type { RepoOSConfig } from "../core/types.js";
import type { RunningAgentInfo } from "./agents.js";
import { getGitWorker, gitWorkerInFlight, type GitWorkerJobInfo } from "./git-worker.js";

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

/**
 * One machine-wide process, labeled by whether RepoOS is responsible for it.
 * `repoos` means the process is the server itself, a tracked agent, or a
 * descendant of either (a build, check, preview or headless browser). Anything
 * else is the rest of the machine — the Chrome helpers, renderer and
 * WindowServer that made the 2026-10-20 incident look like RepoOS load.
 */
export interface TopProcessInfo {
  pid: number;
  command: string;
  cpuPercent: number;
  memBytes: number;
  memPercent: number;
  owner: "repoos" | "other";
}

export interface TopProcesses {
  byCpu: TopProcessInfo[];
  byMemory: TopProcessInfo[];
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
   *
   * `foreign` is a detached serve process for a DIFFERENT, still-present repo
   * root — another repo's control plane started via `just serve` / `nohup`
   * (so its ppid is also 1). It is not this server's to reap; never SIGTERMed,
   * never counted as an abandoned stray.
   */
  kind: "control-plane" | "known-preview" | "in-flight" | "stray" | "foreign";
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

/**
 * Cheap "size of the codebase" facts for the Control page. Derived from git, so
 * gitignored files (dist/, node_modules/) are excluded for free.
 * Sampled behind a TTL cache — the numbers barely move between 5s polls.
 */
export interface RepoStats {
  /** Registered git worktrees, including the main checkout. */
  worktrees: number;
  /** Files tracked by git on the checked-out branch. */
  trackedFiles: number;
  /** Total lines across tracked text files (binary files skipped). */
  linesOfCode: number;
  /**
   * Advisory ceiling from config (`worktreeWarnThreshold`, default 20). The UI
   * turns the worktree count amber when `worktrees` exceeds this. 0 disables.
   */
  worktreeWarnThreshold: number;
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
  /** Codebase size facts, or null when the root is not a git repo / git is missing. */
  repo: RepoStats | null;
  /** Memory-first pressure verdict (#0871). */
  pressure: PressureSnapshot;
  /** Shared build/test slots on this host (#0961). */
  heavyJobs: { running: number; queued: number };
  /** In-flight git worker jobs, with queue wait vs run time (#0974). */
  gitJobs: GitWorkerJobInfo[];
  /** Top CPU and memory consumers across the whole machine, RepoOS vs other. */
  topProcesses: TopProcesses;
  /** Engineers across every registered RepoOS server on this machine (#0871). */
  globalEngineers: GlobalEngineerCount | null;
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

function safeExecFile(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : stdout),
    );
  });
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
  return output
    .split("\n")
    .map(parsePsLine)
    .filter((r): r is PsRecord => r !== null);
}

export interface ProcessListingRecord extends PsRecord {
  command: string;
}

/**
 * Parse `ps ax -o pid=,ppid=,%cpu=,%mem=,rss=,comm=` into records. The command
 * is the rest of the line, so paths with spaces survive.
 */
export function parseProcessListing(output: string): ProcessListingRecord[] {
  const out: ProcessListingRecord[] = [];
  for (const line of output.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const cpuPercent = Number(parts[2]);
    const memPercent = Number(parts[3]);
    const rssKB = Number(parts[4]);
    if ([pid, ppid, cpuPercent, memPercent, rssKB].some((n) => !Number.isFinite(n))) continue;
    out.push({
      pid,
      ppid,
      cpuPercent,
      memPercent,
      rssKB,
      command: parts.slice(5).join(" ").trim(),
      elapsed: "",
    });
  }
  return out;
}

function commandLabel(command: string): string {
  const raw = command.trim();
  if (!raw) return "(unknown)";
  // `comm` is a path on macOS and a bare name on Linux, and a macOS app path
  // can contain spaces ("Google Chrome Helper"), so take the basename of the
  // whole string rather than the first whitespace token.
  const label = raw.includes("/") ? basename(raw) : raw;
  return label.length > 40 ? `${label.slice(0, 37)}…` : label;
}

/**
 * Top CPU/memory consumers with RepoOS ownership. A process is RepoOS-owned
 * when it or an ancestor is in `knownPids` — the server, a tracked agent, an
 * owned orphan or a known preview. Walk the parent chain so builds, checks and
 * headless browsers spawned underneath those are attributed correctly without
 * ever matching a command name.
 *
 * Exported for tests, which pass a fixture listing.
 */
export function classifyTopProcesses(
  records: ProcessListingRecord[],
  knownPids: Set<number>,
  limit = 10,
): TopProcesses {
  const byPid = new Map(records.map((r) => [r.pid, r]));
  const ownerOf = (record: ProcessListingRecord): "repoos" | "other" => {
    let current: ProcessListingRecord | undefined = record;
    const seen = new Set<number>();
    for (let depth = 0; current && depth < 32; depth++) {
      if (knownPids.has(current.pid)) return "repoos";
      if (seen.has(current.pid)) break;
      seen.add(current.pid);
      current = byPid.get(current.ppid);
    }
    return "other";
  };
  const items = records
    .filter((r) => r.pid > 0)
    .map((r) => ({
      pid: r.pid,
      command: commandLabel(r.command),
      cpuPercent: Math.max(0, r.cpuPercent),
      memBytes: Math.max(0, r.rssKB) * KB,
      memPercent: Math.max(0, r.memPercent),
      owner: ownerOf(r),
    }));
  const byCpu = [...items].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, limit);
  const byMemory = [...items].sort((a, b) => b.memBytes - a.memBytes).slice(0, limit);
  return { byCpu, byMemory };
}

async function sampleProcessListing(): Promise<ProcessListingRecord[]> {
  const output = await safeExecFile("ps", ["ax", "-o", "pid=,ppid=,%cpu=,%mem=,rss=,comm="]);
  return output ? parseProcessListing(output) : [];
}

function machineInfo(availableMemBytes: number): MachineInfo {
  const freeMem = freemem();
  return {
    cpuCount: cpus().length,
    totalMem: totalmem(),
    freeMem,
    // Reclaimable memory includes free memory by definition, but the two are
    // sampled a moment apart (and on Linux libuv's freemem() is itself
    // MemAvailable), so a busy box can read available < free. Clamp.
    availableMem: Math.max(availableMemBytes, freeMem),
    loadavg: loadavg(),
    platform: platform(),
  };
}

let repoStatsCache: { at: number; root: string; stats: RepoStats } | null = null;
const REPO_STATS_TTL_MS = 30_000;

/**
 * git-derived codebase size: worktree count, tracked-file count, and total
 * lines across tracked text files. Three `git` spawns, so memoised for 30s —
 * the SSE loop calls this every 5s and these numbers change on the order of
 * commits, not seconds. Returns the last good value (or null) on git failure.
 */
export async function sampleRepoStats(
  root: string,
  worktreeWarnThreshold = 20,
): Promise<RepoStats | null> {
  const now = Date.now();
  if (
    repoStatsCache &&
    repoStatsCache.root === root &&
    now - repoStatsCache.at < REPO_STATS_TTL_MS
  ) {
    return { ...repoStatsCache.stats, worktreeWarnThreshold };
  }
  const worker = getGitWorker(root);
  const [overview, filesRun, locRun] = await Promise.all([
    worker.gitOverview(),
    worker.runGit(root, ["ls-files"]),
    worker.runGit(root, ["grep", "-I", "--count", "-e", ""]),
  ]);
  if (!overview.useGit || filesRun.status !== 0 || (locRun.status !== 0 && locRun.status !== 1)) {
    // Git unavailable or not a repo: keep serving a stale value for THIS root,
    // never another root's.
    return repoStatsCache?.root === root
      ? { ...repoStatsCache.stats, worktreeWarnThreshold }
      : null;
  }

  // Empty pattern matches every line; -I skips binary files. One spawn yields
  // `path:<linecount>` per text file.
  let linesOfCode = 0;
  for (const line of locRun.stdout.split("\n")) {
    const m = line.match(/:(\d+)$/);
    if (m) linesOfCode += Number(m[1]);
  }

  const stats: RepoStats = {
    worktrees: overview.worktrees.size,
    trackedFiles: filesRun.stdout.split("\n").filter(Boolean).length,
    linesOfCode,
    worktreeWarnThreshold,
  };
  repoStatsCache = { at: now, root, stats };
  return stats;
}

async function sampleProcesses(pids: number[]): Promise<PsRecord[]> {
  if (pids.length === 0) return [];
  const pidArgs = pids.map(String);
  const output = await safeExecFile("ps", [
    "-o",
    "pid=,ppid=,%cpu=,%mem=,rss=,etime=",
    "-p",
    ...pidArgs,
  ]);
  if (!output) return [];
  return parsePsOutput(output);
}

/**
 * Persist RepoOS process ownership so orphan detection survives a server restart.
 */
export function readProcessOwnership(cacheDir: string): OwnershipRecord[] {
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
  const existing = readProcessOwnership(cacheDir);
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
  const m = command.match(
    /(\S+?)[/\\](?:dist[/\\]cli[/\\]index\.js|src[/\\]cli[/\\]index\.ts)\s+serve\b/,
  );
  return m ? m[1] : null;
}

/** True when two repo-root paths point at the same directory (symlink-safe). */
function sameRoot(a: string | null, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
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
  ownRoot?: string,
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
    const rootIsLive = rootExists(root);
    // A parent of 1 means the process was reparented after its spawner died.
    const supervised = ppid !== 1 && livePids.has(ppid);
    const kind: ServeProcessInfo["kind"] =
      pid === serverPid
        ? "control-plane"
        : knownPids.has(pid)
          ? "known-preview"
          : supervised
            ? "in-flight"
            : // A detached serve for another repo whose root still exists is that
              // repo's control plane (also ppid 1) — not ours to touch. Only an
              // orphan of OUR root, or one whose root is gone, is a real stray.
              ownRoot && root && rootIsLive && !sameRoot(root, ownRoot)
              ? "foreign"
              : "stray";
    processes.push({
      pid,
      ppid,
      port: parseServePort(command),
      root,
      rootExists: rootIsLive,
      kind,
    });
  }

  const strays = processes.filter((p) => p.kind === "stray");
  const deadRoot = strays.filter((p) => !p.rootExists).length;
  const level: ServeScan["level"] =
    strays.length === 0 ? "ok" : strays.length >= SERVE_WARN_THRESHOLD ? "warn" : "notice";
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
export async function scanServeProcesses(
  serverPid: number,
  knownPids: Set<number>,
  ownRoot?: string,
): Promise<ServeScan | null> {
  const now = Date.now();
  if (serveScanCache && now - serveScanCache.at < SERVE_SCAN_TTL_MS) return serveScanCache.scan;
  const output = await safeExecFile("ps", ["ax", "-o", "pid=,ppid=,command="]);
  if (output === null) return serveScanCache?.scan ?? null;
  const scan = parseServeScan(
    output,
    serverPid,
    knownPids,
    (root) => root !== null && existsSync(root),
    ownRoot,
  );
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
export async function reapStrayServeProcesses(
  serverPid: number,
  knownPids: Set<number>,
  kill: (pid: number, signal: string) => void = process.kill.bind(process),
  scan?: (
    serverPid: number,
    knownPids: Set<number>,
  ) => ServeScan | null | Promise<ServeScan | null>,
  ownRoot?: string,
): Promise<number> {
  const doScan =
    scan ??
    (async (p: number, k: Set<number>) => {
      resetServeScanCache();
      return await scanServeProcesses(p, k, ownRoot);
    });
  const result = await doScan(serverPid, knownPids);
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

// ---- Leaked test-helper census (#1017 phase 2) ---------------------------

/** A helper older than this, orphaned (ppid 1), is safe to treat as leaked. */
export const TEST_HELPER_STALE_MS = 30 * 60 * 1000;
/**
 * A run root whose mtime heartbeat is younger than this still has a live test
 * run (see `tests/setup/global-reap.ts`). Do not touch its helpers.
 */
export const TEST_HELPER_LIVE_OWNER_MS = 15 * 60 * 1000;

/**
 * RepoOS test fixtures live in uniquely named temp dirs. Matching one of these
 * exact path components is what identifies a test helper — never a process
 * name, and never a broad `repoos` substring. The run root (`repoos-vitest-*`)
 * and the fixture dirs a test creates directly under the OS temp dir
 * (`repoos-cli-api-*`, `repoos-preview-req-*`) all count.
 */
const TEST_HELPER_ROOT_RE =
  /((?:\/[^\s"'`=<>|&;]+)*\/repoos-(?:vitest|cli-api|preview-req(?:-e2e)?)-[A-Za-z0-9]+)(?=$|[/\s"'`=<>|&;])/;

/** Extract the RepoOS test temp dir named in `text`, or null. */
export function parseTestHelperRoot(text: string): string | null {
  const match = text.match(TEST_HELPER_ROOT_RE);
  if (!match) return null;
  // A nested fixture (`repoos-vitest-*/file-*/repoos-cli-api-*`) is owned by
  // its run root; return the ancestor so liveness is checked against the run
  // root's heartbeat, not a fixture dir the helper may have stopped touching.
  return owningRunRoot(match[1]) ?? match[1];
}

/** True when `text` (a command line or cwd) is at/under `root`. */
function pathInsideText(text: string, root: string): boolean {
  const normalized = root.replace(/\/+$/, "");
  return text === normalized || text.includes(`${normalized}/`);
}

/** The `repoos-vitest-*` run root containing `path`, or null. */
function owningRunRoot(path: string): string | null {
  const parts = path.split("/");
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join("/");
    if (/\/repoos-vitest-[A-Za-z0-9]+$/.test(candidate)) return candidate;
  }
  return null;
}

/** Best-effort cwd via `lsof` (macOS/Linux); null when the probe is unavailable. */
async function readProcessCwd(pid: number): Promise<string | null> {
  const output = await safeExecFile("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (!output) return null;
  const line = output.split("\n").find((entry) => entry.startsWith("n"));
  return line ? line.slice(1) : null;
}

/** The `REPOOS_TEST_HELPER` env tag, where `/proc` exposes it (Linux). */
function readTestHelperTag(pid: number): string | null {
  if (process.platform !== "linux") return null;
  try {
    const entries = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    const match = entries.find((entry) => entry.startsWith("REPOOS_TEST_HELPER="));
    return match ? match.slice("REPOOS_TEST_HELPER=".length) : null;
  } catch {
    return null;
  }
}

/** One candidate row from the test-helper census, before classification. */
export interface TestHelperCandidate {
  pid: number;
  ppid: number;
  pgid: number;
  uid: number;
  ageMs: number;
  command: string;
  cwd?: string | null;
  /** `REPOOS_TEST_HELPER` value when the environment is readable. */
  helperTag?: string | null;
}

export interface TestHelperProcessInfo extends TestHelperCandidate {
  kind: "leaked" | "live" | "ignored";
  reason: string;
  /** RepoOS temp dir that identifies the helper, when one matched. */
  tempRoot: string | null;
}

export interface TestHelperScan {
  /** Orphaned candidates examined (same uid, ppid 1, old enough). */
  candidates: number;
  leaked: number;
  processes: TestHelperProcessInfo[];
}

export interface TestHelperClassifyOptions {
  uid: number;
  now: number;
  /** True when a live test run still owns this temp dir. */
  isLiveTempRoot: (root: string) => boolean;
  /** Sibling worktrees directory for this repo; never reaped. */
  worktreesRoot?: string | null;
}

/**
 * Decide whether one candidate is a leaked test helper. Every guard must pass:
 * same uid, reparented (ppid 1), old enough, identified by a RepoOS temp-dir
 * path (command line, cwd, or the `REPOOS_TEST_HELPER` tag), not owned by a live
 * run, and not inside a task worktree.
 */
export function classifyTestHelperProcess(
  candidate: TestHelperCandidate,
  opts: TestHelperClassifyOptions,
): TestHelperProcessInfo {
  const verdict = (
    kind: TestHelperProcessInfo["kind"],
    reason: string,
    tempRoot: string | null,
  ) => ({
    ...candidate,
    kind,
    reason,
    tempRoot,
  });
  if (candidate.uid !== opts.uid) return verdict("ignored", "different uid", null);
  if (candidate.ppid !== 1) return verdict("ignored", "still supervised", null);
  if (candidate.ageMs < TEST_HELPER_STALE_MS)
    return verdict("ignored", "younger than the stale threshold", null);

  const paths = [candidate.command, candidate.cwd ?? "", candidate.helperTag ?? ""].filter(Boolean);
  if (opts.worktreesRoot && paths.some((path) => pathInsideText(path, opts.worktreesRoot!))) {
    return verdict("ignored", "inside a live task worktree", null);
  }
  const tempRoot =
    parseTestHelperRoot(candidate.command) ??
    parseTestHelperRoot(candidate.cwd ?? "") ??
    parseTestHelperRoot(candidate.helperTag ?? "");
  if (!tempRoot && !candidate.helperTag) {
    return verdict("ignored", "not a RepoOS test helper", null);
  }
  if (tempRoot && opts.isLiveTempRoot(tempRoot)) {
    return verdict("live", "owned by a live test run", tempRoot);
  }
  return verdict(
    "leaked",
    tempRoot ? "orphaned test helper in a stale temp dir" : "orphaned tagged test helper",
    tempRoot,
  );
}

/** Parse `ps ax -o pid=,ppid=,pgid=,uid=,etime=,command=` into raw rows. */
function parseTestHelperRows(
  output: string,
): Pick<TestHelperCandidate, "pid" | "ppid" | "pgid" | "uid" | "ageMs" | "command">[] {
  const rows: Pick<TestHelperCandidate, "pid" | "ppid" | "pgid" | "uid" | "ageMs" | "command">[] =
    [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      uid: Number(match[4]),
      ageMs: parseElapsedMs(match[5]),
      command: match[6],
    });
  }
  return rows;
}

/** Parse `ps` `etime` (`[[dd-]hh:]mm:ss`) into milliseconds; 0 when unknown. */
function parseElapsedMs(value: string): number {
  const match = value.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!match) return 0;
  return (
    (Number(match[1] ?? 0) * 86_400 +
      Number(match[2] ?? 0) * 3_600 +
      Number(match[3]) * 60 +
      Number(match[4])) *
    1_000
  );
}

/** Whether `root` is still owned by a live run: fresh heartbeat or a supervised process. */
function liveRootChecker(
  rows: Pick<TestHelperCandidate, "pid" | "ppid" | "command">[],
  now: number,
): (root: string) => boolean {
  const liveRoots = rows
    .filter((row) => row.ppid !== 1)
    .map((row) => parseTestHelperRoot(row.command))
    .filter((root): root is string => root !== null);
  return (root) => {
    if (
      liveRoots.some(
        (live) => live === root || live.startsWith(`${root}/`) || root.startsWith(`${live}/`),
      )
    ) {
      return true;
    }
    const owned = owningRunRoot(root) ?? root;
    try {
      return now - statSync(owned).mtimeMs < TEST_HELPER_LIVE_OWNER_MS;
    } catch {
      return false;
    }
  };
}

/**
 * Census orphaned test helpers. Walks `ps` once, then probes cwd/env only for
 * the small set that is already a candidate (same uid, ppid 1, old enough).
 */
export async function scanTestHelperProcesses(opts: {
  uid: number;
  now?: number;
  worktreesRoot?: string | null;
}): Promise<TestHelperScan | null> {
  const output = await safeExecFile("ps", ["ax", "-o", "pid=,ppid=,pgid=,uid=,etime=,command="]);
  if (output === null) return null;
  const now = opts.now ?? Date.now();
  const rows = parseTestHelperRows(output);
  const isLiveTempRoot = liveRootChecker(rows, now);
  const processes: TestHelperProcessInfo[] = [];
  for (const row of rows) {
    if (row.uid !== opts.uid || row.ppid !== 1 || row.ageMs < TEST_HELPER_STALE_MS) continue;
    const cwd = await readProcessCwd(row.pid);
    const commandRoot = parseTestHelperRoot(row.command);
    const helperTag = commandRoot ? null : readTestHelperTag(row.pid);
    processes.push(
      classifyTestHelperProcess(
        { ...row, cwd, helperTag },
        { uid: opts.uid, now, isLiveTempRoot, worktreesRoot: opts.worktreesRoot },
      ),
    );
  }
  return {
    candidates: processes.length,
    leaked: processes.filter((process) => process.kind === "leaked").length,
    processes,
  };
}

export interface ReapedTestHelper {
  pid: number;
  pgid: number;
  tempRoot: string | null;
  reason: string;
  /** True when the pid was still alive after SIGKILL (should be rare). */
  survived: boolean;
}

/**
 * Reap leaked test helpers: SIGTERM the process group, wait a grace period,
 * then SIGKILL any survivor. Every guard lives in the classifier; this function
 * only signals pids the scan already proved are unattended RepoOS fixtures.
 */
export async function reapLeakedTestHelpers(opts: {
  uid: number;
  now?: number;
  worktreesRoot?: string | null;
  scan?: () => TestHelperScan | null | Promise<TestHelperScan | null>;
  signal?: (pid: number, signal: NodeJS.Signals, group: boolean) => void;
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReapedTestHelper[]> {
  const scan =
    opts.scan ??
    (() =>
      scanTestHelperProcesses({
        uid: opts.uid,
        now: opts.now,
        worktreesRoot: opts.worktreesRoot,
      }));
  const result = await scan();
  if (!result) return [];
  const leaked = result.processes.filter((process) => process.kind === "leaked");
  if (leaked.length === 0) return [];

  const signal =
    opts.signal ??
    ((pid: number, sig: NodeJS.Signals, group: boolean) => {
      try {
        if (group) process.kill(-pid, sig);
        else process.kill(pid, sig);
      } catch {
        // Group gone; still try the leader directly.
        try {
          process.kill(pid, sig);
        } catch {
          /* already gone */
        }
      }
    });
  const isAlive =
    opts.isAlive ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const send = (process: TestHelperProcessInfo, sig: NodeJS.Signals): void => {
    try {
      signal(process.pid, sig, process.pgid === process.pid);
    } catch {
      /* already gone */
    }
  };
  for (const process of leaked) send(process, "SIGTERM");
  await sleep(1_500);
  for (const process of leaked) {
    if (isAlive(process.pid)) send(process, "SIGKILL");
  }
  // Give SIGKILL time to take effect before reporting a survivor.
  await sleep(100);
  return leaked.map((process) => ({
    pid: process.pid,
    pgid: process.pgid,
    tempRoot: process.tempRoot,
    reason: process.reason,
    survived: isAlive(process.pid),
  }));
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
  /** Repo root — enables the git-derived `repo` codebase-size stats. */
  root?: string;
  /** Advisory worktree ceiling surfaced in `repo.worktreeWarnThreshold`. */
  worktreeWarnThreshold?: number;
  /** Config thresholds for the pressure verdict (#0871). */
  config?: RepoOSConfig;
  /** How many entries the top CPU / top memory lists carry. Default 10. */
  topLimit?: number;
}

/**
 * Sample the system: machine facts, RepoOS process totals, and a per-process
 * breakdown with orphan detection. One `ps` call covers all tracked + agent PIDs.
 */
export async function sampleSystem(opts: SampleSystemOptions): Promise<SystemStats> {
  const serverPid = opts.serverPid;
  const workerRoot = opts.root ?? opts.config?.root ?? process.cwd();

  const agentPids = new Set(opts.runningAgents.map((a) => a.pid).filter((p) => p > 0));
  const idByPid = new Map<number, string>();
  for (const a of opts.runningAgents) {
    if (a.pid > 0) idByPid.set(a.pid, a.id);
  }

  const allPids = [serverPid, ...agentPids];
  const ownership = syncOwnership(opts.cacheDir, opts.runningAgents, new Set(allPids));
  const ownershipByPid = new Map<number, OwnershipRecord>();
  for (const o of ownership) ownershipByPid.set(o.pid, o);

  const knownPids = new Set(allPids);
  const orphanPids = [...ownershipByPid.keys()].filter((pid) => !knownPids.has(pid));
  const [records, listing, serve, repo, resources] = await Promise.all([
    sampleProcesses([...allPids, ...orphanPids]),
    sampleProcessListing(),
    scanServeProcesses(serverPid, new Set(opts.knownServePids ?? []), opts.root),
    opts.root ? sampleRepoStats(opts.root, opts.worktreeWarnThreshold) : Promise.resolve(null),
    getGitWorker(workerRoot).resourceSnapshot(
      opts.config,
      localCheckLockRoot(workerRoot, opts.config?.cacheDir ?? ".repoos"),
    ),
  ]);
  const machine = machineInfo(resources.availableMemBytes);
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
  for (const pid of orphanPids) {
    const ps = psByPid.get(pid);
    const owned = ownershipByPid.get(pid);
    if (!ps || !owned) continue;
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

  const processOwners = new Set<number>([serverPid, ...agentPids]);
  for (const pid of ownershipByPid.keys()) processOwners.add(pid);
  for (const p of serve?.processes ?? []) processOwners.add(p.pid);
  const topProcesses = classifyTopProcesses(
    listing,
    processOwners,
    Math.max(1, Math.min(50, opts.topLimit ?? 10)),
  );

  return {
    machine,
    totals: {
      cpuPercent: Math.round(totalCpu * 10) / 10,
      memBytes: totalMem,
      memPercent: Math.round(totalMemPercent * 10) / 10,
    },
    processes,
    serve,
    repo,
    pressure: resources.pressure,
    heavyJobs: resources.heavyJobs,
    gitJobs: gitWorkerInFlight(workerRoot),
    topProcesses,
    globalEngineers: opts.root ? registeredEngineerCount(opts.root) : null,
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

/**
 * True when the current platform can run the `ps` command with the expected
 * flags (pid=,ppid=,%cpu=,%mem=,rss=,etime=). Windows `ps` (PowerShell alias)
 * does not support these flags, so per-process stats are unavailable there.
 */
export async function psAvailable(): Promise<boolean> {
  if (platform() === "win32") return false;
  return (await safeExecFile("ps", ["-o", "pid=", "-p", String(process.pid)])) !== null;
}
