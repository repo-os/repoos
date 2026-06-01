/**
 * RepoOS core types.
 *
 * The repo is the source of truth. A "task" is a markdown file with YAML
 * frontmatter living under the configured work directory (default: `work/`).
 * Task *status* is a frontmatter field — files never move between folders.
 */

/** Canonical lifecycle states. Order matters: it defines board column order. */
export const STATUSES = [
  "inbox",
  "ready",
  "active",
  "review",
  "done",
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_TYPES = [
  "feature",
  "bug",
  "chore",
  "spec",
  "refactor",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** Who a task is assigned to. `ai` is a first-class assignee. */
export type Assignee = "ai" | "human" | "unassigned";

/**
 * The frontmatter we recognise. Unknown keys are preserved in `extra` so we
 * never destroy fields a user (or another tool) added.
 */
export interface TaskFrontmatter {
  id?: string;
  title?: string;
  type?: TaskType | string;
  status?: Status | string;
  priority?: Priority | string;
  area?: string;
  assigned_to?: string;
  created_by?: string;
  branch?: string;
  created?: string; // ISO date
  updated?: string; // ISO date
  tags?: string[];
  [key: string]: unknown;
}

/** A fully-resolved task as the rest of the system sees it. */
export interface Task {
  /** Stable id, e.g. "0012". Derived from frontmatter or filename. */
  id: string;
  title: string;
  type: string;
  status: Status;
  priority: Priority | string;
  area: string;
  assignee: Assignee;
  /** Raw assigned_to value, e.g. "ai", "nick", "product". */
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created: string | null;
  updated: string | null;

  /** Path relative to repo root, e.g. "work/0012-company-dashboard.md". */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** The markdown body (everything after frontmatter). */
  body: string;
  /** Frontmatter keys we did not explicitly model. Preserved on write. */
  extra: Record<string, unknown>;

  /** Live git facts, populated by the git layer (best-effort). */
  git: TaskGitInfo;
}

export interface TaskGitInfo {
  /** Does the branch named in frontmatter exist locally? */
  branchExists: boolean;
  /** Last commit subject touching this file, if discoverable. */
  lastCommit: string | null;
  /** ISO timestamp of last commit touching this file. */
  lastCommitAt: string | null;
}

/** Resolved configuration (after defaults + repoos.toml merge). */
export interface RepoOSConfig {
  /** Absolute path to the repo root. */
  root: string;
  /** Directory holding task files, relative to root. Default "work". */
  workDir: string;
  /** Directory holding context docs, relative to root. Default "docs". */
  docsDir: string;
  /** Glob-ish: file extensions treated as tasks. Default [".md"]. */
  taskExtensions: string[];
  /** Default status applied to new tasks. */
  defaultStatus: Status;
  /** Default assignee for new tasks. */
  defaultAssignee: Assignee;
  /** Where the derived index cache is written (relative to root). */
  cacheDir: string;
}

/** The derived index. Disposable — rebuilt from files at any time. */
export interface RepoIndex {
  version: number;
  generatedAt: string;
  root: string;
  taskCount: number;
  /** Sorted by (status order, priority, id). */
  tasks: Task[];
  /** Quick counts per status, for dashboards. */
  counts: Record<Status, number>;
}
