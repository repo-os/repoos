/**
 * The live index. Stage 1's indexer rebuilds everything from disk on demand;
 * for a long-lived server that's wasteful and loses the "what changed" signal.
 *
 * LiveIndex holds the parsed tasks in memory, applies INCREMENTAL updates when
 * individual files change, and emits typed events describing each change. It is
 * still backed entirely by the files on disk — it is a cache with a heartbeat,
 * never a source of truth. A full rebuild (`refreshAll`) is always available
 * and always correct.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import type { AgentOutputEntry, AgentSessionStats, RepoOSConfig, Task, Status, RepoIndex, BoardTask, BoardIndex, SupervisorHeartbeat } from "../core/types.js";
import type { SystemStats } from "./system.js";
import type { AutoEngineeringDecision } from "./auto-engineering.js";
import type { IntegrationSnapshot } from "./integration-status.js";
import { STATUSES, PRIORITIES } from "../core/types.js";
import { parseTask } from "../core/task.js";
import {
  isGitRepo,
  localBranches,
  lastCommitForFile,
  worktreeStatus,
  worktreePaths,
  currentBranch,
  emptyGitInfo,
} from "../core/git.js";
import { buildIndex, buildIndexAsync } from "../core/indexer.js";
import { patchTaskFile } from "./write.js";

export type RepoEvent =
  | { type: "task.created"; task: Task; at: string }
  | { type: "task.updated"; task: Task; prev: Partial<Task>; at: string }
  | { type: "task.deleted"; id: string; path: string; at: string }
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
  | {
      type: "agent.output";
      id: string;
      entry: AgentOutputEntry;
      stream: "out" | "err";
      at: string;
    }
  | { type: "agent.stats"; id: string; stats: AgentSessionStats; at: string }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  | { type: "task.progress"; id: string; step: string; at: string; detail?: string; phase?: string }
  | {
      type: "task.corrected";
      id: string;
      path: string;
      note: string;
      at: string;
    }
  | {
      type: "preview";
      id: string;
      preview: { port: number; url: string; startedAt: string } | null;
      at: string;
    }
  /** Lifecycle of the automatic agent review of a task in `review` (0101). */
  | {
      type: "review";
      id: string;
      state: "running" | "ready" | "failed" | "cancelled";
      at: string;
      error?: string;
    }
  /** Lifecycle of the CTO monitoring agent (0174). */
  | {
      type: "cto";
      state: "running" | "ready" | "failed" | "cancelled";
      at: string;
      error?: string;
    }
  /**
   * A newer build landed on disk (typically a close-out merge). It is parked
   * for a user-triggered reload (0143) — the running server keeps serving the
   * old build until POST /api/server/restart.
   */
  | {
      type: "build.available";
      hash: string;
      buildAt: string | null;
      at: string;
    }
  /** A user-triggered reload could not hand over — the old build keeps serving. */
  | { type: "reload.failed"; reason: string; at: string }
  /** Supervisor heartbeat report (0112). */
  | { type: "supervisor.heartbeat"; heartbeat: SupervisorHeartbeat; at: string }
  /** Auto-engineering mode state change (0124). */
  | {
      type: "auto-engineering.state";
      state: {
        enabled: boolean;
        maxActiveTasks: number;
        activeCount: number;
        availableSlots: number;
        reconciling: boolean;
        decision: AutoEngineeringDecision | null;
      };
      at: string;
    }
  | { type: "hello"; taskCount: number; at: string }
  | { type: "system.stats"; stats: SystemStats }
  /** Live snapshot of the integration pipeline for the pinned status bar (0207). */
  | { type: "integration"; pipeline: IntegrationSnapshot };

type Listener = (e: RepoEvent) => void;

function priorityRank(p: string): number {
  const i = (PRIORITIES as readonly string[]).indexOf(p);
  return i === -1 ? PRIORITIES.length : i;
}
function statusRank(s: Status): number {
  return STATUSES.indexOf(s);
}

export class LiveIndex {
  private config: RepoOSConfig;
  /** task id -> Task */
  private byId = new Map<string, Task>();
  /** abs path -> task id, so a file change maps back to a task */
  private pathToId = new Map<string, string>();
  private listeners = new Set<Listener>();
  private useGit = false;
  private branchCache = new Set<string>();
  /**
   * Guard invoked by `applyFileChange` for a transition INTO `review` that
   * did not already pass through the trusted PATCH route. #0210: a direct
   * task-file edit must be held to the same commit/vacuity gate as the trusted
   * handoff path. Returns false to reject the transition (the file is reverted
   * to its previous status); true/fire-and-forget to accept it.
   */
  private reviewGuard: ((task: Task, prev: Task) => Promise<boolean>) | null = null;

  /** Wire the #0210 review-transition guard. The server owns the logic. */
  setReviewGuard(fn: (task: Task, prev: Task) => Promise<boolean>): void {
    this.reviewGuard = fn;
  }

  constructor(config: RepoOSConfig) {
    this.config = config;
  }

  /** Build from scratch. Safe to call any time; always authoritative. */
  refreshAll(): void {
    const idx = buildIndex(this.config);
    this.byId.clear();
    this.pathToId.clear();
    this.useGit = isGitRepo(this.config.root);
    this.branchCache = this.useGit
      ? localBranches(this.config.root)
      : new Set();
    for (const t of idx.tasks) {
      this.byId.set(t.id, t);
      this.pathToId.set(t.absPath, t.id);
    }
    this.emit({
      type: "index.rebuilt",
      taskCount: this.byId.size,
      at: now(),
    });
  }

  /**
   * Async counterpart of `refreshAll`, used only at server startup: it lets
   * `listen()` proceed while the (git-heavy, otherwise multi-second with
   * 200+ tasks) index build runs in the background — see `buildIndexAsync`.
   * Not a drop-in replacement for `refreshAll` in general: a file-watcher
   * update landing mid-build is overwritten by this call's final swap-in,
   * same as it would be by a concurrent `refreshAll`, but this call's window
   * is wider. Fine for the one-shot boot case; callers that need to
   * interleave safely with live updates should keep using `refreshAll`.
   */
  async refreshAllAsync(): Promise<void> {
    const idx = await buildIndexAsync(this.config);
    this.byId.clear();
    this.pathToId.clear();
    this.useGit = isGitRepo(this.config.root);
    this.branchCache = this.useGit
      ? localBranches(this.config.root)
      : new Set();
    for (const t of idx.tasks) {
      this.byId.set(t.id, t);
      this.pathToId.set(t.absPath, t.id);
    }
    this.emit({
      type: "index.rebuilt",
      taskCount: this.byId.size,
      at: now(),
    });
  }

  private isTaskFile(absPath: string): boolean {
    const workRoot = join(this.config.root, this.config.workDir);
    if (!absPath.startsWith(workRoot)) return false;
    return this.config.taskExtensions.includes(extname(absPath));
  }

  /**
   * Re-parse a single file after a create/modify. Emits created or updated.
   *
   * `opts.guarded` marks a change that already passed the #0210 review gate
   * (the trusted PATCH route and the trusted handoff path run the gate
   * themselves), so it is applied synchronously without re-invoking the guard.
   * Unmarked transitions INTO `review` — a direct task-file edit picked up by
   * the watcher — are deferred to the async guard, which reverts the file to
   * its previous status if the transition is rejected. Returns a Promise for
   * that deferred case so callers (and tests) can await its settlement.
   */
  applyFileChange(absPath: string, opts: { guarded?: boolean } = {}): void | Promise<void> {
    if (!this.isTaskFile(absPath)) return;
    if (!existsSync(absPath)) {
      this.applyFileDelete(absPath);
      return;
    }
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      return; // transient read error (editor mid-write); next event will catch it
    }
    const task = parseTask({
      content,
      absPath,
      root: this.config.root,
      defaultStatus: this.config.defaultStatus,
      defaultAssignee: this.config.defaultAssignee,
      git: emptyGitInfo(),
    });
    if (this.useGit) {
      const { subject, date } = lastCommitForFile(this.config.root, task.path);
      const wt = task.branch
        ? worktreeStatus(this.config.root, task.branch)
        : { path: null, dirty: false };
      task.git = {
        branchExists: task.branch
          ? this.branchCache.has(task.branch)
          : false,
        worktreeExists: task.branch
          ? worktreePaths(this.config.root).has(task.branch)
          : false,
        lastCommit: subject,
        lastCommitAt: date,
        worktreePath: wt.path,
        dirty: wt.dirty,
      };
    }

    const existing = this.byId.get(task.id);
    // If the id moved to a different file, treat the old path as stale.
    const priorPath = [...this.pathToId.entries()].find(
      ([, id]) => id === task.id,
    )?.[0];
    if (priorPath && priorPath !== absPath) this.pathToId.delete(priorPath);

    // #0210: a transition INTO `review` that did not already pass through the
    // trusted PATCH/handoff paths must be held to the same commit/vacuity gate
    // before the index reflects it. Defer so a rejected transition never
    // surfaces as a review event (no misleading auto-review/preview launch).
    if (
      !opts.guarded &&
      this.reviewGuard &&
      existing &&
      existing.status !== "review" &&
      task.status === "review"
    ) {
      return this.runReviewGuard(absPath, task, existing);
    }

    this.applyParsed(absPath, task, existing);
  }

  /** Apply a fully-parsed task to the in-memory index and emit. */
  private applyParsed(absPath: string, task: Task, existing: Task | undefined): void {
    this.byId.set(task.id, task);
    this.pathToId.set(absPath, task.id);

    if (!existing) {
      this.emit({ type: "task.created", task, at: now() });
    } else {
      const prev = diff(existing, task);
      // Only emit if something user-visible actually changed.
      if (Object.keys(prev).length > 0) {
        this.emit({ type: "task.updated", task, prev, at: now() });
      }
    }
  }

  /**
   * Run the #0210 review guard for a deferred transition into `review`. On
   * acceptance the task is applied normally (the worktree was committed by the
   * guard). On rejection the task file is reverted to its previous status —
   * using the same safe write path as a server edit — so the bypass can never
   * leave a task sitting in `review` with uncommitted work.
   */
  private async runReviewGuard(
    absPath: string,
    task: Task,
    existing: Task,
  ): Promise<void> {
    if (!this.reviewGuard) {
      this.applyParsed(absPath, task, existing);
      return;
    }
    let allowed: boolean;
    try {
      allowed = await this.reviewGuard(task, existing);
    } catch {
      allowed = false; // a failing guard must not leak the transition through
    }
    if (!allowed) {
      try {
        patchTaskFile(this.config, absPath, { status: existing.status });
      } catch {
        // If the revert fails, reflect what git actually shows rather than the
        // unvalidated review state.
      }
      // Re-read whatever is now on disk (reverted, or unchanged) and apply it.
      if (!existsSync(absPath)) return;
      this.applyFileChange(absPath, { guarded: true });
      return;
    }
    this.applyParsed(absPath, task, existing);
  }

  /** Handle a file removal. Emits deleted if it mapped to a known task. */
  applyFileDelete(absPath: string): void {
    const id = this.pathToId.get(absPath);
    if (!id) return;
    const task = this.byId.get(id);
    this.pathToId.delete(absPath);
    this.byId.delete(id);
    this.emit({
      type: "task.deleted",
      id,
      path: task?.path ?? absPath,
      at: now(),
    });
  }

  /**
   * Re-scan local branches and re-apply `git.branchExists` to indexed tasks.
   * Used after an agent launch creates a task's branch, so the UI's "branch
   * exists locally" dot is correct without a full rebuild.
   */
  refreshBranches(): void {
    this.useGit = isGitRepo(this.config.root);
    this.branchCache = this.useGit
      ? localBranches(this.config.root)
      : new Set();
    const worktrees = this.useGit ? worktreePaths(this.config.root) : new Map<string, string>();
    const baseBranch = this.useGit ? currentBranch(this.config.root) : null;
    for (const [id, t] of this.byId) {
      const wt = t.branch
        ? worktreeStatus(this.config.root, t.branch, { worktrees, baseBranch })
        : { path: null, dirty: false };
      this.byId.set(id, {
        ...t,
        git: {
          ...t.git,
          branchExists: t.branch ? this.branchCache.has(t.branch) : false,
          worktreeExists: t.branch ? worktrees.has(t.branch) : false,
          worktreePath: wt.path,
          dirty: wt.dirty,
        },
      });
    }
  }

  // ---- reads ----

  getTasks(status?: Status): Task[] {
    const all = [...this.byId.values()];
    const filtered = status ? all.filter((t) => t.status === status) : all;
    return filtered.sort((a, b) => {
      const s = statusRank(a.status) - statusRank(b.status);
      if (s !== 0) return s;
      const p = priorityRank(a.priority) - priorityRank(b.priority);
      if (p !== 0) return p;
      return a.id.localeCompare(b.id);
    });
  }

  getTask(id: string): Task | null {
    return this.byId.get(id) ?? null;
  }

  counts(): Record<Status, number> {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
      Status,
      number
    >;
    for (const t of this.byId.values()) c[t.status]++;
    return c;
  }

  snapshot(): RepoIndex {
    const tasks = this.getTasks();
    return {
      version: 1,
      generatedAt: now(),
      root: this.config.root,
      taskCount: tasks.length,
      tasks,
      counts: this.counts(),
    };
  }

  /** Lightweight board snapshot — skips body, extra, agent overrides. */
  boardSnapshot(): BoardIndex {
    const tasks = this.getTasks();
    return {
      version: 1,
      generatedAt: now(),
      root: this.config.root,
      taskCount: tasks.length,
      tasks: tasks.map(toBoardTask),
      counts: this.counts(),
    };
  }

  // ---- events ----

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RepoEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        /* a bad listener must not break the index */
      }
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

/** Strip a Task down to what the board renders. */
function toBoardTask(t: Task): BoardTask {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    status: t.status,
    needsInput: t.needsInput,
    needsMerge: t.needsMerge,
    priority: t.priority,
    area: t.area,
    assignee: t.assignee,
    assignedTo: t.assignedTo,
    createdBy: t.createdBy,
    branch: t.branch,
    tags: t.tags,
    created_at: t.created_at,
    updated_at: t.updated_at,
    releasedAt: t.releasedAt ?? null,
    bodyPreview: t.body?.slice(0, 500) ?? "",
    path: t.path,
    absPath: t.absPath,
    git: t.git,
    preview: null,
    checkRetryCount: typeof t.extra?.check_retry_count === "number" ? t.extra.check_retry_count : 0,
    mergeConflictRetryCount:
      typeof t.extra?.merge_conflict_retry_count === "number" ? t.extra.merge_conflict_retry_count : 0,
    handoffSignalRetryCount:
      typeof t.extra?.handoff_signal_retry_count === "number" ? t.extra.handoff_signal_retry_count : 0,
  };
}

/** Shallow diff of the fields we care about, for the `prev` payload. */
function diff(a: Task, b: Task): Partial<Task> {
  const fields: (keyof Task)[] = [
    "title",
    "status",
    "priority",
    "area",
    "assignee",
    "assignedTo",
    "branch",
    "type",
    "needsInput",
    "needsMerge",
    "agentOverride",
    "cliOverride",
    "modelOverride",
    "pmAgentOverride",
    "pmCliOverride",
    "pmModelOverride",
    "reviewAgentOverride",
    "reviewCliOverride",
    "reviewModelOverride",
    "created_at",
    "updated_at",
  ];
  const out: Partial<Task> = {};
  for (const f of fields) {
    if (a[f] !== b[f]) (out as Record<string, unknown>)[f] = a[f];
  }
  // body change is common and worth signalling, but don't ship the whole body
  if (a.body !== b.body) (out as Record<string, unknown>).body = "(changed)";
  return out;
}
