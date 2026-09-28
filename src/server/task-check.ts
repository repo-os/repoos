/**
 * Tracks the `repoos check` invocations RepoOS's own server spawns directly
 * for a task — the handoff-finalize check (handoff.ts's runCheck()) and the
 * MTD merge-gate check (integration-orchestrator.ts's validateCandidate) —
 * so the Debug tab (0310) can show when each ran, how long it took, whether
 * it passed, and stream a currently-running one's output live.
 *
 * Deliberately in-memory only, same tradeoff as TestRunManager: this is
 * observability for the current server session, not a durable audit log. A
 * server restart mid-check simply loses the in-flight run; the check itself
 * gets re-attempted by whatever triggered it.
 *
 * Durable history goes to `.repoos/checks.db` via check-store (#0564) — but
 * the CLI child writes ITS OWN row on completion, so this manager only
 * records the one outcome the child cannot: a run killed before the child
 * could exit on its own (code null — cancelled or never launched). That keeps
 * every completed run exactly one row in the history.
 */

import { getCheckStore, localMachineName, type CheckRunPhase } from "../core/check-store.js";
import { stripAnsi } from "./done.js";

/** Cap on retained output per run so a very noisy check can't grow this
 *  without bound in memory — old text is dropped from the front. */
const MAX_BUFFERED_CHARS = 500_000;

/** How many past runs to retain per task — enough to inspect recent
 *  history without letting a task that gets checked repeatedly (retries)
 *  grow this without bound. */
const MAX_RUNS_PER_TASK = 10;

export type TaskCheckKind = "handoff-finalize" | "merge-gate";

/** The check-run history phase each tracked kind maps to (#0564). */
const KIND_PHASE: Record<TaskCheckKind, CheckRunPhase> = {
  "handoff-finalize": "pre-review",
  "merge-gate": "close-out",
};

export interface TaskCheckRun {
  id: string;
  taskId: string;
  kind: TaskCheckKind;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  running: boolean;
  /** null while running; true/false once done() is called. */
  passed: boolean | null;
  code: number | null;
  output: string;
  /** 'full' or 'changed:<ref>' — what this invocation was scoped to (#0564). */
  scope: string;
  /** Short hostname of the machine the check runs on (this server's). */
  machine: string;
}

export type TaskCheckEventKind = "started" | "output" | "done";

export type TaskCheckListener = (
  run: TaskCheckRun,
  event: TaskCheckEventKind,
  chunk?: string,
) => void;

export interface TaskCheckHandle {
  readonly id: string;
  chunk(text: string): void;
  done(code: number | null): void;
}

export class TaskCheckManager {
  private runsByTask = new Map<string, TaskCheckRun[]>();
  private seq = 0;
  private repoRoot: string | null;
  private cacheDir: string;

  /**
   * `repoRoot` enables durable-history recording (#0564) for the one outcome
   * the spawned CLI child cannot record itself — a run killed before it could
   * exit (cancelled or launch failure). Optional so tests can construct the
   * manager without a repo.
   */
  constructor(repoRoot?: string, cacheDir = ".repoos") {
    this.repoRoot = repoRoot ?? null;
    this.cacheDir = cacheDir;
  }

  /**
   * Begins tracking one check run for `taskId`. Returns a handle the caller
   * feeds output chunks into as the underlying subprocess streams them, and
   * calls `done()` on once the process exits. `scope` describes what the run
   * covers ('full' or 'changed:<ref>') for the live chip and the history.
   */
  start(
    taskId: string,
    kind: TaskCheckKind,
    onEvent: TaskCheckListener,
    meta: { scope?: string } = {},
  ): TaskCheckHandle {
    const id = `${taskId}-${kind}-${++this.seq}`;
    const run: TaskCheckRun = {
      id,
      taskId,
      kind,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationMs: null,
      running: true,
      passed: null,
      code: null,
      output: "",
      scope: meta.scope || "full",
      machine: localMachineName(),
    };
    const list = this.runsByTask.get(taskId) ?? [];
    list.push(run);
    while (list.length > MAX_RUNS_PER_TASK) list.shift();
    this.runsByTask.set(taskId, list);

    onEvent(run, "started");

    return {
      id,
      chunk: (text: string) => {
        const clean = stripAnsi(text);
        run.output += clean;
        if (run.output.length > MAX_BUFFERED_CHARS) {
          run.output = run.output.slice(run.output.length - MAX_BUFFERED_CHARS);
        }
        onEvent(run, "output", clean);
      },
      done: (code: number | null) => {
        run.running = false;
        run.finishedAt = new Date().toISOString();
        run.durationMs = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
        run.code = code;
        run.passed = code === 0;
        onEvent(run, "done");
        // A non-null exit code means the CLI child exited on its own and
        // recorded its own durable row — record nothing here. code === null
        // is the child-never-got-to-report case: cancelled, killed, or the
        // check command was unavailable. That outcome lives only here.
        if (code === null && this.repoRoot) {
          getCheckStore(this.repoRoot, this.cacheDir).record({
            taskId,
            phase: KIND_PHASE[kind],
            machine: run.machine,
            remote: false,
            scope: run.scope,
            startedAt: run.startedAt,
            durationMs: run.durationMs,
            outcome: "cancelled",
            failedStep: null,
            skippedSteps: [],
            detail: "the check process was cancelled before it could finish",
          });
        }
      },
    };
  }

  /** Past + in-progress runs for a task, oldest first. */
  getRuns(taskId: string): TaskCheckRun[] {
    return this.runsByTask.get(taskId) ?? [];
  }
}
