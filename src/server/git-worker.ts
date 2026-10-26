import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DependencyBlocker, RepoIndex, RepoOSConfig, Task } from "../core/types.js";
import type {
  RepoGitOverview,
  WorktreeDirtyCache,
  WorktreeDirtyEntry,
  WorktreeEntry,
  WorktreeStatus,
} from "../core/git.js";
import type { GcMode, GcReport } from "../core/worktree-gc.js";

interface OverviewWire {
  useGit: boolean;
  baseBranch: string | null;
  branches: string[];
  heads: Array<[string, string]>;
  aheadCounts: Array<[string, number]>;
  worktrees: Array<[string, WorktreeEntry]>;
  fingerprint: string;
}

interface IndexBuildWire {
  index: RepoIndex;
  git: OverviewWire;
}

interface ReconcileWire {
  git: OverviewWire;
  statuses: Array<[string, WorktreeStatus]>;
  cache: Array<[string, WorktreeDirtyEntry]>;
  changed: boolean;
}

export interface GitWorkerTaskFacts {
  lastCommit: string | null;
  lastCommitAt: string | null;
  branchExists: boolean;
  worktreeExists: boolean;
  status: WorktreeStatus;
}

interface QueueJob {
  id: number;
  kind: string;
  payload: unknown;
  enqueuedAt: number;
  startedAt: number | null;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface GitWorkerJobInfo {
  id: number;
  label: string;
  ageMs: number;
  state: "running" | "queued";
}

function overviewFromWire(wire: OverviewWire): RepoGitOverview {
  return {
    useGit: wire.useGit,
    baseBranch: wire.baseBranch,
    branches: new Set(wire.branches),
    heads: new Map(wire.heads),
    aheadCounts: new Map(wire.aheadCounts),
    worktrees: new Map(wire.worktrees),
    fingerprint: wire.fingerprint,
  };
}

function workerEntry(): string {
  const compiled = join(import.meta.dirname, "git-worker-entry.js");
  if (existsSync(compiled)) return compiled;
  // Bun runs the TypeScript entry directly in source/test checkouts.
  return join(import.meta.dirname, "git-worker-entry.ts");
}

/**
 * One dedicated child for RepoOS's git-heavy reads. The HTTP process only sends
 * JSON messages; synchronous core/CLI helpers are allowed to run in the child,
 * never on the HTTP thread. Calls are serialized and bounded end-to-end.
 */
export class GitWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private queue: QueueJob[] = [];
  private active: QueueJob | null = null;
  private nextId = 1;
  private buffered = "";
  private stderrTail = "";
  private closed = false;

  constructor(private readonly root: string) {}

  request<T>(kind: string, payload: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("git worker is closed"));
    return new Promise<T>((resolve, reject) => {
      const job = {
        id: this.nextId++,
        kind,
        payload,
        enqueuedAt: Date.now(),
        startedAt: null,
        timeoutMs,
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        resolve: resolve as (value: unknown) => void,
        reject,
      } satisfies QueueJob;
      job.timer = setTimeout(() => this.timeout(job), timeoutMs);
      job.timer.unref?.();
      this.queue.push(job);
      this.pump();
    });
  }

  async buildIndex(
    config: RepoOSConfig,
    fastWorktreeStatus: boolean,
  ): Promise<{ index: RepoIndex; git: RepoGitOverview }> {
    const result = await this.request<IndexBuildWire>(
      "build-index",
      { config, fastWorktreeStatus },
      150_000,
    );
    return { index: result.index, git: overviewFromWire(result.git) };
  }

  async reconcile(
    config: RepoOSConfig,
    branches: string[],
    cache: WorktreeDirtyCache,
    skipStatus = false,
  ): Promise<{
    git: RepoGitOverview;
    statuses: Map<string, WorktreeStatus>;
    cache: WorktreeDirtyCache;
    changed: boolean;
  }> {
    const result = await this.request<ReconcileWire>(
      "reconcile",
      { config, branches, cache: [...cache], skipStatus },
      150_000,
    );
    return {
      git: overviewFromWire(result.git),
      statuses: new Map(result.statuses),
      cache: new Map(result.cache),
      changed: result.changed,
    };
  }

  async taskFacts(
    config: RepoOSConfig,
    relPath: string,
    branch: string | null,
  ): Promise<GitWorkerTaskFacts> {
    return this.request<GitWorkerTaskFacts>("task-facts", { config, relPath, branch }, 150_000);
  }

  async dependencyBlockers(root: string, tasks: Task[]): Promise<Map<string, DependencyBlocker[]>> {
    const rows = await this.request<Array<[string, DependencyBlocker[]]>>(
      "dependency-blockers",
      { root, tasks },
      150_000,
    );
    return new Map(rows);
  }

  async sweep(
    config: RepoOSConfig,
    opts: {
      mode: GcMode;
      dryRun?: boolean;
      activeJobIds?: Set<string>;
      tasks?: Task[];
      includeCount?: boolean;
    },
  ): Promise<{ report: GcReport; worktreeCount: number | null }> {
    return this.request<{ report: GcReport; worktreeCount: number | null }>(
      "sweep",
      {
        config,
        mode: opts.mode,
        dryRun: opts.dryRun,
        activeJobIds: opts.activeJobIds ? [...opts.activeJobIds] : undefined,
        tasks: opts.tasks,
        includeCount: opts.includeCount,
      },
      150_000,
    );
  }

  /** Invalidate worker-side ref caches after the watcher observes a ref/HEAD write. */
  invalidate(): void {
    if (this.closed) return;
    void this.request("invalidate", { root: this.root }, 5000).catch(() => {
      // A later query can still recompute from git; diagnostics must not throw.
    });
  }

  inFlight(now = Date.now()): GitWorkerJobInfo[] {
    const jobs = this.active ? [this.active, ...this.queue] : this.queue;
    return jobs.map((job) => ({
      id: job.id,
      label: `git-worker ${job.kind}`,
      state: job.startedAt === null ? "queued" : "running",
      ageMs: Math.max(0, now - (job.startedAt ?? job.enqueuedAt)),
    }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const error = new Error("git worker closed");
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
    for (const job of this.queue.splice(0)) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.killChild();
  }

  private pump(): void {
    if (this.closed || this.active) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    job.startedAt = Date.now();
    try {
      const child = this.ensureChild();
      child.stdin.write(
        `${JSON.stringify({ id: job.id, kind: job.kind, payload: job.payload })}\n`,
      );
    } catch (error) {
      clearTimeout(job.timer);
      this.active = null;
      job.reject(error as Error);
      this.pump();
    }
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const entry = workerEntry();
    const command = entry.endsWith(".ts") && !process.versions.bun ? "bun" : process.execPath;
    const child = spawn(command, [entry], {
      cwd: this.root,
      env: { ...process.env, REPOOS_GIT_WORKER: "1" },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.buffered = "";
    this.stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4000);
    });
    child.stdin.on("error", () => {
      // The exit handler rejects the active/queued request with process details.
    });
    child.on("error", (error) => this.onExit(error));
    child.on("close", (code, signal) => {
      this.onExit(new Error(`git worker exited (${signal ?? `code ${code}`})`));
    });
    child.unref();
    return child;
  }

  private onStdout(chunk: string): void {
    this.buffered += chunk;
    for (;;) {
      const newline = this.buffered.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      if (!line) continue;
      let message: { id?: number; ok?: boolean; value?: unknown; error?: string };
      try {
        message = JSON.parse(line);
      } catch {
        this.onExit(new Error("git worker returned malformed JSON"));
        return;
      }
      const job = this.active;
      if (!job || message.id !== job.id) continue;
      clearTimeout(job.timer);
      this.active = null;
      if (message.ok) job.resolve(message.value);
      else job.reject(new Error(message.error || "git worker request failed"));
      this.pump();
    }
  }

  private timeout(job: QueueJob): void {
    const error = new Error(`git worker ${job.kind} timed out after ${job.timeoutMs}ms`);
    if (this.active?.id === job.id) {
      this.active = null;
      job.reject(error);
      this.killChild();
      this.pump();
      return;
    }
    const index = this.queue.indexOf(job);
    if (index !== -1) {
      this.queue.splice(index, 1);
      job.reject(error);
    }
  }

  private onExit(error: Error): void {
    const child = this.child;
    this.child = null;
    if (!child) return;
    const detail = this.stderrTail.trim();
    const failure = detail ? new Error(`${error.message}: ${detail}`) : error;
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(failure);
      this.active = null;
    }
    for (const job of this.queue.splice(0)) {
      clearTimeout(job.timer);
      job.reject(failure);
    }
  }

  private killChild(): void {
    const child = this.child;
    this.child = null;
    if (!child) return;
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
}

const workers = new Map<string, GitWorker>();

export function getGitWorker(root: string): GitWorker {
  let worker = workers.get(root);
  if (!worker) {
    worker = new GitWorker(root);
    workers.set(root, worker);
  }
  return worker;
}

export function gitWorkerInFlight(root: string): GitWorkerJobInfo[] {
  return workers.get(root)?.inFlight() ?? [];
}

export function closeGitWorker(root: string): void {
  workers.get(root)?.close();
  workers.delete(root);
}
