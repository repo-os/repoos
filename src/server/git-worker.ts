import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DependencyBlocker, RepoIndex, RepoOSConfig, Task } from "../core/types.js";
import type {
  RepoGitOverview,
  LastCommit,
  WorktreeDirtyCache,
  WorktreeDirtyEntry,
  WorktreeEntry,
  WorktreeStatus,
  GitRun,
  preflightMerge,
} from "../core/git.js";
import type { GcMode, GcReport } from "../core/worktree-gc.js";
import { onGitMutation } from "../core/git-activity.js";
import type { PressureSnapshot } from "../core/pressure-guard.js";
import type { ContextPackGitFacts } from "../core/context-pack.js";

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

export interface GitWorkerResourceSnapshot {
  availableMemBytes: number;
  pressure: PressureSnapshot;
  heavyJobs: { running: number; queued: number };
}

interface QueueJob {
  id: number;
  generation: number;
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
  private generation = 0;
  private buffered = "";
  private stderrTail = "";
  private closed = false;
  private childGitCalls = new Map<number, { id: number; label: string; startedAt: number }>();
  private blockerKey = "";
  private blockerValue: Map<string, DependencyBlocker[]> | null = null;
  private cachedBaseBranch: string | null = null;
  private overviewCache: OverviewWire | null = null;

  constructor(
    private readonly root: string,
    private readonly launch: typeof spawn = spawn,
  ) {}

  request<T>(kind: string, payload: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("git worker is closed"));
    return new Promise<T>((resolve, reject) => {
      const job = {
        id: this.nextId++,
        generation: this.generation,
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
    const generation = this.generation;
    const result = await this.request<IndexBuildWire>(
      "build-index",
      { config, fastWorktreeStatus },
      150_000,
    );
    if (generation === this.generation) {
      this.overviewCache = result.git;
      this.cachedBaseBranch = result.git.baseBranch;
    }
    return { index: result.index, git: overviewFromWire(result.git) };
  }

  async gitOverview(): Promise<RepoGitOverview> {
    if (this.overviewCache) return overviewFromWire(this.overviewCache);
    const generation = this.generation;
    const result = await this.request<OverviewWire>("git-overview", { root: this.root }, 150_000);
    if (generation === this.generation) {
      this.overviewCache = result;
      this.cachedBaseBranch = result.baseBranch;
    }
    return overviewFromWire(result);
  }

  baseBranchFromCache(): string | null {
    return this.cachedBaseBranch;
  }

  async currentBranch(cwd = this.root): Promise<string | null> {
    const result = await this.runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], 4000);
    return result.status === 0 ? result.stdout.trim() || null : null;
  }

  async preflightMerge(
    branch: string,
    opts: { autoResolve?: string[] } = {},
  ): Promise<Awaited<ReturnType<typeof preflightMerge>>> {
    return this.request("preflight-merge", { root: this.root, branch, opts }, 90_000);
  }

  async removeWorktree(branch: string): Promise<boolean> {
    const result = await this.request<boolean>(
      "remove-worktree",
      { root: this.root, branch },
      90_000,
    );
    this.invalidate();
    return result;
  }

  async commitTaskFile(path: string, message: string): Promise<boolean> {
    const result = await this.request<boolean>(
      "commit-task-file",
      { root: this.root, path, message },
      30_000,
    );
    if (result) this.invalidate();
    return result;
  }

  async branchCommit(branch: string): Promise<string | null> {
    return (await this.gitOverview()).heads.get(branch) ?? null;
  }

  async isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean | null> {
    const result = await this.runGit(
      cwd,
      ["merge-base", "--is-ancestor", ancestor, descendant],
      4000,
    );
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    return null;
  }

  async worktreePath(branch: string): Promise<string | null> {
    return (await this.gitOverview()).worktrees.get(branch)?.path ?? null;
  }

  async branchChangesSinceBase(
    cwd: string,
    baseBranch: string,
  ): Promise<{
    base: string | null;
    paths: string[];
  }> {
    return this.request("branch-changes", { cwd, baseBranch }, 30_000);
  }

  async changedPathsVsBase(cwd: string, baseBranch: string): Promise<string[] | null> {
    return this.request("changed-paths", { cwd, baseBranch }, 30_000);
  }

  async directoryCommits(root: string, directory: string): Promise<Map<string, LastCommit>> {
    const rows = await this.request<Array<[string, LastCommit]>>(
      "directory-commits",
      { root, directory },
      150_000,
    );
    return new Map(rows);
  }

  async runGit(cwd: string, args: string[], timeoutMs = 30_000): Promise<GitRun> {
    const result = await this.request<GitRun>(
      "git-command",
      { cwd, args, timeoutMs },
      timeoutMs + 5_000,
    );
    if (result.status === 0 && mayMutateGitRefs(args)) this.invalidate();
    return result;
  }

  async reconcile(
    config: RepoOSConfig,
    branches: string[],
    cache: WorktreeDirtyCache,
    skipStatus = false,
    forceStatus = false,
  ): Promise<{
    git: RepoGitOverview;
    statuses: Map<string, WorktreeStatus>;
    cache: WorktreeDirtyCache;
    changed: boolean;
  }> {
    const result = await this.request<ReconcileWire>(
      "reconcile",
      { config, branches, cache: [...cache], skipStatus, forceStatus },
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

  async contextPackFacts(root: string, cwd: string): Promise<ContextPackGitFacts> {
    return this.request<ContextPackGitFacts>("context-pack-facts", { root, cwd }, 20_000);
  }

  async ensureCanaryReady(config: RepoOSConfig): Promise<{ ok: boolean; detail: string | null }> {
    return this.request<{ ok: boolean; detail: string | null }>(
      "ensure-canary-ready",
      { config },
      30_000,
    );
  }

  async writeProjectEnvironmentValue(
    root: string,
    sourcePath: string,
    key: string,
    value: string | null,
    expectedSha256: string,
  ): Promise<string> {
    return this.request(
      "write-project-environment-value",
      { root, sourcePath, key, value, expectedSha256 },
      20_000,
    );
  }

  async resourceSnapshot(
    config: RepoOSConfig | undefined,
    lockRoot: string,
  ): Promise<GitWorkerResourceSnapshot> {
    return this.request<GitWorkerResourceSnapshot>(
      "resource-snapshot",
      { config, lockRoot },
      20_000,
    );
  }

  async dependencyBlockers(root: string, tasks: Task[]): Promise<Map<string, DependencyBlocker[]>> {
    if (!tasks.some((task) => task.dependsOn?.length)) return new Map();
    const key = tasks
      .map(
        (task) =>
          `${task.id}\0${task.status}\0${task.branch ?? ""}\0${task.mergedCommit ?? ""}\0${task.isArchived ? 1 : 0}\0${(task.dependsOn ?? []).join(",")}`,
      )
      .join("\n");
    if (this.blockerValue && key === this.blockerKey) return this.blockerValue;
    const generation = this.generation;
    const rows = await this.request<Array<[string, DependencyBlocker[]]>>(
      "dependency-blockers",
      { root, tasks },
      150_000,
    );
    const value = new Map(rows);
    if (generation === this.generation) {
      this.blockerKey = key;
      this.blockerValue = value;
    }
    return value;
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
    const result = await this.request<{ report: GcReport; worktreeCount: number | null }>(
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
    if (!opts.dryRun) this.invalidate();
    return result;
  }

  /** Invalidate worker-side ref caches after the watcher observes a ref/HEAD write. */
  invalidate(): void {
    if (this.closed) return;
    this.generation++;
    this.blockerKey = "";
    this.blockerValue = null;
    this.overviewCache = null;
    this.cachedBaseBranch = null;
  }

  inFlight(now = Date.now()): GitWorkerJobInfo[] {
    const jobs = this.active ? [this.active, ...this.queue] : this.queue;
    const queued = jobs.map((job) => ({
      id: job.id,
      label: `git-worker ${job.kind}`,
      state: job.startedAt === null ? ("queued" as const) : ("running" as const),
      ageMs: Math.max(0, now - (job.startedAt ?? job.enqueuedAt)),
    }));
    const calls = [...this.childGitCalls.values()].map((call) => ({
      id: call.id,
      label: call.label,
      state: "running" as const,
      ageMs: Math.max(0, now - call.startedAt),
    }));
    return [...calls, ...queued];
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
    job.generation = this.generation;
    job.startedAt = Date.now();
    try {
      const child = this.ensureChild();
      child.stdin.write(
        `${JSON.stringify({ id: job.id, generation: job.generation, kind: job.kind, payload: job.payload })}\n`,
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
    const child = this.launch(command, [entry], {
      cwd: this.root,
      env: { ...process.env, REPOOS_GIT_WORKER: "1" },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.buffered = "";
    this.stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (this.child === child) this.onStdout(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (this.child === child) this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4000);
    });
    child.stdin.on("error", () => {
      // The exit handler rejects the active/queued request with process details.
    });
    child.on("error", (error) => {
      if (this.child === child) this.onExit(error);
    });
    child.on("close", (code, signal) => {
      if (this.child === child) {
        this.onExit(new Error(`git worker exited (${signal ?? `code ${code}`})`));
      }
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
      let message: {
        id?: number;
        ok?: boolean;
        value?: unknown;
        error?: string;
        type?: string;
        label?: string;
        startedAt?: number;
        end?: boolean;
      };
      try {
        message = JSON.parse(line);
      } catch {
        this.onExit(new Error("git worker returned malformed JSON"));
        return;
      }
      if (message.type === "git-call" && typeof message.id === "number") {
        if (message.end) this.childGitCalls.delete(message.id);
        else {
          this.childGitCalls.set(message.id, {
            id: message.id,
            label: message.label ?? "git",
            startedAt: message.startedAt ?? Date.now(),
          });
        }
        continue;
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
    this.childGitCalls.clear();
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
    this.childGitCalls.clear();
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

function mayMutateGitRefs(args: string[]): boolean {
  const command = args[0];
  if (
    command === "checkout" ||
    command === "switch" ||
    command === "commit" ||
    command === "merge" ||
    command === "reset" ||
    command === "rebase" ||
    command === "cherry-pick" ||
    command === "update-ref" ||
    (command === "worktree" && ["add", "remove", "prune", "move", "repair"].includes(args[1] ?? ""))
  ) {
    return true;
  }
  if (command === "branch") {
    return !args.some((arg) =>
      ["--list", "--merged", "--no-merged", "--contains", "--show-current", "-a", "-r"].includes(
        arg,
      ),
    );
  }
  return false;
}

onGitMutation((root) => workers.get(root)?.invalidate());

export function getGitWorker(root: string): GitWorker {
  let worker = workers.get(root);
  if (!worker) {
    worker = new GitWorker(root);
    workers.set(root, worker);
  }
  return worker;
}

export async function sweepAndWarnAsync(
  config: RepoOSConfig,
  opts: {
    activeJobIds?: Set<string>;
    threshold?: number;
    log: (level: "info" | "warn", msg: string, meta?: Record<string, unknown>) => void;
  },
): Promise<void> {
  try {
    const threshold = opts.threshold ?? 20;
    const { report, worktreeCount } = await getGitWorker(config.root).sweep(config, {
      mode: "integrate-only",
      activeJobIds: opts.activeJobIds,
      includeCount: threshold > 0,
    });
    if (report.removedWorktrees.length || report.errors.length) {
      opts.log("info", "worktree gc", {
        removed: report.removedWorktrees.map((worktree) => worktree.branch || worktree.path),
        errors: report.errors,
      });
    }
    if (threshold > 0 && worktreeCount !== null && worktreeCount > threshold) {
      opts.log(
        "warn",
        `${worktreeCount} git worktrees registered (advisory ceiling ${threshold}) — run \`repoos gc\` to reclaim leftovers from done/abandoned tasks`,
        { worktrees: worktreeCount, threshold },
      );
    }
  } catch (error) {
    opts.log("warn", `worktree gc failed: ${(error as Error).message}`);
  }
}

export function gitWorkerInFlight(root: string): GitWorkerJobInfo[] {
  return workers.get(root)?.inFlight() ?? [];
}

export function closeGitWorker(root: string): void {
  workers.get(root)?.close();
  workers.delete(root);
}
