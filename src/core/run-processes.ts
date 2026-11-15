/**
 * Run-process teardown and orphan sweeping (#1134).
 *
 * An agent turn runs in its own POSIX process group, but an agent CLI's shell
 * tool (or a test runner) can start a grandchild in a new session
 * (`setsid`/`detached`) or new process group. That child leaves the turn's
 * group and can even be reparented to PID 1 when its parent exits, so a group
 * kill alone cannot reach it.
 *
 * This module tracks run processes without ever matching a process name:
 *
 * - the PID tree below a turn's group leader (including children that changed
 *   process group but kept a parent link),
 * - the process cwd (inside the turn's worktree), and
 * - a per-run marker in the child environment (`REPOOS_TURN_MARKER`), which is
 *   readable from `/proc` on Linux and inherited by everything the run spawns.
 *
 * Kills always signal exact PIDs: TERM first, then KILL after a short grace.
 * `pkill`/`killall` and pattern kills are never used.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readlinkSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { signalProcessGroup } from "./process-group.js";

/** Environment variable carrying a turn's run marker into every descendant. */
export const TURN_MARKER_ENV = "REPOOS_TURN_MARKER";
const TURN_MARKER_PREFIX = "repoos-turn";

/** One process row from `ps`, with the facts a reaper needs. */
export interface ProcessRow {
  pid: number;
  ppid: number;
  pgid: number;
  uid: number;
  ageMs: number;
  /** Cumulative CPU time, ms. */
  cpuTimeMs: number;
  cpuPercent: number;
  command: string;
}

/** A process a turn (or a finished run) still owns. */
export interface RunProcess extends ProcessRow {
  cwd: string | null;
  marker: string | null;
  taskId: string | null;
  /** Worktree directory the process was matched to, when known. */
  workdir: string | null;
  matchedBy: "turn-tree" | "worktree-cwd" | "run-marker";
}

/** A turn that is still live and whose processes must never be reaped. */
export interface LiveTurnScope {
  taskId?: string | null;
  workdir?: string | null;
  /** Process-group leader for this turn. */
  leaderPid?: number | null;
  /** `REPOOS_TURN_MARKER` value inherited by this turn's descendants. */
  marker?: string | null;
}

/** A short marker that identifies a run (repo-scoped, task-scoped, run-scoped). */
export function turnMarker(repoRoot: string, taskId: string, runId: string): string {
  return `${TURN_MARKER_PREFIX}:${repoHash(repoRoot)}:${taskId}:${runId}`;
}

/** The repo hash embedded in a marker (the segment after `repoos-turn:`). */
export function markerRepoTag(marker: string): string | null {
  const match = marker.match(/^repoos-turn:([a-f0-9]{12}):/);
  return match ? match[1] : null;
}

/** True when `marker` was minted by `repoRoot` (never another checkout's run). */
export function markerBelongsToRepo(marker: string, repoRoot: string): boolean {
  return markerRepoTag(marker) === repoHash(repoRoot);
}

/** Task id embedded in a run marker, or null. */
export function markerTaskId(marker: string): string | null {
  const match = marker.match(/^repoos-turn:[a-f0-9]{12}:([^:]+):/);
  return match ? match[1] : null;
}

/** Run id embedded in a run marker, or null. */
export function markerRunId(marker: string): string | null {
  const match = marker.match(/^repoos-turn:[a-f0-9]{12}:[^:]+:(.+)$/);
  return match ? match[1] : null;
}

function repoHash(repoRoot: string): string {
  return createHash("sha1").update(resolve(repoRoot)).digest("hex").slice(0, 12);
}

/** Parse `ps` `etime` (`[[dd-]hh:]mm:ss`) into milliseconds; 0 when unknown. */
export function parseElapsedMs(value: string): number {
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

/**
 * Parse `ps` `time` (cumulative CPU, `[[dd-]hh:]mm:ss[.cc]`) into milliseconds.
 * macOS prints a fractional second (`243:06.08`); Linux prints whole seconds.
 */
export function parseCpuTimeMs(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const [dayPart, rest] = trimmed.includes("-") ? trimmed.split("-", 2) : ["0", trimmed];
  const parts = rest.replace(",", ".").split(":");
  const seconds = Number(parts.pop() ?? 0);
  let minutes = 0;
  let hours = 0;
  if (parts.length > 0) minutes = Number(parts.pop());
  if (parts.length > 0) hours = Number(parts.pop());
  if (![seconds, minutes, hours].every((n) => Number.isFinite(n))) return 0;
  return Math.max(
    0,
    ((Number(dayPart) * 86_400 + hours * 3_600 + minutes * 60 + seconds) * 1000) | 0,
  );
}

/** Parse `ps ax -o pid=,ppid=,pgid=,uid=,etime=,time=,%cpu=,command=` rows. */
export function parseProcessRows(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split("\n")) {
    const match = line
      .trimStart()
      .match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+(.*)$/);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      uid: Number(match[4]),
      ageMs: parseElapsedMs(match[5]),
      cpuTimeMs: parseCpuTimeMs(match[6]),
      cpuPercent: Number(match[7]) || 0,
      command: match[8],
    });
  }
  return rows;
}

/** One `ps` sweep. Bounded so a huge machine can never wedge a turn teardown. */
export function listProcessRows(psOutput?: string): ProcessRow[] {
  if (process.platform === "win32") return [];
  if (psOutput !== undefined) return parseProcessRows(psOutput);
  const res = spawnSync("ps", ["ax", "-o", "pid=,ppid=,pgid=,uid=,etime=,time=,%cpu=,command="], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error || res.status !== 0 || !res.stdout) return [];
  return parseProcessRows(res.stdout);
}

/** Resolve symlinks best-effort, so `/tmp` and macOS `/private/tmp` compare equal. */
function normalizePath(path: string): string {
  const absolute = resolve(path).replace(/\/+$/, "");
  try {
    return realpathSync(absolute).replace(/\/+$/, "");
  } catch {
    return absolute;
  }
}

/** True when `child` is `parent` itself or under it (path-boundary safe). */
export function pathInside(parent: string, child: string): boolean {
  const p = normalizePath(parent);
  const c = normalizePath(child);
  return c === p || c.startsWith(`${p}${sep}`);
}

/**
 * Cwds for `pids`, one batched probe: `/proc/<pid>/cwd` on Linux, one `lsof`
 * call on macOS. Missing entries mean the probe was denied or the pid exited.
 */
export function readProcessCwds(
  pids: readonly number[],
  platform: NodeJS.Platform = process.platform,
): Map<number, string> {
  const wanted = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  const out = new Map<number, string>();
  if (wanted.length === 0) return out;
  if (platform === "linux") {
    for (const pid of wanted) {
      try {
        const cwd = readlinkSync(`/proc/${pid}/cwd`).replace(/ \(deleted\)$/, "");
        if (cwd) out.set(pid, cwd);
      } catch {
        /* exited or not permitted */
      }
    }
    return out;
  }
  if (platform === "darwin") {
    // One lsof for all candidates; its exit status is non-zero when any proxied
    // pid vanished, so parse stdout regardless.
    const res = spawnSync("lsof", ["-a", "-p", wanted.join(","), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!res.stdout) return out;
    let current: number | null = null;
    for (const line of res.stdout.split("\n")) {
      if (line.startsWith("p")) {
        current = Number(line.slice(1));
      } else if (line.startsWith("n") && current && Number.isFinite(current)) {
        out.set(current, line.slice(1));
      }
    }
  }
  return out;
}

/** `REPOOS_TURN_MARKER` for a pid, where the OS exposes another process's env. */
export function readProcessMarker(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== "linux") return null; // macOS SIP hides other processes' env
  try {
    const entries = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    const match = entries.find((entry) => entry.startsWith(`${TURN_MARKER_ENV}=`));
    return match ? match.slice(TURN_MARKER_ENV.length + 1) : null;
  } catch {
    return null;
  }
}

/** Every pid in the tree rooted at `roots` (parent links, not process groups). */
export function processTreePids(
  rows: readonly ProcessRow[],
  roots: readonly number[],
): Set<number> {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    const list = children.get(row.ppid);
    if (list) list.push(row.pid);
    else children.set(row.ppid, [row.pid]);
  }
  const seen = new Set<number>();
  const queue = [...roots].filter((pid) => pid > 0);
  while (queue.length > 0) {
    const pid = queue.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    for (const child of children.get(pid) ?? []) {
      if (!seen.has(child)) queue.push(child);
    }
  }
  return seen;
}

/** Pids that must never be signalled: this process and its ancestors. */
function protectedPids(rows: readonly ProcessRow[], selfPid: number): Set<number> {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const out = new Set<number>([1, selfPid]);
  let current = byPid.get(selfPid);
  for (let depth = 0; current && depth < 64; depth++) {
    out.add(current.ppid);
    current = byPid.get(current.ppid);
  }
  return out;
}

export interface OrphanRunScanOptions {
  uid: number;
  repoRoot: string;
  /** Sibling directory holding task worktrees (`worktreesDir(root)`). */
  worktreesRoot: string;
  liveTurns?: readonly LiveTurnScope[];
  /** Reparented processes younger than this are left alone. */
  minAgeMs?: number;
  /** Inject for tests. */
  cwdByPid?: ReadonlyMap<number, string>;
  markerByPid?: ReadonlyMap<number, string>;
  taskIdForWorkdir?: (workdir: string) => string | null;
  selfPid?: number;
}

/**
 * Processes reparented to PID 1 that belong to a RepoOS run but no live turn:
 * cwd is inside this repo's managed worktrees, or the environment carries a
 * `REPOOS_TURN_MARKER` minted by this repo. Never matches by process name.
 */
export function findOrphanedRunProcesses(
  rows: readonly ProcessRow[],
  opts: OrphanRunScanOptions,
): RunProcess[] {
  const minAgeMs = opts.minAgeMs ?? 5_000;
  const liveTurns = opts.liveTurns ?? [];
  const selfPid = opts.selfPid ?? process.pid;
  const protectedSet = protectedPids(rows, selfPid);
  const liveTree = processTreePids(
    rows,
    liveTurns.map((turn) => turn.leaderPid ?? 0).filter((pid) => pid > 0),
  );
  const liveMarkers = new Set(
    liveTurns.map((turn) => turn.marker).filter((marker): marker is string => !!marker),
  );
  const liveWorkdirs = liveTurns
    .map((turn) => turn.workdir)
    .filter((workdir): workdir is string => !!workdir);

  const candidates = rows.filter(
    (row) =>
      row.ppid === 1 &&
      row.uid === opts.uid &&
      row.ageMs >= minAgeMs &&
      !protectedSet.has(row.pid) &&
      !liveTree.has(row.pid),
  );
  if (candidates.length === 0) return [];

  const markerByPid =
    opts.markerByPid ??
    new Map(
      candidates
        .map((row) => [row.pid, readProcessMarker(row.pid)] as const)
        .filter((entry): entry is readonly [number, string] => !!entry[1]),
    );
  const cwdByPid =
    opts.cwdByPid ??
    readProcessCwds(candidates.filter((row) => !markerByPid.has(row.pid)).map((row) => row.pid));

  const found: RunProcess[] = [];
  for (const row of candidates) {
    const marker = markerByPid.get(row.pid) ?? null;
    const cwd = cwdByPid.get(row.pid) ?? null;
    const markerMatch = !!marker && markerBelongsToRepo(marker, opts.repoRoot);
    const cwdMatch = !!cwd && pathInside(opts.worktreesRoot, cwd);
    if (!markerMatch && !cwdMatch) continue;
    if (marker && liveMarkers.has(marker)) continue;
    if (cwd && liveWorkdirs.some((workdir) => pathInside(workdir, cwd))) continue;
    const workdir = cwd && cwdMatch ? cwd : null;
    found.push({
      ...row,
      cwd,
      marker,
      taskId:
        (marker ? markerTaskId(marker) : null) ??
        (workdir ? (opts.taskIdForWorkdir?.(workdir) ?? null) : null),
      workdir,
      matchedBy: cwdMatch ? "worktree-cwd" : "run-marker",
    });
  }
  return found;
}

export interface EscapedTurnScanOptions {
  repoRoot: string;
  /** Group leader of the turn that just ended. */
  leaderPid?: number | null;
  /** The turn's worktree — anything still running there belongs to it. */
  workdir?: string | null;
  /** This turn's exact `REPOOS_TURN_MARKER` value. */
  marker?: string | null;
  taskId?: string | null;
  excludePids?: readonly number[];
  /**
   * Only cwd-matched processes no older than this were started during the
   * turn, so a long-lived human dev server in the worktree is spared.
   */
  maxCwdAgeMs?: number;
  cwdByPid?: ReadonlyMap<number, string>;
  markerByPid?: ReadonlyMap<number, string>;
  selfPid?: number;
}

/**
 * Processes a just-ended turn still owns: descendants by PID tree, anything
 * whose cwd is inside the turn's worktree, and anything carrying this exact
 * run marker. This is deliberately wider than the group kill, because
 * `setsid`/`setpgid`/double-fork children are no longer in the group.
 */
export function findEscapedTurnProcesses(
  rows: readonly ProcessRow[],
  opts: EscapedTurnScanOptions,
): RunProcess[] {
  const selfPid = opts.selfPid ?? process.pid;
  const protectedSet = protectedPids(rows, selfPid);
  const excluded = new Set<number>(opts.excludePids ?? []);
  const tree = processTreePids(rows, opts.leaderPid && opts.leaderPid > 0 ? [opts.leaderPid] : []);
  const markerByPid =
    opts.markerByPid ??
    (opts.marker
      ? new Map(
          rows
            .filter((row) => row.ppid === 1 && !protectedSet.has(row.pid) && !excluded.has(row.pid))
            .map((row) => [row.pid, readProcessMarker(row.pid)] as const)
            .filter((entry): entry is readonly [number, string] => !!entry[1]),
        )
      : new Map<number, string>());
  const needsCwd = !!opts.workdir;
  // Only reparented processes need the cwd probe: every process still under a
  // parent in the turn's tree is already in `tree`, and an unrelated live
  // parent is not the turn's child. This keeps the probe to the small set that
  // can actually have escaped, instead of every process on the machine.
  const cwdPids = needsCwd
    ? rows
        .filter(
          (row) =>
            row.ppid === 1 &&
            !protectedSet.has(row.pid) &&
            !excluded.has(row.pid) &&
            !tree.has(row.pid) &&
            (opts.maxCwdAgeMs === undefined || row.ageMs <= opts.maxCwdAgeMs) &&
            !(opts.marker && markerByPid.get(row.pid) === opts.marker),
        )
        .map((row) => row.pid)
    : [];
  const cwdByPid =
    opts.cwdByPid ?? (needsCwd ? readProcessCwds(cwdPids) : new Map<number, string>());

  const found: RunProcess[] = [];
  for (const row of rows) {
    if (protectedSet.has(row.pid) || excluded.has(row.pid)) continue;
    const cwd = cwdByPid.get(row.pid) ?? null;
    const marker = markerByPid.get(row.pid) ?? null;
    const inTree = tree.has(row.pid);
    const inWorkdir = !!cwd && !!opts.workdir && pathInside(opts.workdir, cwd);
    const markerMatch = !!marker && !!opts.marker && marker === opts.marker;
    if (!inTree && !inWorkdir && !markerMatch) continue;
    // Membership in the PID tree or an exact run marker proves ownership. A
    // cwd match alone must also have started during this turn, or an older
    // human-run server in the same worktree would be collateral damage.
    if (!inTree && !markerMatch && opts.maxCwdAgeMs !== undefined && row.ageMs > opts.maxCwdAgeMs) {
      continue;
    }
    found.push({
      ...row,
      cwd,
      marker,
      taskId: opts.taskId ?? null,
      workdir: inWorkdir ? (opts.workdir ?? null) : null,
      matchedBy: inTree ? "turn-tree" : inWorkdir ? "worktree-cwd" : "run-marker",
    });
  }
  return found;
}

export interface ReapRunProcessesOptions {
  graceMs?: number;
  /** Inject for tests. */
  signal?: (pid: number, signal: NodeJS.Signals) => void;
  rows?: () => ProcessRow[];
  sleep?: (ms: number) => Promise<void>;
}

export interface ReapRunProcessesResult {
  /** Pids that were signalled with TERM. */
  found: number[];
  /** Pids that were still alive after TERM (and so got KILL). */
  killed: number[];
  /** Pids still present after KILL (should be rare, e.g. uninterruptible sleep). */
  survivors: number[];
}

function livePids(rows: readonly ProcessRow[]): Set<number> {
  return new Set(rows.filter((row) => !row.command.includes("<defunct>")).map((row) => row.pid));
}

/**
 * Stop exact PIDs: TERM, wait `graceMs`, then KILL anything still there.
 * Never signals a process group and never matches by name.
 */
export async function reapRunProcesses(
  pids: readonly number[],
  opts: ReapRunProcessesOptions = {},
): Promise<ReapRunProcessesResult> {
  const targets = [...new Set(pids)].filter(
    (pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid,
  );
  if (targets.length === 0) return { found: [], killed: [], survivors: [] };
  const signal = opts.signal ?? ((pid: number, sig: NodeJS.Signals) => process.kill(pid, sig));
  const rows = opts.rows ?? (() => listProcessRows());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const send = (pid: number, sig: NodeJS.Signals): void => {
    try {
      signal(pid, sig);
    } catch {
      /* already gone */
    }
  };
  for (const pid of targets) send(pid, "SIGTERM");
  await sleep(opts.graceMs ?? 750);
  const afterTerm = livePids(rows());
  const killed = targets.filter((pid) => afterTerm.has(pid));
  for (const pid of killed) send(pid, "SIGKILL");
  if (killed.length > 0) await sleep(100);
  const afterKill = livePids(rows());
  return {
    found: targets,
    killed,
    survivors: targets.filter((pid) => afterKill.has(pid)),
  };
}

export interface ReapTurnProcessTreeOptions
  extends EscapedTurnScanOptions, ReapRunProcessesOptions {
  /** Also TERM the turn's original process group (ESC-able children left it). */
  signalGroup?: boolean;
}

export interface ReapTurnProcessTreeResult extends ReapRunProcessesResult {
  /** Every process the turn still owned when teardown began. */
  processes: RunProcess[];
}

/**
 * Tear down everything a turn spawned: its original process group plus every
 * descendant the group lost to `setsid`/`setpgid`/reparenting. TERM first, then
 * KILL after the grace period. Returns what was found and what survived.
 */
export async function reapAgentTurnProcessTree(
  opts: ReapTurnProcessTreeOptions,
): Promise<ReapTurnProcessTreeResult> {
  const rows = opts.rows ?? (() => listProcessRows());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const first = rows();
  const processes = findEscapedTurnProcesses(first, opts);
  const leader = opts.leaderPid ?? 0;
  if (leader > 0 && (opts.signalGroup ?? true)) signalProcessGroup(leader, "SIGTERM");
  const exact = await reapRunProcesses(
    processes.map((process) => process.pid),
    { ...opts, rows },
  );

  // Re-scan after TERM: a child may have daemonized into a new session while
  // the grace period ran. Anything still matching this turn is killed too.
  const secondRows = rows();
  const remaining = findEscapedTurnProcesses(secondRows, opts);
  const already = new Set(exact.found);
  const extra = remaining.filter((process) => !already.has(process.pid));
  const extraResult = await reapRunProcesses(
    extra.map((process) => process.pid),
    { ...opts, rows },
  );
  if (leader > 0 && (opts.signalGroup ?? true)) signalProcessGroup(leader, "SIGKILL");
  const finalRows = rows();
  const finalLive = livePids(finalRows);
  const survivors = [...exact.survivors, ...extraResult.survivors].filter((pid) =>
    finalLive.has(pid),
  );
  return {
    found: [...exact.found, ...extraResult.found],
    killed: [...exact.killed, ...extraResult.killed],
    survivors,
    processes: [...processes, ...extra],
  };
}
