/**
 * Garbage-collect leaked task worktrees and branches.
 *
 * Two things leak them:
 *  - a close-out job that FAILS never removes its `repoos/integrate/<id>`
 *    candidate worktree (the success path does, in the orchestrator's
 *    `cleanup()`), and
 *  - historically, close-outs that predate the non-blocking merge queue — plus
 *    CLI `repoos mv <id> done`, which is a pure status edit — left the feature
 *    worktree/branch behind entirely.
 *
 * Left alone they accumulate without bound, and every server cold boot pays one
 * `git status` per registered worktree while enriching the index
 * (`buildIndexAsync` -> `resolveWorktreeStatuses`).
 *
 * Policy (#1004): cleanup is automatic and fail-closed. A feature worktree is
 * only reclaimed when its task is resolved (done, or archived) AND its branch
 * content is provably represented in the canonical main checkout, OR it is
 * clean/merged, OR its only dirt is `work/*.md` files whose working-tree bytes
 * are exactly main's canonical bytes. Anything active, human-assigned,
 * unmerged, lacking a task record (lifecycle unknown), or holding
 * unexplained/unique files is kept with an actionable reason. Archived
 * metadata alone is never proof: an archived-but-unmerged branch stays.
 *
 * Scope boundary: this ONLY ever removes worktrees whose path is inside
 * `worktreesDir(root)` (the `<root>-worktrees/` sibling directory that
 * `ensureWorktree` always uses). The main checkout, this Claude Code session's
 * `<root>/.claude/worktrees/*`, and any other coding agent's or tool's worktrees
 * live outside that directory; they are reported as `external` and never even
 * inspected (no `git status`), let alone removed.
 */
import { existsSync, realpathSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import type { RepoOSConfig, Task } from "./types.js";
import { worktreesDir } from "./config.js";
import { buildIndex } from "./indexer.js";
import { localCheckLockRoot, reapOrphanedLocalCheckGroups } from "./cross-process-slots.js";
import {
  isGitRepo,
  currentBranch,
  listWorktrees,
  removeWorktree,
  deleteBranch,
  pruneWorktrees,
  mergedBranches,
} from "./git.js";

const CANDIDATE_BRANCH_PREFIX = "repoos/integrate/";

export type GcMode = "integrate-only" | "full";

/** One registered worktree RepoOS has classified. */
export interface GcEntry {
  branch: string;
  path: string;
  /** Why it is a cleanup candidate, or why it is retained. */
  reason: string;
  /** Task id when the branch belongs to a task on the board. */
  taskId?: string;
  taskStatus?: string;
  /** Commits on the branch that are not ancestors of main, when measured. */
  commitsAhead?: number;
  /** Dirty paths (repo-relative) when the entry was retained for its contents. */
  dirtyPaths?: string[];
}

/** A registered worktree outside RepoOS's managed directory. Never inspected. */
export interface GcExternal {
  branch: string;
  path: string;
  reason: string;
}

export interface GcReport {
  mode: GcMode;
  dryRun: boolean;
  /** Worktrees removed (or that would be, when dryRun). */
  removedWorktrees: GcEntry[];
  /** Branches deleted (or that would be). */
  removedBranches: string[];
  /** Stale entries left in place with an actionable reason. */
  retained: GcEntry[];
  /**
   * @deprecated Compatibility alias for {@link retained}. The Control page
   * preview shipped in older builds reads `keptDirty`; new callers should use
   * `retained` (and `external`).
   */
  keptDirty: GcEntry[];
  /** Registered worktrees outside RepoOS's managed directory. */
  external: GcExternal[];
  /** Counts mirror the arrays above so callers cannot disagree about them. */
  summary: { candidates: number; retained: number; external: number };
  /** True when `git worktree prune` ran (metadata for vanished directories). */
  prunedMetadata: boolean;
  /** Non-fatal problems (a `git worktree remove` that would not take, etc.). */
  errors: string[];
}

export interface SweepOptions {
  mode: GcMode;
  dryRun?: boolean;
  /**
   * Task ids whose `repoos/integrate/<id>` candidate must be spared — a job is
   * still queued/running/recovering for them. When omitted, records are read
   * from the durable integration-job store so callers cannot forget the guard.
   */
  activeJobIds?: Set<string>;
  /**
   * Every task on the board. Only needed for `mode: "full"`; omitted, it is read
   * from a fresh `buildIndex`. `mode: "integrate-only"` never looks at tasks.
   */
  tasks?: Task[];
}

/** Read durable close-out records directly so every sweep caller gets the same
 * protection, including the CLI where no server coordinator is available.
 *
 * `known` is false when the store itself cannot be read or parsed. The caller
 * must then skip cleanup: an unreadable record could belong to any task, so no
 * candidate or feature worktree can be proven inactive. A missing directory is
 * `known: true` with no records. */
function activeCloseOutIds(config: RepoOSConfig): { ids: Set<string>; known: boolean } {
  // integration-job.ts persists here independently of the configurable cacheDir.
  const dir = join(config.root, ".repoos", "integration-jobs");
  const ids = new Set<string>();
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ids, known: true };
    return { ids, known: false };
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const job = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as {
        taskId?: unknown;
        phase?: unknown;
      };
      if (typeof job.taskId !== "string") return { ids, known: false };
      if (job.phase !== "done" && job.phase !== "failed") ids.add(job.taskId);
    } catch {
      // A malformed job record cannot establish that any candidate is safe.
      return { ids, known: false };
    }
  }
  return { ids, known: true };
}

function gitRun(
  cwd: string,
  args: string[],
  opts: { timeout?: number } = {},
): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: opts.timeout ?? 8000,
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

/**
 * Dirty paths in a worktree, repo-relative, WITHOUT touching `dist/` (generated
 * build output is routinely re-dirtied and is not work data — the same
 * exclusion `DIFF_SOURCE_PATHS` uses for the review diff). A missing directory
 * has no dirty paths. `null` means git could not tell us, which is treated as
 * "not safe to clean".
 */
function worktreeDirtyPaths(path: string): string[] | null {
  if (!existsSync(path)) return [];
  const run = gitRun(path, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude)dist",
  ]);
  if (run.status !== 0) return null;
  const parts = run.stdout.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    paths.push(entry.slice(3));
    // Rename/copy records carry the original path as the next NUL field.
    if (status.includes("R") || status.includes("C")) {
      const original = parts[i + 1];
      if (original) {
        paths.push(original);
        i += 1;
      }
    }
  }
  return paths;
}

/** Resolve symlinks (macOS `/var` -> `/private/var`) so path containment checks line up. */
function realpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function isInside(dir: string, candidate: string): boolean {
  const rel = relative(realpath(dir), realpath(candidate));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** True when `path` is a task file (`<workDir>/*.md`), the only bookkeeping
 * files whose canonical content always lives on main. */
function isTaskFilePath(path: string, workDir: string): boolean {
  const prefix = workDir.endsWith("/") ? workDir : `${workDir}/`;
  return path.startsWith(prefix) && path.endsWith(".md");
}

interface Representation {
  represented: boolean;
  /** Non-task paths that still differ between main and the branch. */
  differing: string[];
  /** Task files added on the branch but absent from main (unique data). */
  uniqueTaskFiles: string[];
}

/** Actionable retention reason for a branch that is not proven redundant. */
function notRepresentedReason(proof: Representation, mainBranch: string): string {
  if (proof.uniqueTaskFiles.length > 0) {
    return `task file content not represented in ${mainBranch}: ${proof.uniqueTaskFiles
      .slice(0, 5)
      .join(", ")}`;
  }
  if (proof.differing.length > 0) {
    return `changes not in ${mainBranch}: ${proof.differing.slice(0, 5).join(", ")}`;
  }
  return "commits not represented in main";
}

/**
 * Compare the branch's contribution since `base` with main, using the same
 * fail-closed content rules. `base` is either the merge base (the branch's whole
 * contribution) or the task's recorded `merged_commit` (only the commits added
 * after the successful close-out, e.g. WIP self-check checkpoints).
 */
function compareContributionSince(
  root: string,
  mainBranch: string,
  branch: string,
  workDir: string,
  base: string,
): Representation {
  const diff = gitRun(root, ["diff", "--name-only", "-z", "--no-renames", base, branch]);
  if (diff.status !== 0) return { represented: false, differing: [], uniqueTaskFiles: [] };
  const changed = diff.stdout.split("\0").filter(Boolean);
  if (changed.length === 0) {
    return { represented: true, differing: [], uniqueTaskFiles: [] };
  }
  // Task files are canonical-wins only when the branch's bytes are exactly
  // main's. A changed task file whose content differs — or that main does not
  // have — may hold unique data, so it keeps the worktree. A branch deletion
  // (no branch-side bytes) carries nothing to preserve.
  const uniqueTaskFiles = changed.filter((path) => {
    if (!isTaskFilePath(path, workDir)) return false;
    const branchFile = gitRunBytes(root, ["show", `${branch}:${path}`]);
    if (branchFile === null) return false;
    const mainFile = gitRunBytes(root, ["show", `${mainBranch}:${path}`]);
    return mainFile === null || Buffer.compare(branchFile, mainFile) !== 0;
  });
  const sourcePaths = changed.filter((path) => !isTaskFilePath(path, workDir));
  if (uniqueTaskFiles.length > 0 || sourcePaths.length === 0) {
    return {
      represented: uniqueTaskFiles.length === 0,
      differing: [],
      uniqueTaskFiles,
    };
  }
  // Compare main with the branch only over the paths this contribution touched,
  // so a main that has simply moved ahead does not look like divergence. Chunk
  // the pathspec to stay well clear of the OS argument limit. Rename detection
  // is OFF: a rename must be checked as both the addition and the deletion, or
  // an old file main still has could disappear from the comparison.
  const differing: string[] = [];
  const CHUNK = 100;
  for (let i = 0; i < sourcePaths.length; i += CHUNK) {
    const compare = gitRun(
      root,
      [
        "diff",
        "--name-only",
        "-z",
        "--no-renames",
        mainBranch,
        branch,
        "--",
        ...sourcePaths.slice(i, i + CHUNK),
      ],
      { timeout: 15000 },
    );
    if (compare.status !== 0) return { represented: false, differing: [], uniqueTaskFiles: [] };
    differing.push(...compare.stdout.split("\0").filter(Boolean));
    if (differing.length > 0) break;
  }
  return {
    represented: differing.length === 0,
    differing,
    uniqueTaskFiles: [],
  };
}

function isAncestorOf(root: string, ancestor: string, descendant: string): boolean {
  return (
    gitRun(root, ["merge-base", "--is-ancestor", ancestor, descendant], { timeout: 4000 })
      .status === 0
  );
}

/**
 * Prove a branch's contribution is already represented in main.
 *
 * A plain `git branch --merged main` misses squash/rebase-merged work and
 * branch-tip WIP checkpoint commits whose content already landed. Two proofs are
 * tried, both fail-closed:
 *
 *  1. The task's recorded `merged_commit` is an ancestor of main: only the
 *     commits added after that recorded close-out need a content comparison.
 *     This is what lets branch-tip WIP checkpoint commits (#0834) be reclaimed.
 *  2. Otherwise, every non-task path the branch changed since the merge base
 *     must be byte-identical in main.
 *
 * In both cases a task file the branch added, or modified to different bytes
 * than main's canonical copy, is unique data and keeps the worktree. Rename
 * detection is disabled so a rename is checked as both an addition and a
 * deletion. Cleanup is skipped entirely when the task index or the durable
 * close-out-job state cannot be read.
 */
function branchRepresentedInMain(
  root: string,
  mainBranch: string,
  branch: string,
  workDir: string,
  mergedCommit?: string | null,
): Representation {
  if (mergedCommit && isAncestorOf(root, mergedCommit, mainBranch)) {
    return compareContributionSince(root, mainBranch, branch, workDir, mergedCommit);
  }
  const base = gitRun(root, ["merge-base", mainBranch, branch]);
  if (base.status !== 0 || !base.stdout.trim()) {
    return { represented: false, differing: [], uniqueTaskFiles: [] };
  }
  return compareContributionSince(root, mainBranch, branch, workDir, base.stdout.trim());
}

/**
 * When the only dirt is `work/*.md`, it can be discarded only if every
 * working-tree file is byte-identical to main's canonical copy (or was
 * deleted). Any unique content — including an untracked task file main does
 * not have — keeps the worktree.
 */
function dirtyTaskFilesAreRedundant(
  root: string,
  worktreePath: string,
  mainBranch: string,
  workDir: string,
  dirtyPaths: string[],
): { safe: boolean; unsafe: string[] } {
  const unsafe: string[] = [];
  for (const path of dirtyPaths) {
    if (!isTaskFilePath(path, workDir)) {
      unsafe.push(path);
      continue;
    }
    const absolute = join(worktreePath, path);
    if (!existsSync(absolute)) continue; // a dirty deletion carries no working-tree data
    let current: Buffer;
    try {
      current = readFileSync(absolute);
    } catch {
      unsafe.push(path);
      continue;
    }
    const canonical = gitRunBytes(root, ["show", `${mainBranch}:${path}`]);
    if (!canonical || Buffer.compare(current, canonical) !== 0) unsafe.push(path);
  }
  return { safe: unsafe.length === 0, unsafe };
}

function gitRunBytes(root: string, args: string[]): Buffer | null {
  const run = spawnSync("git", args, { cwd: root, timeout: 8000 });
  if (run.status !== 0) return null;
  return Buffer.isBuffer(run.stdout) ? run.stdout : Buffer.from(run.stdout ?? "");
}

function commitCountAhead(root: string, mainBranch: string, branch: string): number | undefined {
  const run = gitRun(root, ["rev-list", "--count", `${mainBranch}..${branch}`], {
    timeout: 8000,
  });
  if (run.status !== 0) return undefined;
  const count = Number.parseInt(run.stdout.trim(), 10);
  return Number.isFinite(count) ? count : undefined;
}

/**
 * Sweep stale worktrees/branches. Synchronous and fail-soft — any git hiccup is
 * recorded in `report.errors` and the sweep moves on.
 */
export function sweepStaleWorktrees(config: RepoOSConfig, opts: SweepOptions): GcReport {
  const root = config.root;
  const report: GcReport = {
    mode: opts.mode,
    dryRun: !!opts.dryRun,
    removedWorktrees: [],
    removedBranches: [],
    retained: [],
    keptDirty: [],
    external: [],
    summary: { candidates: 0, retained: 0, external: 0 },
    prunedMetadata: false,
    errors: [],
  };
  const finish = (): GcReport => {
    report.keptDirty = report.retained;
    report.summary = {
      candidates: report.removedWorktrees.length,
      retained: report.retained.length,
      external: report.external.length,
    };
    return report;
  };
  if (!isGitRepo(root)) {
    report.errors.push("not a git repository");
    return finish();
  }
  // A close-out cancellation normally reaps the detached check group before
  // removing its candidate. If the server itself was interrupted mid-stop,
  // the next maintenance sweep can still identify it from the slot metadata.
  reapOrphanedLocalCheckGroups(localCheckLockRoot(root, config.cacheDir ?? ".repoos"));

  const wtDir = worktreesDir(root);
  const mainBranch = currentBranch(root) ?? "main";
  const workDir = config.workDir || "work";

  const infos = listWorktrees(root);
  const scoped = infos.filter((w) => !w.isMain && !w.isBare && isInside(wtDir, w.path));
  const outside = infos.filter((w) => !w.isMain && !w.isBare && !isInside(wtDir, w.path));
  for (const w of outside) {
    report.external.push({
      branch: w.branch ?? "",
      path: w.path,
      reason: "outside RepoOS's managed worktree directory",
    });
  }

  // Lifecycle state must be established before anything is removed. A close-out
  // record we cannot read could belong to any task, and an unreadable task index
  // would make every branch look like it has no live task — both must fail
  // closed by skipping cleanup entirely. Read the durable store even when the
  // caller supplies ids: the caller's in-memory set can be stale or partial.
  const closeOuts = activeCloseOutIds(config);
  if (!closeOuts.known) {
    report.errors.push("close-out job state could not be read — cleanup skipped");
    return finish();
  }
  const activeJobIds = new Set([...(opts.activeJobIds ?? []), ...closeOuts.ids]);

  // branch -> task, for the "is this worktree still live" check (full mode only).
  const taskByBranch = new Map<string, Task>();
  let tasks: Task[];
  if (opts.tasks) {
    tasks = opts.tasks;
  } else {
    try {
      tasks = buildIndex(config).tasks;
    } catch (e) {
      report.errors.push(
        `task index could not be built (${(e as Error).message}) — cleanup skipped`,
      );
      return finish();
    }
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  if (opts.mode === "full") {
    for (const t of tasks) if (t.branch) taskByBranch.set(t.branch, t);
  }

  const mergedIntoMain =
    opts.mode === "full" ? mergedBranches(root, mainBranch) : new Set<string>();

  const retain = (entry: GcEntry): void => {
    report.retained.push(entry);
  };
  const candidate = (entry: GcEntry): void => {
    report.removedWorktrees.push(entry);
  };

  // `forceWorktree` is only ever true where this sweep has ALREADY decided the
  // tree's contents may be discarded: a throwaway `repoos/integrate/<id>`
  // candidate, a feature worktree established to be represented in main AND
  // clean, or one whose only dirt is redundant task-file bytes. Everything else
  // keeps the non-forced default of `removeWorktree`, which refuses a dirty
  // worktree rather than deleting it (#0512) — the same invariant the close-out
  // path holds.
  const remove = (entry: GcEntry, forceBranch: boolean, forceWorktree: boolean): void => {
    if (report.dryRun) {
      candidate(entry);
      if (entry.branch) report.removedBranches.push(entry.branch);
      return;
    }
    if (!removeWorktree(root, entry.branch || entry.path, { force: forceWorktree })) {
      report.errors.push(`could not remove worktree for ${entry.branch || entry.path}`);
      return;
    }
    candidate(entry);
    if (entry.branch && deleteBranch(root, entry.branch, { force: forceBranch })) {
      report.removedBranches.push(entry.branch);
    } else if (entry.branch) {
      report.errors.push(`worktree gone but branch ${entry.branch} not deleted`);
    }
  };

  for (const w of scoped) {
    const branch = w.branch ?? "";
    const task = branch ? taskByBranch.get(branch) : undefined;
    const meta = {
      branch,
      path: w.path,
      ...(task ? { taskId: task.id, taskStatus: task.status } : {}),
    };

    // --- repoos/integrate/<id> candidates: throwaway, both modes ---
    if (branch.startsWith(CANDIDATE_BRANCH_PREFIX)) {
      const taskId = branch.slice(CANDIDATE_BRANCH_PREFIX.length);
      if (activeJobIds.has(taskId)) {
        retain({ ...meta, reason: "close-out job still active" });
        continue;
      }
      const candidateTask = taskById.get(taskId);
      if (candidateTask?.status === "active" || candidateTask?.status === "review") {
        retain({ ...meta, reason: "task agent still active" });
        continue;
      }
      remove(
        { ...meta, reason: "throwaway close-out candidate" },
        /* forceBranch */ true,
        /* forceWorktree */ true,
      );
      continue;
    }

    if (opts.mode === "integrate-only") continue;

    // --- feature worktrees ---
    if (!branch) {
      // Detached HEAD with no branch ref: only safe to drop when its directory
      // is already gone (pure stale metadata).
      if (!existsSync(w.path)) {
        remove(
          { branch: "", path: w.path, reason: "stale metadata for a vanished directory" },
          false,
          true,
        );
      } else {
        retain({ branch: "", path: w.path, reason: "detached worktree, directory present" });
      }
      continue;
    }

    // No task record means the lifecycle is unknown, not inactive. The index
    // can be stale or partial (a just-created task, a file the watcher has not
    // seen yet), and an active agent or close-out must never lose its worktree
    // because its task record was momentarily missing. Fail closed: keep a
    // live directory until a task record proves the work is resolved. A
    // vanished directory has no working tree to protect — only its branch ref
    // can carry unmerged data — so the content proof here decides.
    if (!task) {
      if (existsSync(w.path)) {
        retain({ ...meta, reason: "no task record for branch — lifecycle state unknown" });
        continue;
      }
      const proof = mergedIntoMain.has(branch)
        ? { represented: true, differing: [] as string[], uniqueTaskFiles: [] as string[] }
        : branchRepresentedInMain(root, mainBranch, branch, workDir, null);
      if (!proof.represented) {
        retain({ ...meta, reason: notRepresentedReason(proof, mainBranch) });
        continue;
      }
      remove({ ...meta, reason: "stale metadata for a vanished directory" }, false, true);
      continue;
    }

    // A task that is not resolved keeps its worktree no matter what git says.
    // Archived is orthogonal to status: an archived bare task is eligible only
    // after the same representation proof below, never on archive metadata
    // alone. Human-assigned work is always retained (#1004).
    const closed = task.status !== "active" && task.status !== "review";
    const resolved =
      closed && (task.status === "done" || (task.isArchived === true && task.assignee === "ai"));
    if (!resolved) {
      const reason =
        task.status === "active" || task.status === "review"
          ? "task agent still active"
          : task.assignee === "human"
            ? "human-assigned task (not resolved by close-out)"
            : task.isArchived
              ? `archived task status is ${task.status} (not resolved)`
              : `task status is ${task.status} (not resolved)`;
      retain({ ...meta, reason });
      continue;
    }
    if (task.assignee === "human") {
      // Done human-owned work is still human-owned; a done close-out is the
      // only RepoOS workflow that resolves it, and even then we do not delete a
      // worktree the human may still be inspecting.
      retain({ ...meta, reason: "human-assigned task" });
      continue;
    }

    // At this point the task is resolved (done, or archived+AI) and AI-owned.
    // `merged` is the cheap ancestry proof; `representation` is the stronger
    // content proof for squash/rebase/WIP-checkpoint branches.
    const merged = mergedIntoMain.has(branch);
    const dirtyPaths = worktreeDirtyPaths(w.path);
    const commitsAhead = merged ? 0 : commitCountAhead(root, mainBranch, branch);
    const withProgress = (entry: GcEntry): GcEntry =>
      commitsAhead === undefined ? entry : { ...entry, commitsAhead };

    if (dirtyPaths === null) {
      retain(
        withProgress({
          ...meta,
          reason: "could not read worktree status (kept conservatively)",
        }),
      );
      continue;
    }

    let represented = merged;
    let differing: string[] = [];
    let uniqueTaskFiles: string[] = [];
    if (!represented) {
      const proof = branchRepresentedInMain(
        root,
        mainBranch,
        branch,
        workDir,
        task.mergedCommit ?? null,
      );
      represented = proof.represented;
      differing = proof.differing;
      uniqueTaskFiles = proof.uniqueTaskFiles;
    }

    if (!represented) {
      retain(
        withProgress({
          ...meta,
          reason: notRepresentedReason({ represented, differing, uniqueTaskFiles }, mainBranch),
          ...(dirtyPaths.length > 0 ? { dirtyPaths } : {}),
        }),
      );
      continue;
    }

    if (dirtyPaths.length > 0) {
      const taskDirt = dirtyTaskFilesAreRedundant(root, w.path, mainBranch, workDir, dirtyPaths);
      if (!taskDirt.safe) {
        const allTaskFiles = dirtyPaths.every((path) => isTaskFilePath(path, workDir));
        retain(
          withProgress({
            ...meta,
            reason: allTaskFiles
              ? `uncommitted task-file changes with unique data: ${taskDirt.unsafe.slice(0, 5).join(", ")}`
              : `uncommitted changes: ${taskDirt.unsafe.slice(0, 5).join(", ")}`,
            dirtyPaths,
          }),
        );
        continue;
      }
      remove(
        withProgress({
          ...meta,
          reason: "merged into main; dirty task-file changes match main",
        }),
        /* forceBranch */ false,
        /* forceWorktree */ true,
      );
      continue;
    }

    remove(
      withProgress({
        ...meta,
        reason: merged ? "merged into main and clean" : "represented in main and clean",
      }),
      /* forceBranch */ false,
      /* forceWorktree */ true,
    );
  }

  // Clear metadata for any directory that is now (or was already) gone.
  if (!report.dryRun) {
    pruneWorktrees(root);
    report.prunedMetadata = true;
  }
  return finish();
}

/** Number of registered git worktrees, including the main checkout. */
export function countWorktrees(root: string): number {
  return listWorktrees(root).length;
}

/**
 * Run the automatic safe sweep (close-out candidates plus resolved feature
 * worktrees proven redundant with main), then log its result and — when the
 * surviving worktree count exceeds `threshold` (0 disables) — a warning that
 * separates reclaimable candidates from protected and external worktrees.
 * Shared by the boot path and every close-out. Fully fail-soft: a git hiccup is
 * swallowed, never surfaced to the caller.
 */
export function sweepAndWarn(
  config: RepoOSConfig,
  opts: {
    activeJobIds?: Set<string>;
    threshold?: number;
    tasks?: Task[];
    log: (level: "info" | "warn", msg: string, meta?: Record<string, unknown>) => void;
  },
): void {
  try {
    const report = sweepStaleWorktrees(config, {
      mode: "full",
      activeJobIds: opts.activeJobIds,
      tasks: opts.tasks,
    });
    if (report.removedWorktrees.length || report.errors.length) {
      opts.log("info", "worktree gc", {
        removed: report.removedWorktrees.map((w) => w.branch || w.path),
        retained: report.summary.retained,
        external: report.summary.external,
        errors: report.errors,
      });
    }
    const threshold = opts.threshold ?? 20;
    if (threshold > 0) {
      const n = countWorktrees(config.root);
      if (n > threshold) {
        opts.log(
          "warn",
          `${n} git worktrees registered (advisory ceiling ${threshold}): ` +
            `${report.summary.candidates} safe candidate${report.summary.candidates === 1 ? "" : "s"} reclaimed, ` +
            `${report.summary.retained} retained, ${report.summary.external} outside RepoOS's managed directory — ` +
            "run `repoos gc --dry-run` for the reasons",
          {
            worktrees: n,
            threshold,
            candidates: report.summary.candidates,
            retained: report.summary.retained,
            external: report.summary.external,
          },
        );
      }
    }
  } catch (e) {
    opts.log("warn", `worktree gc failed: ${(e as Error).message}`);
  }
}
