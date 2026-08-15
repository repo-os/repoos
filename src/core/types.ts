/**
 * RepoOS core types.
 *
 * The repo is the source of truth. A "task" is a markdown file with YAML
 * frontmatter living under the configured work directory (default: `work/`).
 * Task *status* is a frontmatter field — files never move between folders.
 */

/** Canonical lifecycle states. Order matters: it defines board column order. */
export const STATUSES = ["draft", "inbox", "ready", "active", "review", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_TYPES = ["feature", "bug", "chore", "spec", "refactor"] as const;
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
  /** True when the task branch has drifted from main and needs a manual merge. */
  needs_merge?: boolean;
  /** True when a legitimate no-op task opts out of the vacuous-handoff rejection. */
  no_source_change?: boolean;
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
  /** Per-task agent name override (e.g. "engineer", "pm", or a custom agent). */
  agent_override?: string;
  /** Per-task CLI override (e.g. "opencode", "claude code"). */
  cli_override?: string;
  /** Per-task model override (e.g. "default", "big pickle"). */
  model_override?: string;
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
  /** True when the task branch has drifted from main. Layered on `review`, never a status. */
  needsMerge: boolean;
  /** True when a no-op task opts out of the vacuous-handoff rejection. */
  noSourceChange: boolean;
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
  /** ISO timestamp of the successful review-to-done merge, derived from Activity. */
  releasedAt?: string | null;

  /** Path relative to repo root, e.g. "work/0012-company-dashboard.md". */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** The markdown body (everything after frontmatter). */
  body: string;
  /** Frontmatter keys we did not explicitly model. Preserved on write. */
  extra: Record<string, unknown>;
  /** Per-task agent name override, or null when using the default. */
  agentOverride: string | null;
  /** Per-task CLI override, or null when using the agent's default. */
  cliOverride: string | null;
  /** Per-task model override, or null when using the agent's default. */
  modelOverride: string | null;
  /** Per-task PM agent name override, or null when using the default. */
  pmAgentOverride?: string | null;
  /** Per-task PM CLI override, or null when using the agent's default. */
  pmCliOverride?: string | null;
  /** Per-task PM model override, or null when using the agent's default. */
  pmModelOverride?: string | null;

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
  /** Absolute path of the task's linked worktree, or null when none exists. */
  worktreePath: string | null;
  /**
   * Whether a clean restart would discard prior work: the linked worktree has
   * uncommitted changes, or the branch has commits not in the base branch.
   * Always false when no linked worktree exists.
   */
  dirty: boolean;
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
 * Legacy entries carry `s`/`d` — plain lines from older sessions or CLI
 * warnings that do not match a structured event. Entries derived
 * from opencode's `--format json` event stream carry a `type` discriminator
 * (`text`/`tool`/`step`/`sys`) so the UI can render them as cards instead of
 * a flat wall of text.
 */
export type AgentOutputEntry =
  /** A complete assistant text part (opencode `text` event). */
  | { type: "text"; text: string }
  /** A message sent by the human from the Agent tab follow-up input. */
  | { type: "human"; text: string }
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
  | { type: "step"; kind: "start" | "finish"; reason?: string; at?: string }
  /** A system/notice line (open code `error` / `file-update`, or "stopped"). */
  | { type: "sys"; d: string }
  /** A legacy plain line, kept for compatibility and unknown CLI warnings. */
  | { s: "out" | "err" | "sys"; d: string };

/**
 * Live run telemetry for one task's agent session (0080). Best-effort and
 * in-memory only — never persisted across a server restart. Numbers only ever
 * move forward: `null` means "the CLI hasn't reported this," never a
 * fabricated zero.
 */
export interface AgentSessionStats {
  /** Cumulative ms across completed turns — excludes any turn in flight. */
  accumulatedMs: number;
  /** ISO timestamp the current turn started, or null when no turn is running. */
  turnStartedAt: string | null;
  /** ISO timestamp of the most recent agent.output line, or null until first output. */
  lastOutputAt: string | null;
  /** Best-effort cumulative token count reported by the CLI, or null if never reported. */
  tokens: number | null;
  /** Best-effort cumulative cost (USD) reported by the CLI, or null if never reported. */
  costUsd: number | null;
  /** True once output has gone stale for the stall window while still running. */
  stalled: boolean;
}

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
  /** Whether Cloudflare Tunnel controls are surfaced in the web UI. */
  tunnelEnabled?: boolean;
  /** When true, RepoOS publishes task lifecycle events to a ntfy topic. */
  ntfyEnabled?: boolean;
  /** The ntfy topic RepoOS publishes task events to (empty = never send). */
  ntfyTopic?: string;
  /** Base URL of the ntfy server. Defaults to https://ntfy.sh. */
  ntfyBaseUrl?: string;
  /** UI theme preference: dark, light, or system (follow OS). Cosmetic only. */
  theme?: Theme;
  /** UI design language: classic (current) or clear. Cosmetic only. */
  uiTheme?: UiTheme;
  /** New-task drawer mode: freeform (PM agent) or manual form. Default "freeform". */
  defaultTaskMode?: TaskMode;
  /** User-defined agents (defaults are applied at runtime when this is empty). */
  agents?: Agent[];
  /** When true, RepoOS automatically selects and starts ready tasks up to maxActiveTasks. */
  autoEngineeringMode?: boolean;
  /** Maximum number of simultaneously active tasks when auto-engineering mode is enabled. */
  maxActiveTasks?: number;
  /**
   * Per-agent state for built-in agents (Tech Debt Agent, …), keyed by agent
   * id: whether it's enabled, its run schedule, and when it last ran. Stored
   * as a JSON sidecar under the cache dir — runtime state, not human-edited
   * configuration.
   */
  builtInAgents?: Record<string, BuiltInAgentConfig>;
  /** Agent supervisor configuration. */
  supervisor?: SupervisorConfig;
  /** Task watchdog configuration (#0180). */
  watchdog?: WatchdogConfig;
  /** Voice transcription configuration for vibe-coding feature. */
  whisper?: WhisperConfig;
}

/** Whisper voice transcription configuration. */
export interface WhisperConfig {
  provider?: "groq" | "openai" | "none";
  apiKey?: string;
}

/** How often a built-in agent runs: Daily, Weekly, or only when manually triggered. */
export type BuiltInAgentSchedule = "daily" | "weekly" | "manual";

/** Persisted state for one built-in agent. */
export interface BuiltInAgentConfig {
  enabled?: boolean;
  schedule?: BuiltInAgentSchedule;
  /** ISO timestamp of the last completed run, set by the server. */
  lastRunAt?: string;
}

/** Task watchdog configuration (#0180). */
export interface WatchdogConfig {
  /** Whether the watchdog runs. Default true. */
  enabled?: boolean;
  /**
   * Milliseconds of silence (no running agent, no task-file activity) before an
   * `active` task is candidate-stuck. Default 5 minutes.
   */
  stalenessMs?: number;
  /**
   * Whether a stuck task auto-transitions out of `active` — to `review` when
   * its worktree holds work, else back to `ready` — instead of only setting
   * `needsInput`. Default true.
   */
  autoTransition?: boolean;
}

/** Agent supervisor configuration. */
export interface SupervisorConfig {
  /** Whether supervision is enabled. Default false. */
  enabled?: boolean;
  /** Check interval in seconds. Default 300 (5 minutes). */
  interval?: number;
  /** Supervision mode: "observe" (diagnose only) or "recover" (can apply safe actions). Default "observe". */
  mode?: "observe" | "recover";
  /** Seconds of no output before task is considered quiet. Default 600 (10 minutes). */
  quietThreshold?: number;
  /** Cycles of quiet output before a confirmed stall. Default 3. */
  stallThreshold?: number;
  /** Max automatic restarts per task. Default 2. */
  maxRestarts?: number;
  /** Base cooldown between restart attempts in seconds. Default 60. */
  cooldownSeconds?: number;
  /** Agent name for diagnostic analysis. Optional; if omitted, deterministic classification only. */
  diagnosticAgent?: string;
  /** Ordered list of fallback agent/model combinations to try on repeated failures. */
  fallbacks?: Array<{ agent?: string; model?: string }>;
}

/** A classification of a task's health status. */
export type TaskHealthStatus =
  | "healthy"
  | "quiet-but-alive"
  | "progressing-without-output"
  | "waiting-for-human"
  | "blocked-on-merge"
  | "resource-constrained"
  | "exited-unexpectedly"
  | "confirmed-stalled"
  | "orphaned"
  | "inconsistent"
  | "unknown";

/** Supervisor heartbeat report for the Control page. */
export interface SupervisorHeartbeat {
  /** Unique cycle id. */
  id: string;
  /** When the cycle started (ISO-8601). */
  startedAt: string;
  /** When the cycle completed (ISO-8601). */
  completedAt?: string;
  /** When the next check will run (ISO-8601). */
  nextCheckAt: string;
  /** Current supervisor mode. */
  mode: "observe" | "recover";
  /** Total active tasks. */
  totalActive: number;
  /** Healthy tasks. */
  healthy: number;
  /** Tasks with warnings. */
  warnings: number;
  /** Per-task status entries. */
  tasks: Array<{
    id: string;
    title: string;
    status: TaskHealthStatus;
    lastOutput?: string;
    evidence?: string;
    action?: string;
  }>;
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

/**
 * Lightweight task view for the board — everything TaskCard.vue renders,
 * without the body, extra, agent overrides, or activity (saved ~4-5 KB per
 * task at current task counts).
 */
export interface BoardTask {
  id: string;
  title: string;
  type: string;
  status: Status;
  needsInput: boolean;
  needsMerge: boolean;
  priority: Priority | string;
  area: string;
  assignee: Assignee;
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  path: string;
  absPath: string;
  git: TaskGitInfo;
  /** Always null in the board response — set on the client from SSE events. */
  preview: null;
}

/** Board index — like RepoIndex but with BoardTask[] instead of Task[]. */
export interface BoardIndex {
  version: number;
  generatedAt: string;
  root: string;
  taskCount: number;
  tasks: BoardTask[];
  counts: Record<Status, number>;
}
