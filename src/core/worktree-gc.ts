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
import { existsSync, lstatSync, realpathSync, readdirSync, readFileSync } from "node:fs";
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
  /** Uncommitted (non-ignored) paths, repo-relative, when measured. */
  dirtyPaths?: string[];
  /**
   * Ignored paths that are not regenerable build output. These can hold local
   * secrets (`.env`) or task attachments (`work/.attachments/`), so their
   * presence always keeps the worktree; reported so an operator can inspect.
   */
  ignoredPaths?: string[];
  /**
   * Non-task paths the branch changed relative to main (the branch's whole
   * contribution to the merge base). Structured so the retention audit does
   * not depend on a five-path reason string.
   */
  changedSourcePaths?: string[];
}

/** Registered worktrees outside RepoOS's managed directory. Never inspected. */
export interface GcExternal {
  branch: string;
  path: string;
  reason: string;
}

/** Compact audit detail for a retained entry, shared by `gc` and `status`. */
export function formatGcEntryDetails(entry: GcEntry): string | null {
  const bits: string[] = [];
  if (entry.commitsAhead !== undefined) bits.push(`${entry.commitsAhead} commit(s) ahead`);
  const list = (label: string, paths: string[] | undefined): void => {
    if (!paths?.length) return;
    const shown = paths.slice(0, 8);
    const more = paths.length > shown.length ? ` +${paths.length - shown.length} more` : "";
    bits.push(`${label}: ${shown.join(", ")}${more}`);
  };
  list("source", entry.changedSourcePaths);
  list("dirty", entry.dirtyPaths);
  list("ignored", entry.ignoredPaths);
  return bits.length > 0 ? bits.join(" · ") : null;
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
 * Generated output that is safe to discard along with a worktree. Everything
 * else that git ignores is treated as possible local data (secrets, task
 * attachments, scratch notes) — `git status` does NOT report ignored files, so
 * a worktree containing only ignored data looks clean to a plain status check
 * and must never be force-removed on that basis.
 *
 * Path shape alone is NOT proof for an arbitrary directory name: a repo can
 * legitimately track `src/tool/dist/`, keep local state under a nested
 * `.repoos/`, or keep source in a directory called `coverage`. Only known
 * generated locations are listed here; everything else ignored keeps the
 * worktree.
 */
function isDisposableIgnoredPath(path: string, cacheDir: string): boolean {
  const p = path.replace(/\/+$/, "");
  if (p === ".DS_Store" || p.endsWith("/.DS_Store")) return true;

  // Dependency installs are generated output wherever a package is installed;
  // `node_modules` is never tracked source.
  if (p.split("/").includes("node_modules")) return true;

  // Root package build output, plus the docs site's nested VitePress build. A
  // `dist` deeper in the tree (e.g. `src/tool/dist/`) is not proven generated.
  if (p === "dist" || p.startsWith("dist/")) return true;
  if (p === "user-docs/.vitepress/dist" || p.startsWith("user-docs/.vitepress/dist/")) {
    return true;
  }

  // Docs site build cache and the temporary Vite config bundle.
  if (p === "user-docs/.vitepress/cache" || p.startsWith("user-docs/.vitepress/cache/")) {
    return true;
  }
  if (/^user-docs\/\.vitepress\/[^/]*\.timestamp-[^/]*\.mjs$/.test(p)) return true;

  // Root test-coverage report.
  if (p === "coverage" || p.startsWith("coverage/")) return true;

  // RepoOS's own derived index cache at the configured root cache directory. A
  // nested `.repoos/` may belong to another layout and is not proven redundant
  // with this checkout.
  const cache = cacheDir.replace(/\/+$/, "");
  if (cache && (p === cache || p.startsWith(`${cache}/`))) return true;

  return false;
}

/** Only a confirmed absence is safe; every other `lstat`/`realpath` error is
 * an inspection failure and must keep the worktree. */
function isConfirmedMissing(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * True only when an ignored path is provably redundant with data that survives
 * the worktree: it already vanished, or it is a symlink whose target lives in
 * the canonical main checkout (or a dangling link that reaches nothing).
 *
 * Any error other than a confirmed absence means we could not inspect the path.
 * That is not proof its bytes are disposable, so retain the worktree.
 */
function ignoredPathIsProvablyRedundant(
  dir: string,
  relPath: string,
  canonicalRoot: string,
): boolean {
  const absolute = join(dir, relPath);
  let entry;
  try {
    entry = lstatSync(absolute);
  } catch (e) {
    return isConfirmedMissing(e);
  }
  if (!entry.isSymbolicLink()) return false;
  try {
    return isInside(canonicalRoot, realpathSync(absolute));
  } catch (e) {
    // A dangling symlink (ENOENT) carries no data. ELOOP/EACCES/EIO mean we
    // could not resolve where it points, so fail closed.
    return isConfirmedMissing(e);
  }
}

interface WorktreeState {
  /** Uncommitted non-ignored paths (repo-relative). */
  dirtyPaths: string[];
  /** Ignored paths that may hold local data (NOT build output or canonical symlinks). */
  ignoredPaths: string[];
}

/**
 * Changes and unpreserved local data in a worktree. `dist/` and other generated
 * output is discarded with the worktree and never counts as work data; ignored
 * data that cannot be proven disposable does. A missing directory has no paths.
 * `null` means git could not tell us, which is treated as "not safe to clean".
 */
function worktreeState(
  path: string,
  canonicalRoot: string,
  cacheDir: string,
): WorktreeState | null {
  if (!existsSync(path)) return { dirtyPaths: [], ignoredPaths: [] };
  const run = gitRun(path, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--ignored=matching",
  ]);
  if (run.status !== 0) return null;
  const parts = run.stdout.split("\0");
  const dirtyPaths: string[] = [];
  const ignoredPaths: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const raw = entry.slice(3);
    // Rename/copy records carry the original path as the next NUL field.
    let original: string | undefined;
    if (status.includes("R") || status.includes("C")) {
      original = parts[i + 1];
      if (original) i += 1;
    }
    if (status === "!!") {
      const normalized = raw.replace(/\/+$/, "");
      if (
        !isDisposableIgnoredPath(normalized, cacheDir) &&
        !ignoredPathIsProvablyRedundant(path, normalized, canonicalRoot)
      ) {
        ignoredPaths.push(normalized);
      }
      continue;
    }
    // Every non-ignored path is real working-tree data, including paths named
    // like build output. A tracked `dist/` modification is still an
    // uncommitted change, not proof it can be discarded.
    for (const candidate of [raw, original]) {
      if (candidate) dirtyPaths.push(candidate);
    }
  }
  return { dirtyPaths, ignoredPaths };
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
  /** Set when git could not answer; the worktree is retained, not assumed safe. */
  inspectionError?: string;
}

/** Actionable retention reason for a branch that is not proven redundant. */
function notRepresentedReason(proof: Representation, mainBranch: string): string {
  if (proof.inspectionError) {
    return `could not inspect branch content: ${proof.inspectionError}`;
  }
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
  if (diff.status !== 0) {
    return {
      represented: false,
      differing: [],
      uniqueTaskFiles: [],
      inspectionError: `git diff failed for ${base}..${branch}`,
    };
  }
  const changed = diff.stdout.split("\0").filter(Boolean);
  if (changed.length === 0) {
    return { represented: true, differing: [], uniqueTaskFiles: [] };
  }
  // Task files are canonical-wins only when the branch's bytes are exactly
  // main's. A changed task file whose content differs — or that main does not
  // have — may hold unique data, so it keeps the worktree. A confirmed branch
  // deletion (no branch-side bytes) carries nothing to preserve; a failure to
  // read the bytes is NOT a deletion and keeps the worktree.
  const uniqueTaskFiles: string[] = [];
  for (const path of changed) {
    if (!isTaskFilePath(path, workDir)) continue;
    const branchFile = gitBlobAt(root, branch, path);
    if (branchFile.state === "unreadable") {
      return {
        represented: false,
        differing: [],
        uniqueTaskFiles: [],
        inspectionError: `could not read ${path} on ${branch}`,
      };
    }
    if (branchFile.state === "absent") continue;
    const mainFile = gitBlobAt(root, mainBranch, path);
    if (mainFile.state === "unreadable") {
      return {
        represented: false,
        differing: [],
        uniqueTaskFiles: [],
        inspectionError: `could not read ${path} on ${mainBranch}`,
      };
    }
    if (mainFile.state === "absent" || Buffer.compare(branchFile.bytes, mainFile.bytes) !== 0) {
      uniqueTaskFiles.push(path);
    }
  }
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
    if (compare.status !== 0) {
      return {
        represented: false,
        differing: [],
        uniqueTaskFiles: [],
        inspectionError: `git diff failed for ${mainBranch}..${branch}`,
      };
    }
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
    return {
      represented: false,
      differing: [],
      uniqueTaskFiles: [],
      inspectionError: `could not find a merge base for ${branch} and ${mainBranch}`,
    };
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
    const canonical = gitBlobAt(root, mainBranch, path);
    // Absent from main or unreadable both mean the working-tree bytes are not
    // proven redundant; keep the worktree rather than discard them.
    if (canonical.state !== "present" || Buffer.compare(current, canonical.bytes) !== 0) {
      unsafe.push(path);
    }
  }
  return { safe: unsafe.length === 0, unsafe };
}

type GitBlob = { state: "present"; bytes: Buffer } | { state: "absent" } | { state: "unreadable" };

/**
 * Read `<rev>:<path>`, distinguishing a confirmed absence from an inspection
 * failure. `git show` exits non-zero for both, so use `ls-tree` (exit 0 with
 * empty output for a missing path, non-zero only when the revision cannot be
 * read) to establish absence, then `cat-file` for the bytes. A failure to read
 * the blob is `unreadable`, never "deleted": cleanup must retain data it could
 * not inspect.
 */
function gitBlobAt(root: string, rev: string, path: string): GitBlob {
  const listed = gitRun(root, ["ls-tree", "-z", rev, "--", path], { timeout: 8000 });
  if (listed.status !== 0) return { state: "unreadable" };
  if (!listed.stdout.includes("\0")) return { state: "absent" };
  const shown = spawnSync("git", ["cat-file", "blob", `${rev}:${path}`], {
    cwd: root,
    timeout: 8000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (shown.error || shown.status !== 0) return { state: "unreadable" };
  return {
    state: "present",
    bytes: Buffer.isBuffer(shown.stdout) ? shown.stdout : Buffer.from(shown.stdout ?? ""),
  };
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
 * The non-task paths a branch changed relative to its merge base with main.
 * Structured audit data for retained worktrees; the reason string only shows a
 * handful, and the report must not lose the rest. `undefined` when git cannot
 * answer — callers omit the field rather than claim "no paths".
 */
function branchChangedSourcePaths(
  root: string,
  mainBranch: string,
  branch: string,
  workDir: string,
): string[] | undefined {
  const base = gitRun(root, ["merge-base", mainBranch, branch], { timeout: 4000 });
  if (base.status !== 0 || !base.stdout.trim()) return undefined;
  const diff = gitRun(
    root,
    ["diff", "--name-only", "-z", "--no-renames", base.stdout.trim(), branch],
    { timeout: 15000 },
  );
  if (diff.status !== 0) return undefined;
  return diff.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => !isTaskFilePath(path, workDir));
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
  // clean, or one whose only dirt is redundant task-file bytes. `forceBranch`
  // is true for a content-proven branch that is not an ancestor of main (a
  // squash/rebase landing), where `git branch -d` would refuse: the content
  // proof is what makes `-D` safe. Merged branches still use the non-forced
  // delete. Everything else keeps the non-forced default of `removeWorktree`,
  // which refuses a dirty worktree rather than deleting it (#0512) — the same
  // invariant the close-out path holds.
  const remove = (entry: GcEntry, forceBranch: boolean, forceWorktree: boolean): void => {
    if (report.dryRun) {
      candidate(entry);
      if (entry.branch) {
        // Match what the real run will do: a merged branch deletes with `-d`,
        // a content-proven non-ancestor branch needs the force-delete below.
        if (forceBranch || mergedIntoMain.has(entry.branch)) {
          report.removedBranches.push(entry.branch);
        } else {
          report.errors.push(
            `would remove worktree but keep branch ${entry.branch} (not merged into ${mainBranch})`,
          );
        }
      }
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
    const merged = branch ? mergedIntoMain.has(branch) : false;
    const state = worktreeState(w.path, root, config.cacheDir || ".repoos");
    const commitsAhead = branch
      ? merged
        ? 0
        : commitCountAhead(root, mainBranch, branch)
      : undefined;

    // Retaining is an AUDIT, not just a decision. Record the branch's commits
    // ahead, structured changed source paths, dirty paths, and ignored local
    // data even when the deciding reason (active agent, human owner) needs none
    // of them — otherwise `status` and `gc --dry-run` cannot answer "what is in
    // this retained worktree?" without a second investigation.
    const audit = (): Partial<GcEntry> => {
      const fields: Partial<GcEntry> = {};
      if (commitsAhead !== undefined) fields.commitsAhead = commitsAhead;
      if (state) {
        fields.dirtyPaths = state.dirtyPaths;
        fields.ignoredPaths = state.ignoredPaths;
      }
      if (branch) {
        const changed = branchChangedSourcePaths(root, mainBranch, branch, workDir);
        if (changed) fields.changedSourcePaths = changed;
      }
      return fields;
    };
    const keep = (reason: string): void => {
      retain({ ...meta, ...audit(), reason });
    };

    // --- repoos/integrate/<id> candidates: throwaway, both modes ---
    if (branch.startsWith(CANDIDATE_BRANCH_PREFIX)) {
      const taskId = branch.slice(CANDIDATE_BRANCH_PREFIX.length);
      if (activeJobIds.has(taskId)) {
        keep("close-out job still active");
        continue;
      }
      const candidateTask = taskById.get(taskId);
      if (candidateTask?.status === "active" || candidateTask?.status === "review") {
        keep("task agent still active");
        continue;
      }
      // Even a throwaway candidate is force-removed only when it holds nothing
      // unpreserved: ignored files are invisible to `git status`, so a build
      // directory is fine but a stray `.env` or attachment tree is not.
      if (!state) {
        keep("could not read worktree status (kept conservatively)");
        continue;
      }
      if (state.ignoredPaths.length > 0) {
        keep(`ignored files may hold local data: ${state.ignoredPaths.slice(0, 5).join(", ")}`);
        continue;
      }
      remove(
        { ...meta, ...audit(), reason: "throwaway close-out candidate" },
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
          {
            branch: "",
            path: w.path,
            ...audit(),
            reason: "stale metadata for a vanished directory",
          },
          false,
          true,
        );
      } else {
        keep("detached worktree, directory present");
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
        keep("no task record for branch — lifecycle state unknown");
        continue;
      }
      const proof = merged
        ? { represented: true, differing: [] as string[], uniqueTaskFiles: [] as string[] }
        : branchRepresentedInMain(root, mainBranch, branch, workDir, null);
      if (!proof.represented) {
        keep(notRepresentedReason(proof, mainBranch));
        continue;
      }
      remove(
        { ...meta, ...audit(), reason: "stale metadata for a vanished directory" },
        /* forceBranch */ !merged,
        /* forceWorktree */ true,
      );
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
      keep(reason);
      continue;
    }
    if (task.assignee === "human") {
      // Done human-owned work is still human-owned; a done close-out is the
      // only RepoOS workflow that resolves it, and even then we do not delete a
      // worktree the human may still be inspecting.
      keep("human-assigned task");
      continue;
    }

    // At this point the task is resolved (done, or archived+AI) and AI-owned.
    // `merged` is the cheap ancestry proof; `representation` is the stronger
    // content proof for squash/rebase/WIP-checkpoint branches.
    if (!state) {
      keep("could not read worktree status (kept conservatively)");
      continue;
    }
    const dirtyPaths = state.dirtyPaths;

    let represented = merged;
    let differing: string[] = [];
    let uniqueTaskFiles: string[] = [];
    let inspectionError: string | undefined;
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
      inspectionError = proof.inspectionError;
    }

    if (!represented) {
      keep(
        notRepresentedReason(
          { represented, differing, uniqueTaskFiles, inspectionError },
          mainBranch,
        ),
      );
      continue;
    }

    // Ignored files are not visible to `git status` default output: a worktree
    // whose only unpreserved content is an ignored `.env` or attachment tree
    // must look dirty, not clean, or a forced removal would delete local data
    // that is not in main (and, for attachments, not anywhere else).
    if (state.ignoredPaths.length > 0) {
      keep(`ignored files may hold local data: ${state.ignoredPaths.slice(0, 5).join(", ")}`);
      continue;
    }

    if (dirtyPaths.length > 0) {
      const taskDirt = dirtyTaskFilesAreRedundant(root, w.path, mainBranch, workDir, dirtyPaths);
      if (!taskDirt.safe) {
        const allTaskFiles = dirtyPaths.every((path) => isTaskFilePath(path, workDir));
        keep(
          allTaskFiles
            ? `uncommitted task-file changes with unique data: ${taskDirt.unsafe.slice(0, 5).join(", ")}`
            : `uncommitted changes: ${taskDirt.unsafe.slice(0, 5).join(", ")}`,
        );
        continue;
      }
      remove(
        {
          ...meta,
          ...audit(),
          reason: merged
            ? "merged into main; dirty task-file changes match main"
            : "represented in main; dirty task-file changes match main",
        },
        /* forceBranch */ !merged,
        /* forceWorktree */ true,
      );
      continue;
    }

    remove(
      {
        ...meta,
        ...audit(),
        reason: merged ? "merged into main and clean" : "represented in main and clean",
      },
      /* forceBranch */ !merged,
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
