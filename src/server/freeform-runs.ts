/**
 * Durable freeform-PM runs (#0403).
 *
 * The "New task" panel's freeform flow kicks off the PM agent before any task
 * is fully fleshed out. Historically that ran through a fire-and-forget
 * `runPrompt` closure inside the request handler: in-memory output buffers,
 * pipes owned by the serving process, and no durable record. A server reload
 * mid-flight destroyed the await chain, so the run (and any error explaining
 * what happened) was silently lost — the user just got the raw-prompt draft.
 *
 * This module gives the freeform PM call the same durability regular task-turn
 * agents already have:
 *
 * - stdout/stderr are written to durable per-run log files
 *   (`.repoos/agent-logs/freeform-<runId>.{out,err}.log`), so the run is
 *   inspectable after the fact regardless of which server process started it.
 * - a durable registry (`.repoos/freeform-runs.json`) records the run's
 *   `{ runId, taskId, pid, cwd, explanation, agent, startedAt }`.
 * - the child is spawned detached (own process group), so it survives the
 *   parent's reload the same way `reload.ts`'s replacement and `AgentRunner`'s
 *   turn children do.
 * - on boot, `adopt()` scans the registry: a still-live child is re-attached
 *   (its log tailed and streamed to any client still watching that runId), and
 *   a child that finished while no server was up is finalized from its durable
 *   log — parsing the PM output and promoting the draft exactly as the live
 *   path would have.
 *
 * The live "is the PM working right now" flag stays in-memory (`pm-runs.ts`):
 * that state legitimately dies with the process. What survives is the run and
 * its result, which is what this module owns.
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Agent, RepoOSConfig } from "../core/types.js";
import type { RepoEvent } from "./live-index.js";
import {
  oneShotResultFromLog,
  parseOneShotLine,
  PROMPT_TIMEOUT_MS,
  type PromptResult,
} from "./agents.js";
import { markPmWorking } from "./pm-runs.js";
import { deleteBranch, removeWorktree } from "../core/git.js";

/** A freeform run in flight, durable across a server reload. */
export interface FreeformRunRecord {
  /** Client-generated run UUID (the natural key before a task id exists). */
  runId: string;
  /** The draft task this run is fleshing out. */
  taskId: string;
  /** PID of the detached PM CLI process. */
  pid: number;
  cwd: string;
  /** Temporary RepoOS worktree used by a worktree-bound PM driver. */
  pmWorktreeBranch?: string;
  /** Exit status captured before finalization; absent on old adopted records. */
  exitCode?: number | null;
  /** The raw user explanation, needed to preserve `## Original prompt`. */
  explanation: string;
  /** The resolved PM agent (with any per-run override already applied). */
  agent: Agent;
  startedAt: string;
}

/** A persisted failure outcome, kept after the run record itself is removed. */
export interface FreeformRunFailure {
  runId: string;
  taskId: string;
  reason: string;
  failedAt: string;
}

interface FreeformRunStore {
  runs: FreeformRunRecord[];
  failures: FreeformRunFailure[];
}

/** Called once when a run finishes (live or adopted), for post-processing. */
export type FreeformFinalizer = (run: FreeformRunRecord, result: PromptResult) => void;

/** How long a freeform PM run may stay alive before it is killed and failed. */
const FREEFORM_TIMEOUT_MS = PROMPT_TIMEOUT_MS;
/** How often an adopted run's PID is checked for liveness. */
const LIVENESS_POLL_MS = 2000;
/** How often the durable log is polled for new output. */
const LOG_POLL_MS = 200;

/** Path of the durable freeform-run registry. */
function storePath(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir, "freeform-runs.json");
}

/** Durable stdout/stderr log paths for one run. */
export function freeformLogPaths(
  config: RepoOSConfig,
  runId: string,
): { out: string; err: string } {
  const dir = join(config.root, config.cacheDir, "agent-logs");
  return {
    out: join(dir, `freeform-${runId}.out.log`),
    err: join(dir, `freeform-${runId}.err.log`),
  };
}

/** Remove the temporary worktree reserved for a worktree-bound PM run. */
export function cleanupFreeformWorktree(config: RepoOSConfig, branch: string | undefined): void {
  if (!branch) return;
  if (removeWorktree(config.root, branch)) {
    deleteBranch(config.root, branch, { force: true });
  }
}

/** Read the durable freeform-run store; empty (never throws) when missing/corrupt. */
export function readFreeformStore(config: RepoOSConfig): FreeformRunStore {
  try {
    const parsed = JSON.parse(readFileSync(storePath(config), "utf8")) as Partial<FreeformRunStore>;
    const runs = Array.isArray(parsed.runs)
      ? parsed.runs.filter(
          (r): r is FreeformRunRecord =>
            typeof r?.runId === "string" &&
            typeof r?.taskId === "string" &&
            typeof r?.pid === "number" &&
            typeof r?.explanation === "string" &&
            typeof r?.agent?.cli === "string",
        )
      : [];
    const failures = Array.isArray(parsed.failures)
      ? parsed.failures.filter(
          (f): f is FreeformRunFailure =>
            typeof f?.runId === "string" && typeof f?.reason === "string",
        )
      : [];
    return { runs, failures };
  } catch {
    return { runs: [], failures: [] };
  }
}

/** Persist the store atomically (best-effort, like the durable agent registry). */
function writeFreeformStore(config: RepoOSConfig, store: FreeformRunStore): void {
  const dir = join(config.root, config.cacheDir);
  try {
    mkdirSync(dir, { recursive: true });
    const file = storePath(config);
    const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");
      renameSync(temp, file);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  } catch {
    /* best-effort */
  }
}

/** In-flight freeform runs from the durable registry. */
export function readFreeformRuns(config: RepoOSConfig): FreeformRunRecord[] {
  return readFreeformStore(config).runs;
}

/** The recorded failure for a run id, if any. */
export function freeformFailureForRun(
  config: RepoOSConfig,
  runId: string,
): FreeformRunFailure | null {
  return readFreeformStore(config).failures.find((f) => f.runId === runId) ?? null;
}

/** True while the OS reports the given PID as alive. */
function pidAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Env for a spawned PM child: scrub control-plane lifecycle markers. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.REPOOS_RELOAD;
  delete env.REPOOS_RELOAD_SECRET;
  delete env.REPOOS_PREVIEW_CHILD;
  return env;
}

/**
 * Kill a detached run by PID, preferring its process group on Unix so any
 * workers the PM CLI spawned are reaped too (mirrors `reload.ts`'s tree
 * cleanup). Works for an adopted run with no local `ChildProcess` handle;
 * falls back to a direct signal when the group is already gone.
 */
function killPid(pid: number): void {
  if (!pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      /* group already gone — signal the process directly */
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

interface ActiveRun {
  record: FreeformRunRecord;
  /** Set once the run has been finalized, so trailing events are no-ops. */
  finalized: boolean;
  /** Set by the timeout handler so the finish path surfaces a timeout error. */
  timedOut: boolean;
  timers: ReturnType<typeof setTimeout>[];
  intervals: ReturnType<typeof setInterval>[];
  tailers: { stop: () => void; drain: () => void }[];
}

export interface StartFreeformRunInput {
  runId: string;
  taskId: string;
  cwd: string;
  pmWorktreeBranch?: string;
  explanation: string;
  agent: Agent;
  command: { cmd: string; args: string[] };
  timeoutMs?: number;
}

export interface StartFreeformRunResult {
  ok: boolean;
  pid?: number;
  reason?: string;
}

/**
 * Owns in-flight freeform runs: durable registry, detached spawn, log tailing,
 * boot-time adoption, and completion callback. Constructed once per server.
 */
export class FreeformRunManager {
  private readonly active = new Map<string, ActiveRun>();

  constructor(
    private readonly config: RepoOSConfig,
    private readonly emit: (e: RepoEvent) => void,
    private readonly finalize: FreeformFinalizer,
    private readonly timeoutMs: number = FREEFORM_TIMEOUT_MS,
  ) {}

  /**
   * Spawn a detached freeform PM run, persist its registry record, and start
   * streaming its durable log. Returns immediately — completion is delivered
   * to the `finalize` callback, never to this caller, so a reload cannot lose
   * the await chain.
   */
  start(input: StartFreeformRunInput): StartFreeformRunResult {
    const { out, err } = freeformLogPaths(this.config, input.runId);
    let proc: ChildProcess;
    try {
      mkdirSync(join(this.config.root, this.config.cacheDir, "agent-logs"), { recursive: true });
      const outFd = openSync(out, "w");
      const errFd = openSync(err, "w");
      try {
        proc = spawn(input.command.cmd, input.command.args, {
          cwd: input.cwd,
          // File descriptors, not pipes: the child keeps them when this server
          // exits during a reload, and the new process tails the same files.
          stdio: ["ignore", outFd, errFd],
          // Own process group, so the child survives the parent's reload and a
          // group signal (reload.ts's failure cleanup) does not reach it.
          detached: process.platform !== "win32",
          env: childEnv(),
        });
      } finally {
        closeSync(outFd);
        closeSync(errFd);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `could not launch ${input.command.cmd}: ${reason}` };
    }

    const record: FreeformRunRecord = {
      runId: input.runId,
      taskId: input.taskId,
      pid: proc.pid ?? 0,
      cwd: input.cwd,
      pmWorktreeBranch: input.pmWorktreeBranch,
      explanation: input.explanation,
      agent: input.agent,
      startedAt: new Date().toISOString(),
    };
    const store = readFreeformStore(this.config);
    store.runs = store.runs.filter((r) => r.runId !== record.runId);
    store.runs.push(record);
    writeFreeformStore(this.config, store);

    const active = this.track(record, proc, input.timeoutMs);
    proc.on("close", (code) => {
      record.exitCode = code;
      this.finish(active);
    });
    proc.on("error", () => this.finish(active));
    // A very short-lived child can exit between spawn() and listener setup;
    // ChildProcess does not replay a missed `close`, so finalize it here.
    if (proc.exitCode !== null) {
      record.exitCode = proc.exitCode;
      this.finish(active);
    }
    return { ok: true, pid: proc.pid };
  }

  /**
   * Re-attach to runs that survived a server restart (#0403). A still-live PID
   * keeps streaming from its durable log; a PID that already exited is
   * finalized from that log so its result is not lost. Call once the task index
   * is ready, so adopted completions can resolve their draft task.
   */
  adopt(): void {
    for (const record of readFreeformRuns(this.config)) {
      if (this.active.has(record.runId)) continue;
      if (pidAlive(record.pid)) {
        markPmWorking(record.taskId);
        this.emit({ type: "task.pmWorking", id: record.taskId, at: new Date().toISOString() });
        const active = this.track(record, undefined);
        const interval = setInterval(() => {
          if (!pidAlive(record.pid)) this.finish(active);
        }, LIVENESS_POLL_MS);
        interval.unref?.();
        active.intervals.push(interval);
      } else {
        // It finished while no server was up. Build the result from the log
        // and run the normal post-processing now.
        this.finalizeRecord(record, false);
      }
    }
  }

  /** Cancel every in-flight run (a real shutdown, not a reload handover). */
  cancelAll(): void {
    for (const record of [...this.active.keys()]) {
      const active = this.active.get(record);
      if (!active) continue;
      killPid(active.record.pid);
      this.finish(active);
    }
  }

  /** True while this manager is tracking the run. */
  isRunning(runId: string): boolean {
    return this.active.has(runId);
  }

  private track(record: FreeformRunRecord, proc?: ChildProcess, timeoutMs?: number): ActiveRun {
    const active: ActiveRun = {
      record,
      finalized: false,
      timedOut: false,
      timers: [],
      intervals: [],
      tailers: [],
    };
    this.active.set(record.runId, active);

    const { out, err } = freeformLogPaths(this.config, record.runId);
    // A live child is streamed from the top; an adopted one resumes at the end
    // so already-seen output is not replayed to a still-open client.
    active.tailers.push(this.tail(record, out, !proc));
    active.tailers.push(this.tail(record, err, !proc));

    const startedMs = Date.parse(record.startedAt);
    const remaining = Math.max(
      0,
      (timeoutMs ?? this.timeoutMs ?? FREEFORM_TIMEOUT_MS) - (Date.now() - startedMs),
    );
    const timer = setTimeout(() => {
      active.timedOut = true;
      killPid(active.record.pid);
      this.finish(active);
    }, remaining);
    timer.unref?.();
    active.timers.push(timer);
    return active;
  }

  private tail(
    record: FreeformRunRecord,
    logFile: string,
    startAtEnd: boolean,
  ): { stop: () => void; drain: () => void } {
    let lastSize = 0;
    let pending = "";
    let decoder = new StringDecoder("utf8");
    if (startAtEnd) {
      try {
        lastSize = statSync(logFile).size;
      } catch {
        /* missing log */
      }
    }
    const drain = (): void => {
      try {
        const currentSize = statSync(logFile).size;
        if (currentSize < lastSize) {
          lastSize = 0;
          decoder = new StringDecoder("utf8");
        }
        if (currentSize > lastSize) {
          const data = readFileSync(logFile);
          const delta = decoder.write(data.subarray(lastSize));
          lastSize = currentSize;
          const lines = (pending + delta).replace(/\r/g, "\n").split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (line.length === 0) continue;
            this.emit({
              type: "agent.output",
              id: record.runId,
              entry: parseOneShotLine(record.agent.cli, line) ?? { s: "out", d: line },
              stream: "out",
              at: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* best-effort */
      }
    };
    const interval = setInterval(() => {
      if (!this.active.has(record.runId)) {
        clearInterval(interval);
        return;
      }
      drain();
    }, LOG_POLL_MS);
    interval.unref?.();
    return {
      stop: () => clearInterval(interval),
      drain: () => {
        drain();
        const line = pending.trimEnd();
        pending = "";
        if (line) {
          this.emit({
            type: "agent.output",
            id: record.runId,
            entry: parseOneShotLine(record.agent.cli, line) ?? { s: "out", d: line },
            stream: "out",
            at: new Date().toISOString(),
          });
        }
      },
    };
  }

  private finish(active: ActiveRun): void {
    if (active.finalized) return;
    active.finalized = true;
    if (this.active.get(active.record.runId) === active) {
      this.active.delete(active.record.runId);
    }
    for (const t of active.timers) clearTimeout(t);
    for (const i of active.intervals) clearInterval(i);
    for (const tailer of active.tailers) {
      tailer.drain();
      tailer.stop();
    }
    this.finalizeRecord(active.record, active.timedOut);
  }

  private finalizeRecord(record: FreeformRunRecord, timedOut: boolean): void {
    const elapsedMs = Math.max(0, Date.now() - Date.parse(record.startedAt));
    let result = oneShotResultFromLog(
      freeformLogPaths(this.config, record.runId).out,
      freeformLogPaths(this.config, record.runId).err,
      elapsedMs,
      record.exitCode,
      record.agent.cli,
    );
    if (timedOut) {
      const secs = Math.round((this.timeoutMs ?? FREEFORM_TIMEOUT_MS) / 1000);
      result = {
        ok: false,
        error: `the ${record.agent.cli} agent timed out after ${secs}s`,
        elapsedMs,
      };
    }
    // Drop the in-flight record before finalizing: a second finalize (a racing
    // boot adoption) must not find it and replay the completion.
    const store = readFreeformStore(this.config);
    store.runs = store.runs.filter((r) => r.runId !== record.runId);
    writeFreeformStore(this.config, store);
    try {
      this.finalize(record, result);
    } catch {
      /* the finalizer owns its own error handling; never crash the manager */
    } finally {
      cleanupFreeformWorktree(this.config, record.pmWorktreeBranch);
    }
  }
}

/** Record a durable failure outcome against a run id (survives the run record). */
export function recordFreeformFailure(config: RepoOSConfig, failure: FreeformRunFailure): void {
  const store = readFreeformStore(config);
  store.failures = store.failures.filter((f) => f.runId !== failure.runId);
  store.failures.push(failure);
  // Keep the store bounded — the durable record is a diagnostic aid, not a log.
  const MAX_FAILURES = 100;
  if (store.failures.length > MAX_FAILURES) {
    store.failures = store.failures.slice(store.failures.length - MAX_FAILURES);
  }
  writeFreeformStore(config, store);
}
