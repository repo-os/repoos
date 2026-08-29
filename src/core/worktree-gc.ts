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
 * Scope boundary: this ONLY ever touches worktrees whose path is inside
 * `worktreesDir(root)` (the `<root>-worktrees/` sibling directory that
 * `ensureWorktree` always uses). The main checkout, this Claude Code session's
 * `<root>/.claude/worktrees/*`, and any other coding agent's or tool's worktrees
 * live outside that directory and are never RepoOS-managed — so no
 * agent-specific branch-name matching is used anywhere.
 */
import { existsSync, realpathSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import type { RepoOSConfig, Task } from "./types.js";
import { worktreesDir } from "./config.js";
import { buildIndex } from "./indexer.js";
import {
  isGitRepo,
  currentBranch,
  listWorktrees,
  removeWorktree,
  deleteBranch,
  pruneWorktrees,
  isAncestor,
} from "./git.js";

const CANDIDATE_BRANCH_PREFIX = "repoos/integrate/";

export type GcMode = "integrate-only" | "full";

export interface GcKept {
  branch: string;
  path: string;
  /** Why it was left in place. */
  reason: string;
}

export interface GcReport {
  mode: GcMode;
  dryRun: boolean;
  /** Worktrees removed (or that would be, when dryRun). `branch` is "" for detached. */
  removedWorktrees: Array<{ branch: string; path: string }>;
  /** Branches deleted (or that would be). */
  removedBranches: string[];
  /** Stale entries left in place with the reason. */
  keptDirty: GcKept[];
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
   * still queued/running/recovering for them. The boot sweep passes this.
   */
  activeJobIds?: Set<string>;
  /**
   * Every task on the board. Only needed for `mode: "full"`; omitted, it is read
   * from a fresh `buildIndex`. `mode: "integrate-only"` never looks at tasks.
   */
  tasks?: Task[];
}

/**
 * True when the worktree has no meaningful uncommitted work. `dist/` and
 * `screenshots/` are generated build output (routinely committed on a branch
 * and re-dirtied) — excluded here the same way `DIFF_SOURCE_PATHS` does for the
 * review diff. A missing directory counts as clean (nothing left to lose).
 */
function worktreeClean(path: string): boolean {
  if (!existsSync(path)) return true;
  const run = spawnSync(
    "git",
    ["status", "--porcelain", "--", ".", ":(exclude)dist", ":(exclude)screenshots"],
    { cwd: path, encoding: "utf8", timeout: 4000 },
  );
  if (run.status !== 0) return false; // can't tell -> be conservative
  return (run.stdout ?? "").trim() === "";
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
    keptDirty: [],
    prunedMetadata: false,
    errors: [],
  };
  if (!isGitRepo(root)) {
    report.errors.push("not a git repository");
    return report;
  }

  const wtDir = worktreesDir(root);
  const mainBranch = currentBranch(root) ?? "main";
  const activeJobIds = opts.activeJobIds ?? new Set<string>();

  // branch -> task, for the "is this worktree still live" check (full mode only).
  const taskByBranch = new Map<string, Task>();
  if (opts.mode === "full") {
    const tasks = opts.tasks ?? buildIndex(config).tasks;
    for (const t of tasks) {
      if (t.branch) taskByBranch.set(t.branch, t);
    }
  }

  const scoped = listWorktrees(root).filter(
    (w) => !w.isMain && !w.isBare && isInside(wtDir, w.path),
  );

  const remove = (branch: string, path: string, forceBranch: boolean): void => {
    if (report.dryRun) {
      report.removedWorktrees.push({ branch, path });
      if (branch) report.removedBranches.push(branch);
      return;
    }
    if (!removeWorktree(root, branch || path)) {
      report.errors.push(`could not remove worktree for ${branch || path}`);
      return;
    }
    report.removedWorktrees.push({ branch, path });
    if (branch && deleteBranch(root, branch, { force: forceBranch })) {
      report.removedBranches.push(branch);
    } else if (branch) {
      report.errors.push(`worktree gone but branch ${branch} not deleted`);
    }
  };

  for (const w of scoped) {
    const branch = w.branch ?? "";

    // --- repoos/integrate/<id> candidates: throwaway, both modes ---
    if (branch.startsWith(CANDIDATE_BRANCH_PREFIX)) {
      const taskId = branch.slice(CANDIDATE_BRANCH_PREFIX.length);
      if (activeJobIds.has(taskId)) {
        report.keptDirty.push({ branch, path: w.path, reason: "close-out job still active" });
        continue;
      }
      remove(branch, w.path, /* forceBranch */ true);
      continue;
    }

    if (opts.mode === "integrate-only") continue;

    // --- feature worktrees ---
    if (!branch) {
      // Detached HEAD with no branch ref: only safe to drop when its directory
      // is already gone (pure stale metadata).
      if (!existsSync(w.path)) {
        report.removedWorktrees.push({ branch: "", path: w.path });
      } else {
        report.keptDirty.push({
          branch: "",
          path: w.path,
          reason: "detached worktree, directory present",
        });
      }
      continue;
    }

    const task = taskByBranch.get(branch);
    if (task && task.status !== "done") continue; // live work — leave it

    const merged = isAncestor(root, branch, mainBranch) === true;
    const clean = worktreeClean(w.path);
    if (merged && clean) {
      remove(branch, w.path, /* forceBranch */ false);
    } else {
      report.keptDirty.push({
        branch,
        path: w.path,
        reason: !merged ? `commits not in ${mainBranch}` : "uncommitted changes",
      });
    }
  }

  // Clear metadata for any directory that is now (or was already) gone.
  if (!report.dryRun) {
    pruneWorktrees(root);
    report.prunedMetadata = true;
  }
  return report;
}

/** Number of registered git worktrees, including the main checkout. */
export function countWorktrees(root: string): number {
  return listWorktrees(root).length;
}

/**
 * Run the conservative `integrate-only` sweep, then log its result and — when
 * the surviving worktree count exceeds `threshold` (0 disables) — a
 * "run `repoos gc`" warning. Shared by the boot path and every close-out.
 * Fully fail-soft: a git hiccup is swallowed, never surfaced to the caller.
 */
export function sweepAndWarn(
  config: RepoOSConfig,
  opts: {
    activeJobIds?: Set<string>;
    threshold?: number;
    log: (level: "info" | "warn", msg: string, meta?: Record<string, unknown>) => void;
  },
): void {
  try {
    const report = sweepStaleWorktrees(config, {
      mode: "integrate-only",
      activeJobIds: opts.activeJobIds,
    });
    if (report.removedWorktrees.length || report.errors.length) {
      opts.log("info", "worktree gc", {
        removed: report.removedWorktrees.map((w) => w.branch || w.path),
        errors: report.errors,
      });
    }
    const threshold = opts.threshold ?? 20;
    if (threshold > 0) {
      const n = countWorktrees(config.root);
      if (n > threshold) {
        opts.log(
          "warn",
          `${n} git worktrees registered (advisory ceiling ${threshold}) — run \`repoos gc\` to reclaim leftovers from done/abandoned tasks`,
          { worktrees: n, threshold },
        );
      }
    }
  } catch (e) {
    opts.log("warn", `worktree gc failed: ${(e as Error).message}`);
  }
}
