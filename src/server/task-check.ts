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
 */

/** Cap on retained output per run so a very noisy check can't grow this
 *  without bound in memory — old text is dropped from the front. */
const MAX_BUFFERED_CHARS = 500_000;

/** How many past runs to retain per task — enough to inspect recent
 *  history without letting a task that gets checked repeatedly (retries)
 *  grow this without bound. */
const MAX_RUNS_PER_TASK = 10;

export type TaskCheckKind = "handoff-finalize" | "merge-gate";

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
}

export type TaskCheckEventKind = "started" | "output" | "done";

export type TaskCheckListener = (run: TaskCheckRun, event: TaskCheckEventKind, chunk?: string) => void;

export interface TaskCheckHandle {
  readonly id: string;
  chunk(text: string): void;
  done(code: number | null): void;
}

export class TaskCheckManager {
  private runsByTask = new Map<string, TaskCheckRun[]>();
  private seq = 0;

  /**
   * Begins tracking one check run for `taskId`. Returns a handle the caller
   * feeds output chunks into as the underlying subprocess streams them, and
   * calls `done()` on once the process exits.
   */
  start(taskId: string, kind: TaskCheckKind, onEvent: TaskCheckListener): TaskCheckHandle {
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
    };
    const list = this.runsByTask.get(taskId) ?? [];
    list.push(run);
    while (list.length > MAX_RUNS_PER_TASK) list.shift();
    this.runsByTask.set(taskId, list);

    onEvent(run, "started");

    return {
      id,
      chunk: (text: string) => {
        run.output += text;
        if (run.output.length > MAX_BUFFERED_CHARS) {
          run.output = run.output.slice(run.output.length - MAX_BUFFERED_CHARS);
        }
        onEvent(run, "output", text);
      },
      done: (code: number | null) => {
        run.running = false;
        run.finishedAt = new Date().toISOString();
        run.durationMs = Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
        run.code = code;
        run.passed = code === 0;
        onEvent(run, "done");
      },
    };
  }

  /** Past + in-progress runs for a task, oldest first. */
  getRuns(taskId: string): TaskCheckRun[] {
    return this.runsByTask.get(taskId) ?? [];
  }
}
