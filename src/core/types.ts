/**
 * RepoOS core types.
 *
 * The repo is the source of truth. A "task" is a markdown file with YAML
 * frontmatter living under the configured work directory (default: `work/`).
 * Task *status* is a frontmatter field — files never move between folders.
 */

/** Canonical lifecycle states. Order matters: it defines board column order. */
export const STATUSES = [
  "draft",
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

/** Theme preference for the web UI. */
export type Theme = "dark" | "light" | "system";

/** Visual design language of the web UI. */
export type UiTheme = "classic" | "clear" | "gen z";

/** Which flow the New task drawer opens with. */
export type TaskMode = "freeform" | "manual";

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
  /** True when the agent is waiting on the human and the task stays `active`. */
  needs_input?: boolean;
  area?: string;
  assigned_to?: string;
  created_by?: string;
  branch?: string;
  created_at?: string; // ISO-8601 UTC timestamp
  updated_at?: string; // ISO-8601 UTC timestamp
  /** @deprecated use created_at */
  created?: string;
  /** @deprecated use updated_at */
  updated?: string;
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
  /** True when the agent is waiting on the human. Layered on `active`, never a status. */
  needsInput: boolean;
  priority: Priority | string;
  area: string;
  assignee: Assignee;
  /** Raw assigned_to value, e.g. "ai", "nick", "product". */
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;

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
  /** Does a linked worktree currently have the task's branch checked out? */
  worktreeExists: boolean;
  /** Last commit subject touching this file, if discoverable. */
  lastCommit: string | null;
  /** ISO timestamp of last commit touching this file. */
  lastCommitAt: string | null;
}

/** An AI coding agent configurable on the Agents page. */
export interface Agent {
  /** Agent name — the role key (engineer, reviewer, pm, or a custom name). */
  name: string;
  /** The coding agent CLI used to run this agent. */
  cli: string;
  /** Model name, or "default" to use the coding agent's default. */
  model: string;
  /** When false, the agent is configured but inactive. */
  enabled: boolean;
  /** Optional instructions describing the agent's role and how it should behave. */
  instructions?: string;
}

/**
 * One entry of an agent session transcript.
 *
 * Legacy entries carry `s`/`d` — plain lines from claude (`-p`), qwen/codex
 * stream-json, and sessions recorded before structured output. Entries derived
 * from opencode's `--format json` event stream carry a `type` discriminator
 * (`text`/`tool`/`step`/`sys`) so the UI can render them as cards instead of
 * a flat wall of text.
 */
export type AgentOutputEntry =
  /** A complete assistant text part (opencode `text` event). */
  | { type: "text"; text: string }
  /** A finished tool call (opencode `tool_use` event). */
  | {
      type: "tool";
      tool: string;
      /** Rendered input (bash -> its command, objects -> pretty JSON). */
      input?: string;
      /** Rendered output, or the error message when the call failed. */
      output?: string;
      /** Tool state: "completed" | "error" (absent when unknown). */
      state?: string;
    }
  /** A step boundary (opencode `step_start` / `step_finish`). */
  | { type: "step"; kind: "start" | "finish"; reason?: string }
  /** A system/notice line (open code `error` / `file-update`, or "stopped"). */
  | { type: "sys"; d: string }
  /** A legacy plain line, kept for claude / qwen / codex and old sessions. */
  | { s: "out" | "err" | "sys"; d: string };

/** A skill discovered from the skills dir (skills/<name>/SKILL.md). */
export interface SkillMeta {
  /** Repo-relative path to the skill file, e.g. "skills/code-review/SKILL.md". */
  path: string;
  /** Skill name from frontmatter (or the folder name). */
  name: string;
  /** One-line description from frontmatter. */
  description: string;
}

/** Resolved configuration (after defaults + repoos.toml merge). */
export interface RepoOSConfig {
  /** Absolute path to the repo root. */
  root: string;
  /** Directory holding task files, relative to root. Default "work". */
  workDir: string;
  /** Directory holding context docs, relative to root. Default "docs". */
  docsDir: string;
  /** Directory holding skills, relative to root. Default "skills". */
  skillsDir: string;
  /** Glob-ish: file extensions treated as tasks. Default [".md"]. */
  taskExtensions: string[];
  /** Default status applied to new tasks. */
  defaultStatus: Status;
  /** Default assignee for new tasks. */
  defaultAssignee: Assignee;
  /** Where the derived index cache is written (relative to root). */
  cacheDir: string;
  /** When true, stale builds cause repoos to exit with an error instead of warning. */
  strictBuild?: boolean;
  /** UI theme preference: dark, light, or system (follow OS). Cosmetic only. */
  theme?: Theme;
  /** UI design language: classic (current) or clear. Cosmetic only. */
  uiTheme?: UiTheme;
  /** New-task drawer mode: freeform (PM agent) or manual form. Default "freeform". */
  defaultTaskMode?: TaskMode;
  /** User-defined agents (defaults are applied at runtime when this is empty). */
  agents?: Agent[];
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
