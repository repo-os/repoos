/**
 * Orphaned run-process reaper (#1134).
 *
 * A managed agent turn's process group covers helpers the agent starts, but an
 * agent CLI's own shell tool can launch a test runner in a new session, and a
 * double-forked child reparents to PID 1. Those escape both the group tear-down
 * and `sweepOrphanedRunRootProcesses` (which only knows test temp roots).
 *
 * On the server tick this reaper looks for reparented processes whose cwd is
 * inside this repo's managed worktrees or whose environment carries a run
 * marker minted by this repo, and that no live turn owns. It stops them by exact
 * PID (TERM, grace, KILL) and records each kill with task id, command, CPU time
 * and age for the dashboard/activity log. Matching is never by process name.
 */
import { worktreesDir } from "../core/config.js";
import {
  findOrphanedRunProcesses,
  listProcessRows,
  reapRunProcesses,
  type LiveTurnScope,
  type ProcessRow,
  type RunProcess,
} from "../core/run-processes.js";
import type { OrphanedRunPressureInfo } from "../core/pressure-guard.js";
import type { RepoOSConfig } from "../core/types.js";
import type { RunningAgentInfo } from "./agents.js";

/** One kill (or failed kill) the reaper recorded. */
export interface ReapedRunProcess {
  pid: number;
  taskId: string | null;
  command: string;
  /** Cumulative CPU time the process had burned when it was found, ms. */
  cpuTimeMs: number;
  cpuPercent: number;
  /** How long the process had been running, ms. */
  ageMs: number;
  matchedBy: RunProcess["matchedBy"];
  /** True when the process survived SIGKILL (should be rare). */
  survived: boolean;
  at: string;
}

export interface RunProcessReaperLogger {
  system: (
    level: "info" | "warn" | "error",
    message: string,
    meta?: Record<string, unknown>,
  ) => void;
}

export interface RunProcessReaperOptions {
  config: RepoOSConfig;
  /** Live turns from the AgentRunner registry. */
  runningAgents: () => readonly RunningAgentInfo[];
  /** Map a worktree path back to its task id, when the branch layout allows it. */
  taskIdForWorkdir?: (workdir: string) => string | null;
  logger?: RunProcessReaperLogger;
  uid?: number;
  /** Reparented processes younger than this are left alone. */
  minAgeMs?: number;
  /** Inject for tests. */
  listRows?: () => ProcessRow[];
  clock?: () => number;
  /** Called once per stopped orphan, so the task activity log can record it. */
  onReaped?: (item: ReapedRunProcess) => void;
}

/** Format a duration compactly for a log line. */
export function describeRunDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 6) / 10}h`;
}

export class RunProcessReaper {
  private readonly config: RepoOSConfig;
  private readonly opts: RunProcessReaperOptions;
  private readonly minAgeMs: number;
  private lastResults: ReapedRunProcess[] = [];
  private lastSweepAt: string | null = null;
  private inFlight = false;

  constructor(opts: RunProcessReaperOptions) {
    this.opts = opts;
    this.config = opts.config;
    this.minAgeMs = opts.minAgeMs ?? 5_000;
  }

  /** Live turns, mapped to the scopes the classifier must never touch. */
  private liveTurns(): LiveTurnScope[] {
    return this.opts.runningAgents().map((agent) => ({
      taskId: agent.id,
      workdir: agent.workdir,
      leaderPid: agent.pid > 0 ? agent.pid : null,
      marker: agent.turnMarker ?? null,
    }));
  }

  /**
   * Scan and reap once. Safe to call concurrently: a second call while one is
   * running returns the previous result rather than stacking `ps` sweeps.
   */
  async sweep(): Promise<ReapedRunProcess[]> {
    if (this.inFlight) return this.lastResults;
    this.inFlight = true;
    try {
      const rows = (this.opts.listRows ?? listProcessRows)();
      const orphans = findOrphanedRunProcesses(rows, {
        uid: this.opts.uid ?? process.getuid?.() ?? -1,
        repoRoot: this.config.root,
        worktreesRoot: worktreesDir(this.config.root),
        liveTurns: this.liveTurns(),
        minAgeMs: this.minAgeMs,
        taskIdForWorkdir: this.opts.taskIdForWorkdir,
      });
      if (orphans.length === 0) {
        this.lastResults = [];
        this.lastSweepAt = new Date().toISOString();
        return [];
      }
      const result = await reapRunProcesses(
        orphans.map((process) => process.pid),
        { graceMs: 750 },
      );
      const survivors = new Set(result.survivors);
      const at = new Date().toISOString();
      this.lastResults = orphans.map((process) => ({
        pid: process.pid,
        taskId: process.taskId,
        command: process.command,
        cpuTimeMs: process.cpuTimeMs,
        cpuPercent: process.cpuPercent,
        ageMs: process.ageMs,
        matchedBy: process.matchedBy,
        survived: survivors.has(process.pid),
        at,
      }));
      this.lastSweepAt = at;
      for (const item of this.lastResults) {
        this.opts.logger?.system(
          item.survived ? "warn" : "info",
          `run-process-reaper: ${item.survived ? "failed to stop" : "stopped"} pid ${item.pid}` +
            `${item.taskId ? ` (task #${item.taskId})` : ""} ` +
            `${item.command.slice(0, 160)} — cpu ${describeRunDuration(item.cpuTimeMs)}, ` +
            `age ${describeRunDuration(item.ageMs)}`,
          {
            pid: item.pid,
            taskId: item.taskId,
            command: item.command,
            cpuTimeMs: item.cpuTimeMs,
            cpuPercent: item.cpuPercent,
            ageMs: item.ageMs,
            matchedBy: item.matchedBy,
            survived: item.survived,
          },
        );
        try {
          this.opts.onReaped?.(item);
        } catch {
          /* activity logging is best-effort */
        }
      }
      return this.lastResults;
    } finally {
      this.inFlight = false;
    }
  }

  /** Most recent sweep's findings, for the dashboard and CTO digest. */
  recent(): ReapedRunProcess[] {
    return this.lastResults;
  }

  lastSweepAtIso(): string | null {
    return this.lastSweepAt;
  }

  /** Pressure-guard view: only processes that are still alive are critical. */
  pressureInfo(): OrphanedRunPressureInfo[] {
    return this.lastResults.map((item) => ({
      pid: item.pid,
      taskId: item.taskId,
      command: item.command,
      cpuPercent: item.cpuPercent,
      cpuTimeMs: item.cpuTimeMs,
      ageMs: item.ageMs,
      state: item.survived ? "running" : "reaped",
    }));
  }
}
