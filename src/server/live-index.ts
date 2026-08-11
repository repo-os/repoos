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
import type { RepoOSConfig, Task, Status, RepoIndex } from "../core/types.js";
import { STATUSES, PRIORITIES } from "../core/types.js";
import { parseTask } from "../core/task.js";
import {
  isGitRepo,
  localBranches,
  lastCommitForFile,
  worktreePaths,
  emptyGitInfo,
} from "../core/git.js";
import { buildIndex } from "../core/indexer.js";

export type RepoEvent =
  | { type: "task.created"; task: Task; at: string }
  | { type: "task.updated"; task: Task; prev: Partial<Task>; at: string }
  | { type: "task.deleted"; id: string; path: string; at: string }
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
  | {
      type: "agent.output";
      id: string;
      data: string;
      stream: "out" | "err";
      at: string;
    }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  | { type: "task.progress"; id: string; step: string; at: string }
  | {
      type: "preview";
      id: string;
      preview: { port: number; url: string; startedAt: string } | null;
      at: string;
    }
  | { type: "hello"; taskCount: number; at: string };

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

  private isTaskFile(absPath: string): boolean {
    const workRoot = join(this.config.root, this.config.workDir);
    if (!absPath.startsWith(workRoot)) return false;
    return this.config.taskExtensions.includes(extname(absPath));
  }

  /** Re-parse a single file after a create/modify. Emits created or updated. */
  applyFileChange(absPath: string): void {
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
      task.git = {
        branchExists: task.branch
          ? this.branchCache.has(task.branch)
          : false,
        worktreeExists: task.branch
          ? worktreePaths(this.config.root).has(task.branch)
          : false,
        lastCommit: subject,
        lastCommitAt: date,
      };
    }

    const existing = this.byId.get(task.id);
    // If the id moved to a different file, treat the old path as stale.
    const priorPath = [...this.pathToId.entries()].find(
      ([, id]) => id === task.id,
    )?.[0];
    if (priorPath && priorPath !== absPath) this.pathToId.delete(priorPath);

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
    for (const [id, t] of this.byId) {
      this.byId.set(id, {
        ...t,
        git: {
          ...t.git,
          branchExists: t.branch ? this.branchCache.has(t.branch) : false,
          worktreeExists: t.branch ? worktrees.has(t.branch) : false,
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
  ];
  const out: Partial<Task> = {};
  for (const f of fields) {
    if (a[f] !== b[f]) (out as Record<string, unknown>)[f] = a[f];
  }
  // body change is common and worth signalling, but don't ship the whole body
  if (a.body !== b.body) (out as Record<string, unknown>).body = "(changed)";
  return out;
}
