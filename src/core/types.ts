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
export type UiTheme = "classic" | "clear" | "gen z" | "jelly";

/** Which flow the New task drawer opens with. */
export type TaskMode = "freeform" | "manual";

/**
 * Machine-readable reasons `needsInput` gets set, one per escalation call
 * site. Stored alongside the flag so a later automated success (e.g. a
 * review that finally completes cleanly) can tell whether IT is what the
 * human was waited on for, and clear the flag itself rather than leaving it
 * stuck forever once the underlying problem resolves. A boolean alone can't
 * make that call safely — clearing on every success would just as happily
 * wipe out an unrelated flag (e.g. a CTO policy question) that happened to
 * still be pending.
 */
export const NEEDS_INPUT_REASONS = [
  "review-failed",
  "dev-error",
  "watchdog-stuck",
  "cto-escalation",
] as const;
export type NeedsInputReason = (typeof NEEDS_INPUT_REASONS)[number];

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
  /** Machine-readable reason `needs_input` was set (e.g. "review-failed"), for auto-clearing and UI display. Only meaningful while needs_input is true. */
  needs_input_reason?: string;
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
  /** True when this task runs as a hotfix in the main checkout. */
  hotfix?: boolean;
  /** Hotfix merge target: "branch" or "main". */
  hotfix_target?: "branch" | "main";
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
  /** Machine-readable reason `needsInput` was set — see {@link NeedsInputReason}. Only meaningful while needsInput is true. */
  needsInputReason?: string;
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
  /** Per-task reviewer agent name override, or null when using the default. */
  reviewAgentOverride?: string | null;
  /** Per-task reviewer CLI override, or null when using the agent's default. */
  reviewCliOverride?: string | null;
  /** Per-task reviewer model override, or null when using the agent's default. */
  reviewModelOverride?: string | null;

  /** True when this task runs as a hotfix in the main checkout. */
  hotfix?: boolean;
  /** Hotfix merge target: "branch" (default) or "main". */
  hotfixTarget?: "branch" | "main";

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
  (
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
    | { s: "out" | "err" | "sys"; d: string }
  ) & {
    /**
     * ISO timestamp of when the entry was created (0258). Populated by the
     * server on every entry it creates; absent on persisted legacy transcripts.
     */
    at?: string;
  };

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

/** Authentication configuration. Opt-in, disabled by default. */
export interface AuthConfig {
  /** Whether authentication is enabled. Default false. */
  enabled?: boolean;
  /** Server-side session secret. Never exposed to browser. */
  sessionSecret?: string;
  /** Session lifetime in seconds. Default 604800 (7 days). */
  sessionMaxAge?: number;
  /** Email OTP provider config. */
  emailProvider?: {
    type: "resend";
    apiKey: string;
    fromAddress: string;
  };
  /** Google OAuth config (optional). */
  google?: {
    clientId: string;
    clientSecret: string;
  };
  /** Bootstrap admin email (set on first enable, cleared after bootstrap). */
  bootstrapAdmin?: string;
  /**
   * Static OTP override for local development: `verifyOtp` accepts this code
   * for any allowlisted user instead of requiring the real emailed OTP.
   * Sourced only from `REPOOS_AUTH_DEV_BACKDOOR_CODE` (never from a git-tracked
   * repoos.toml) and only ever honored when `NODE_ENV !== "production"` — see
   * `src/server/routes/auth.ts` `verifyOtp`.
   */
  devBackdoorCode?: string;
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
   * Maximum number of agent CLI processes (each with its own build/test
   * footprint) the runner will spawn at once, across all tasks and chats.
   * Extra `start`/`send` calls queue and spawn as running agents finish.
   * Unset means "auto" — computed from the host's CPU count at boot so the
   * same repo behaves on a small machine and a big one without tuning.
   */
  maxConcurrentAgents?: number;
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
  /** Authentication configuration. */
  auth?: AuthConfig;
  /** Remote validation runner — runs the close-out build+test off this machine. */
  remoteValidation?: RemoteValidationConfig;
}

/**
 * Remote Validation Runner (#RVR). The close-out gate's expensive half —
 * `bun run build` + `bun run test` — runs on a disposable cloud VM instead of
 * the developer's machine, which is where MTD keeps failing under memory
 * pressure. The cheap static guards (CSS/theme/require/lockfile/UI-smoke) still
 * run locally. Master switch defaults off: enabling it sends repo contents to a
 * third-party host (see docs/remote-validation.md).
 */
export interface RemoteValidationConfig {
  /** Master switch. Default false. */
  enabled?: boolean;
  /** Cloud provider. Only "hetzner" is implemented for the MVP. */
  provider?: "hetzner";
  /**
   * Hetzner server type. Default "cax31" (8 vCPU Ampere ARM / 16 GB) — the
   * cheapest type that fills the vitest 8-worker pool; this repo has no native
   * deps so arm64 is safe. Use "cpx41" for an x86 (AMD) snapshot instead.
   * MUST match the architecture the snapshot was built on.
   */
  serverType?: string;
  /** Hetzner location slug. Default "hil". */
  location?: string;
  /**
   * ID (or name) of the prebuilt Hetzner snapshot the runner boots from — an
   * image with Docker installed and the `repoos-ci` container image preloaded.
   * Built once via scripts/remote-runner/build-snapshot.md.
   */
  snapshotId?: string;
  /** Name of the SSH key registered in the Hetzner project, injected into the server. */
  sshKeyName?: string;
  /**
   * Keep a warm server alive this long after a job finishes so queued jobs
   * reuse it instead of paying cold-boot each time. Default 8.
   */
  idleShutdownMinutes?: number;
  /**
   * Hard cost stop-loss: force-delete any runner older than this, even
   * mid-job (the job then fails retryably). Default 120.
   */
  maxServerLifetimeMinutes?: number;
  /**
   * When the remote runner is unreachable / provisioning fails, fall back to
   * running the full gate locally instead of failing the close-out. Default
   * false — a transient infra failure keeps the task in `review` for retry
   * rather than dropping back onto the contended local machine.
   */
  fallbackToLocal?: boolean;
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
  /** Coding agent CLI to use for this built-in agent (e.g., "opencode", "gpt"). */
  cli?: string;
  /** Model to use for this built-in agent. */
  model?: string;
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
 * without the full body, extra, agent overrides, or activity (saved ~4-5 KB per
 * task at current task counts). Includes a body preview for search and
 * releasedAt for the release timeline.
 */
export interface BoardTask {
  id: string;
  title: string;
  type: string;
  status: Status;
  needsInput: boolean;
  needsInputReason?: string;
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
  /** ISO timestamp of the successful review-to-done merge, derived from Activity. */
  releasedAt: string | null;
  /** Truncated body preview for search (first 500 chars). */
  bodyPreview: string;
  path: string;
  absPath: string;
  git: TaskGitInfo;
  /** Always null in the board response — set on the client from SSE events. */
  preview: null;
  /** Automatic check-failure retries used on this task's most recent handoff
   *  (see handoff.ts's scheduleCheckFailureRetry, capped at 2). Lets the board
   *  distinguish "engineer patching a post-handoff check failure" from
   *  ordinary coding once a review-status task shows a running agent. */
  checkRetryCount: number;
  /** Automatic merge-conflict retries used on this task's most recent
   *  close-out attempt (see handoff.ts's scheduleMergeConflictRetry, capped
   *  at 2, #0271 follow-up). Same purpose as checkRetryCount, one step
   *  earlier in the pipeline. */
  mergeConflictRetryCount: number;
  /** Automatic retries after the task-watchdog detected a dead session that
   *  exited without a clean handoff (see handoff.ts's
   *  scheduleHandoffSignalRetry, capped at 2, #0271 follow-up). The task
   *  stays `active` throughout, unlike the other two which stay `review` —
   *  lets the board distinguish this from ordinary active-status coding. */
  handoffSignalRetryCount: number;
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
