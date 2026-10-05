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
/** Every UI theme. `repoos doctor` validates `uiTheme` against this list. */
export const UI_THEMES = ["classic", "clear", "gen z", "jelly", "gruvbox", "catppuccin"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

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
  "review-rounds-exhausted",
  "dev-error",
  "check-failed-after-retries",
  "watchdog-stuck",
  "cto-escalation",
  "underspecified",
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
  /** Specific questions blocking implementation until the human answers them. */
  questions?: string[];
  /** Machine-readable reason `needs_input` was set (e.g. "review-failed"), for auto-clearing and UI display. Only meaningful while needs_input is true. */
  needs_input_reason?: string;
  /**
   * One-line AI tl;dr for the current failure — root cause + next action,
   * produced by the task's Debugger agent (#0570). Only meaningful while
   * needs_input is true; the writer drops it the moment the flag clears so a
   * stale sentence can never outlive the failure it describes.
   */
  debug_tldr?: string;
  /** When {@link debug_tldr} was generated (ISO-8601 UTC). */
  debug_tldr_at?: string;
  /**
   * Fingerprint of the failure this tl;dr describes — `(reason, detail)` —
   * used to dedupe regeneration. Internal; not rendered.
   */
  debug_tldr_key?: string;
  /** True when the task branch has drifted from main and needs a manual merge. */
  needs_merge?: boolean;
  /** True when a legitimate no-op task opts out of the vacuous-handoff rejection. */
  no_source_change?: boolean;
  /**
   * True when the task is shelved. Orthogonal to `status`: an archived task
   * keeps its status, branch and worktree and is merely hidden from the work
   * queue and every automatic scanner (#0657).
   */
  is_archived?: boolean;
  /** Optional free-text reason the task was archived. Only meaningful while `is_archived` is true. */
  archive_detail?: string;
  /**
   * One area, a comma-separated string ("web, core"), or a list. Legacy
   * "a + b" values read through the shared `parseTaskAreas` helper too (#0583).
   */
  area?: string | string[];
  /**
   * Optional cross-area delivery slice this task belongs to (a "story"). Free
   * text, whitespace-normalized; grouping is case-insensitive. There is no
   * story file or status — a story is derived entirely from its tagged tasks.
   */
  story?: string;
  /** Other task ids that must be merged before this task can start. */
  depends_on?: string[];
  /** Exact task-branch commit recorded at successful close-out for ancestry checks. */
  merged_commit?: string;
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
  /** Specific human-decisions blocking implementation until answered. */
  questions?: string[];
  /** Machine-readable reason `needsInput` was set — see {@link NeedsInputReason}. Only meaningful while needsInput is true. */
  needsInputReason?: string;
  /**
   * Free-text detail for why `needsInput` was set — e.g. the actual CLI
   * failure line for `dev-error`. Set alongside `needsInputReason` at the
   * call sites that have a concrete string on hand; absent otherwise. The
   * drawer's "waiting for you" banner shows this instead of only the generic
   * per-reason label when present (#0405 follow-up: a human staring at
   * "The agent exited with an error." with no detail and no next step had
   * to go dig through the log to even see the error text).
   */
  needsInputDetail?: string;
  /**
   * One-line AI tl;dr for the current failure — root cause + next action,
   * produced by the task's Debugger agent and shown as a callout above the
   * task drawer's tabs (#0570). Best-effort: absent when the Debugger is
   * disabled, unconfigured, or its run failed. Cleared with the failure it
   * describes (see {@link TaskFrontmatter.debug_tldr}).
   */
  debugTldr?: string;
  /** When {@link debugTldr} was generated (ISO-8601 UTC). */
  debugTldrAt?: string;
  /** Fingerprint of the failure this tl;dr describes; internal dedupe key. */
  debugTldrKey?: string;
  /** True when the task branch has drifted from main. Layered on `review`, never a status. */
  needsMerge: boolean;
  /** True when a no-op task opts out of the vacuous-handoff rejection. */
  noSourceChange: boolean;
  /**
   * True when the task is shelved (#0657). Orthogonal to `status`: the status,
   * branch and worktree are all preserved, and unarchiving restores it to the
   * same column. Archived tasks are excluded from dispatch, the watchdog, the
   * CTO digest, board counts and ready pickup. Optional on the type so partial
   * constructions (tests, older serialized payloads) never lie; `parseTask`
   * always produces a boolean.
   */
  isArchived?: boolean;
  /** Optional free-text reason the task was archived; absent when none was given. */
  archiveDetail?: string;
  priority: Priority | string;
  area: string;
  /**
   * The task's areas as a list (#0583) — the canonical parsed form always
   * produced by `parseTask`/`createTask`/`patchTaskFile`. Optional on the
   * type so partial constructions (tests, older serialized payloads) never
   * lie about the field; readers fall back to the shared parser over `area`.
   * `area` remains the comma-joined display string ("a, b"); matchers read
   * THIS list through `parseTaskAreas`, never a whole-string compare.
   */
  areas?: string[];
  /** Optional cross-area delivery slice; empty string means untagged. */
  story?: string;
  /** Task ids that must be merged before this task can start. */
  dependsOn?: string[];
  /** Exact branch commit recorded at close-out so merge proof survives cleanup. */
  mergedCommit?: string | null;
  /** Live, Git-verified unmet prerequisites; absent from task frontmatter. */
  blockedBy?: DependencyBlocker[];
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

/** A prerequisite that currently prevents a task from starting. */
export interface DependencyBlocker {
  id: string;
  /**
   * `waiting` — upstream not done yet; `archived` — upstream was shelved, so
   * it can never satisfy the dependency until it is unarchived; `cancelled` —
   * missing/removed upstream or an unprovable completed upstream needs a human.
   */
  state: "waiting" | "archived" | "cancelled";
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
  /** Names of repository skills this role is allowed to load for its work. */
  skills?: string[];
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
export type AgentOutputEntry = (
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
  /** Session lifetime in seconds. Default 2592000 (30 days). */
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

/**
 * API keys for model providers with a spend/usage API (0327, #0625). Like
 * the [auth] secrets these are env-only — sourced from the gitignored `.env`
 * (via REPOOS_OPENROUTER_API_KEY / REPOOS_OPENCODE_GO_API_KEY /
 * REPOOS_DEEPINFRA_API_KEY) or the process
 * environment, never from a git-tracked repoos.toml key. The Agents page's
 * "Model providers" tab writes them through `setDotEnvSecret`.
 */
export interface ModelProviderKeysConfig {
  openrouterApiKey?: string;
  opencodeGoApiKey?: string;
  deepinfraApiKey?: string;
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
  /** Directory holding human-submitted inputs, relative to root. */
  inputsDir?: string;
  /** Directory holding story definitions, relative to root. Default "stories". */
  storiesDir?: string;
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
  /** UI design language: classic, clear, gen z, jelly, gruvbox, or catppuccin. Cosmetic only. */
  uiTheme?: UiTheme;
  /** New-task drawer mode: freeform (PM agent) or manual form. Default "freeform". */
  defaultTaskMode?: TaskMode;
  /** User-defined agents (defaults are applied at runtime when this is empty). */
  agents?: Agent[];
  /** When true, RepoOS automatically selects and starts ready tasks up to maxActiveTasks. */
  autoEngineeringMode?: boolean;
  /**
   * When true (the default), the CTO monitor skips its model call while the
   * board is healthy — no stuck tasks, a fresh build and a normal process
   * check. Set false to run a full CTO pass whenever the material signal
   * changes, healthy or not.
   */
  ctoSkipHealthy?: boolean;
  /**
   * When true (off by default), a task's session is analysed only after it
   * reaches `done`, and a `New Skill Suggestion: …` task is created only for a
   * high-bar reusable procedure corroborated by at least two independent
   * completed sessions. The first candidate is persisted internally and creates
   * no task; a single session never creates one. A named stable external
   * tool/API workflow is recorded as extra evidence but does not lift the
   * two-session rule. Nothing is saved as an actual skill until a human works
   * that suggestion task.
   */
  skillSuggestions?: boolean;
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
  /** Telegram bot integration (feature switch; credentials live elsewhere). */
  telegram?: TelegramConfig;
  /** Authentication configuration. */
  auth?: AuthConfig;
  /** Model-provider API keys (0327) — env-only, never a repoos.toml key. */
  modelProviders?: ModelProviderKeysConfig;
  /** Remote validation runner — runs the close-out build+test off this machine. */
  remoteValidation?: RemoteValidationConfig;
  /** Optional product-release integration. Omitted means the Releases UI is hidden. */
  release?: ReleaseConfig;
  /**
   * Optional Stories page (cross-area delivery tracking). Absent, malformed, or
   * `enabled = false` keeps every story surface — nav item, route entry point
   * and task-edit control — entirely dormant, with no change to existing boards.
   */
  stories?: StoriesConfig;
  /**
   * Declared area vocabulary (#0583) — `[areas]` in `repoos.toml`, an array of
   * tables each with a `name` (required) and an optional human `description`.
   * Merged with every `[[preview.targets]].areas` value into the effective
   * vocabulary the task drawer's multi-select, the CLI and the PM prompt
   * offer. Absent/empty means free-text only: no vocabulary is imposed and
   * every other behavior is unchanged.
   */
  areas?: AreaConfig[];
  /**
   * Close-out (Move to done) pipeline settings (#0573) — a wall-clock budget
   * so a hung or pathologically slow close-out always terminates with a
   * retryable `failed` job instead of sitting on the check step forever.
   * Defaults to `{ timeoutMs: 360000 }` (6 minutes); `timeoutMs: 0` disables.
   */
  closeOut?: CloseOutConfig;
  /**
   * Opt-in auto-approval after a clean review (#0686). Off unless
   * `approval.enabled = true`. UI-facing areas stay human unless handoff
   * screenshots succeeded.
   */
  approval?: ApprovalConfig;
  /**
   * Distribution destinations shown as the Releases page's "Published to"
   * summary (a `[[distribution]]` array of tables). Omitted/empty keeps the
   * existing Releases experience with no extra section. See [DistributionConfig].
   */
  distribution?: DistributionConfig[];
  /**
   * Per-project opt-in config for `repoos check` steps (tasks #0348, #0351).
   * Omitted means every pluggable step (`ui-smoke`, CSS layering, theme
   * contrast) skips unless the project declares it here or through a
   * well-known `package.json` script.
   */
  check?: CheckConfig;
  /**
   * Per-project config for task previews (task #0362). A repo declares a
   * command and/or named targets here; those run, selected by the task's
   * `area`. Omitting the section is not an implicit default (#0370): a task
   * with no resolvable target gets a clean, actionable "no preview configured"
   * result rather than booting RepoOS's own board.
   */
  preview?: PreviewConfig;
  /**
   * Preview-only config overrides that were applied (task #0464), as sorted
   * dotted base key paths (e.g. `["auth.enabled"]`). Set only when config was
   * resolved with the preview overlay turned on — the preview/UI-test preview
   * runtime does this; every normal command resolves the base config and leaves
   * this undefined. Runtime information, not a `repoos.toml` field of its own.
   */
  previewOverrides?: string[];
  /**
   * Per-project task-worktree behavior (#0373). Omitted means defaults — in
   * particular, no `.env` is placed in any worktree.
   */
  worktrees?: WorktreesConfig;
  /**
   * Deployment targets (task #0340) — one row per (service, branch). Absent or
   * empty means the Deployments nav item and API stay hidden for this repo.
   */
  deployments?: DeploymentConfig[];
  /**
   * Advisory ceiling on registered git worktrees (including the main checkout).
   * Above it, the Control page's Codebase card turns amber and the server logs
   * a "run `repoos gc`" warning — never enforced, never blocks a task start.
   * Default 20. Set 0 to disable the warning.
   */
  worktreeWarnThreshold?: number;
  /**
   * Port `repoos serve` binds by default (overridable with `--port`). Unset
   * means "derive a stable per-repo port from the repo root path" so two
   * checkouts on one machine don't both grab 7171. Pin it here for a repo
   * whose port other tooling hardcodes (e.g. this dogfood repo → 7171).
   */
  servePort?: number;
  /**
   * Dev/local tooling (#0509). Ignored on release builds (no dev UI bundle /
   * RepoOS sources in the repo).
   */
  dev?: DevConfig;
  /**
   * Display-only column label overrides for the six board columns (task
   * #0396). Keys are canonical status IDs (`draft`, `inbox`, `ready`, `active`,
   * `review`, `done`); values are display labels shown in the UI and CLI.
   * Partial overrides merge over defaults — only specified keys change.
   * Invalid entries (blank, non-string, >40 chars, duplicates) fall back to
   * the default for that column. Never affects status IDs, transition rules,
   * frontmatter, or API/CLI status inputs.
   */
  boardColumns?: Record<string, string>;
}

/**
 * A single configured deployment target: one (service, branch) pair shipped to
 * a provider (task #0340). Unlike [release] — a single versioned artifact — a
 * repo can have N services × M environments, each a row on the Deployments
 * page. Entirely declarative: no live provider API in v1, `provider` is a
 * plain label and every URL is user-supplied. Omitted entirely in most repos,
 * which keeps the Deployments nav item and API dormant.
 */
export interface DeploymentConfig {
  /** Human label, e.g. "Landing page (prod)". */
  name: string;
  /**
   * Groups this row with others of the same service across branches (e.g.
   * "Landing page" for both its prod and dev rows), so the Deployments page
   * can render one row per service with a column per branch. Defaults to
   * `name` when absent, so a config with no `service` keys keeps today's
   * ungrouped, one-row-per-config-entry behavior exactly.
   */
  service?: string;
  /** Branch whose pushes deploy this target (e.g. prod / main). */
  branch: string;
  /** Provider label, e.g. "cloudflare-workers". Informational only. */
  provider?: string;
  /** The live URL for this target — rendered as the row's primary link. */
  url?: string;
  /** Optional provider-dashboard URL (account-specific, pasted in by hand). */
  dashboardUrl?: string;
  /**
   * Repo subdirectory this service lives in, scoping the per-row freshness
   * lookup to `git log -1 <branch> -- <subdir>` so an unrelated push to the
   * branch doesn't read as a deploy of this service. Omit for a branch-wide
   * signal.
   */
  subdir?: string;
}

/**
 * Configuration for the Stories page, from `repoos.toml`'s `[stories]`
 * section. A story is optional task metadata (`story:` frontmatter) grouped
 * into named delivery slices — it is not a second task system: no worktree,
 * agent, branch, independent status or hierarchy. On by default; set
 * `enabled = false` to hide the page, nav item and task Story field.
 */
export interface StoriesConfig {
  /** Whether the Stories page and its navigation item are shown. Default true. */
  enabled?: boolean;
  /**
   * How many bytes of a story's definition the engineer/reviewer "Story
   * context" prompt block includes before it points the agent at the story
   * file to read the rest (#0691). Default a few KB; clamped to a sane range
   * so an accidental huge or zero value can't blow up a prompt.
   */
  excerptBytes?: number;
}

/**
 * One declared area (#0583), from a `[[areas]]` row in `repoos.toml`. The
 * effective vocabulary is these plus every `[[preview.targets]].areas` value;
 * free text is always allowed beyond it. `name` is required and is matched
 * case-insensitively against task frontmatter.
 */
export interface AreaConfig {
  /** The area name as tasks should write it, e.g. "web". Required. */
  name: string;
  /** Optional one-liner explaining what belongs to this area (picker tooltip, PM prompt). */
  description?: string;
}

/** Dev-only UI copy inspector (#0509). */
export interface DevInspectorConfig {
  enabled?: boolean;
  editorCommand?: string;
}

export interface DevConfig {
  inspector?: DevInspectorConfig;
}

/**
 * A deliberately small first release provider. `git-tag` is portable: the
 * repository's own CI/provider decides what a pushed tag means. Additional
 * providers can implement the same status + confirmed-action contract later.
 */
export interface ReleaseConfig {
  enabled?: boolean;
  provider?: "git-tag";
  name?: string;
  /** Branch a release must be cut from. Defaults to main. */
  branch?: string;
  /** Project manifest containing the committed semantic version. */
  versionFile?: string;
  /** Prefix prepended to the version for the git tag. Defaults to v. */
  tagPrefix?: string;
  /** Git remote to receive the annotated tag. Defaults to origin. */
  remote?: string;
  /** Optional GitHub owner/repo, used only to link to the resulting release. */
  repository?: string;
  /** Optional workflow path, shown as release context (not executed by RepoOS). */
  workflow?: string;
}

/**
 * How a distribution channel's published version is looked up, so the Releases
 * page's "Published to" summary can say whether a channel is current. Each kind
 * knows a public, credential-free lookup:
 *
 * - `npm` — the public npm registry (`registry.npmjs.org`) for `package`.
 * - `homebrew` — the raw formula source at `versionUrl` (a tap formula is not
 *   in the core formulae API), parsed for its declared `version`.
 * - `github-release` — GitHub's public releases API for `repository` (or an
 *   explicit `versionUrl`), reported as the latest tag.
 * - `custom` — any `versionUrl` + `versionRegex` the project supplies.
 *
 * Omitted means no automatic version check: the channel still renders with its
 * install commands, but its status stays "unverified" rather than claiming a
 * version it cannot confirm.
 */
export type DistributionKind = "npm" | "homebrew" | "github-release" | "custom";

/**
 * One place users can install a project's releases from, declared per project
 * under `[[distribution]]` in `repoos.toml` and rendered as the **Published to**
 * section on the Releases page. These are distribution destinations, not
 * deployment environments ([DeploymentConfig]) — a release is one versioned
 * artifact, and a distribution channel is a registry (or installer) that
 * artifact is published to.
 *
 * Entirely declarative and project-owned: RepoOS hard-codes no package names,
 * URLs, or commands, so a repo that publishes to none of npm/Homebrew/GitHub
 * simply omits the section and keeps the existing Releases experience. The one
 * network RepoOS does itself is the optional, timeout-bounded, credential-free
 * version lookup described by `kind` — for the UI only, never a prerequisite
 * for viewing releases.
 */
export interface DistributionConfig {
  /** Human channel name, e.g. "npm" or "GitHub Releases". Required. */
  name: string;
  /**
   * Selects the public version lookup for this channel. Omitted (or an
   * unrecognized value) means no automatic check — the channel still renders
   * its install commands, with an honest "unverified" status.
   */
  kind?: DistributionKind;
  /**
   * Source link for the channel (registry page, tap/formula, release page).
   * May contain `{tag}` or `{version}`, resolved against the release being
   * viewed; an unresolved placeholder drops the link rather than producing a
   * dead URL.
   */
  url?: string;
  /**
   * The package/formula identifier shown to users and used as the lookup key
   * for `kind = "npm"` (e.g. "@scope/name"). Informational for other kinds.
   */
  package?: string;
  /** `owner/repo` for `kind = "github-release"`; builds the releases API URL. */
  repository?: string;
  /**
   * Explicit URL to fetch the published version from, overriding the URL a
   * `kind` would derive. Required for `homebrew` and `custom`.
   */
  versionUrl?: string;
  /** Regex with one capture group used to read the version; `custom` needs it. */
  versionRegex?: string;
  /** Install commands, each independently copyable. */
  install?: string[];
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
  /**
   * Which provider runs the validation. "hetzner" (default) provisions a
   * disposable cloud VM per job. "tailscale" SSHes into a persistent machine
   * on your tailnet and runs the gate inside a fresh Docker/Podman container.
   */
  provider?: "hetzner" | "tailscale";

  // ── Hetzner-specific ──────────────────────────────────────────────────────

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

  // ── Tailscale-specific ────────────────────────────────────────────────────

  /**
   * Tailscale hostname or IP of the persistent runner machine
   * (e.g. "mybox.tail1234.ts.net" or "100.x.x.x").
   * Required when provider is "tailscale" unless `tailscaleHosts` is set —
   * the single-host shorthand for the #0521 host pool.
   */
  tailscaleHost?: string;
  /**
   * The tailnet host pool (#0521): every machine jobs may be dispatched to.
   * `loadConfig` normalises all three authoring forms into host objects —
   * the flat string list (`tailscaleHosts = ["bee", "mac1"]`), the rich rows
   * (`[[remoteValidation.tailscaleHosts]]` with per-host `user`/`os`/`labels`/
   * `maxConcurrent`), and the `tailscaleHost` shorthand above (folded in as
   * the first host). Each entry's attrs are resolved at parse time; runtime
   * defaults (user → `tailscaleUser` → "root", limit → `maxConcurrent` → 1)
   * are applied by the runner.
   */
  tailscaleHosts?: RemoteValidationHost[];
  /**
   * SSH user on the tailscale runner. Default "root". Applies to hosts that
   * don't set their own `user`.
   */
  tailscaleUser?: string;
  /**
   * Docker/Podman image to run the gate in. Defaults to "repoos-ci",
   * the same image the Hetzner snapshot preloads.
   */
  containerImage?: string;

  // ── Shared ────────────────────────────────────────────────────────────────

  /**
   * When the remote runner is unreachable / provisioning fails, fall back to
   * running the full gate locally instead of failing the close-out. Default
   * false — a transient infra failure keeps the task in `review` for retry
   * rather than dropping back onto the contended local machine.
   */
  fallbackToLocal?: boolean;
  /**
   * Max remote runs in flight at once. Default 1: runs queue (FIFO) instead of
   * sharing one machine, because two full suites at once produce load-induced
   * timeouts that read as a red gate. Applies to every caller in the server
   * process (handoff, close-out, release); a standalone `repoos check` is its
   * own process and is not counted.
   */
  maxConcurrent?: number;
  /**
   * Opt a human-watched release cut into the remote runner. Default false.
   * Close-out uses the runner whenever `enabled` is true (it runs unattended,
   * so VM boot/provision latency is invisible); a release is something the
   * operator watches in the Releases modal, where a ~1-2 min remote-provision
   * delay can read as a regression even though it is more reliable, so it is
   * an explicit opt-in rather than inheriting the close-out flag.
   */
  useForReleases?: boolean;
  /**
   * When a transient failure occurs on one host, retry the run on another
   * healthy, free host that hasn't been tried yet for this run. Only after
   * every eligible host has failed does the existing fallback/retryable
   * behaviour apply. Default true when 2+ hosts are configured.
   */
  retryOtherHosts?: boolean;
}

/**
 * One machine in the tailnet validation pool (#0521). Produced by `loadConfig`
 * from `tailscaleHosts` (flat strings or `[[remoteValidation.tailscaleHosts]]`
 * rows) plus the `tailscaleHost` shorthand; runtime defaults (SSH user, per-
 * host limit) are applied by the runner, not here.
 */
export interface RemoteValidationHost {
  /** Tailscale hostname or 100.x.x.x IP. Unique within the pool. */
  host: string;
  /** SSH user for this host. Falls back to `tailscaleUser`, then "root". */
  user?: string;
  /**
   * Host OS capability ("linux" or "macos") — what this host provides and what
   * a job can require via `[[check.steps]] runsOn`. Automatically counts as one
   * of the host's capabilities.
   */
  os?: string;
  /** Extra capability labels a job can require (`runsOn`). */
  labels?: string[];
  /** Per-host in-flight cap. Falls back to `maxConcurrent`, then 1. */
  maxConcurrent?: number;
  /**
   * How `validate.sh` actually runs on this host — Docker (the maintained,
   * default path, `just setup-<host>`) or "native" (macOS only today: bun +
   * git directly on the host, no Docker, `validate-macos.sh` /
   * `just setup-<host>-native`). This is a host implementation detail, not a
   * job requirement: a job requests capabilities via `os`/`labels`
   * (`runsOn`), never `runner` — either runner variant satisfies the same
   * `os` capability, since the result (a green build+test) is identical.
   * Absent means "docker". Kept separate from `os` on purpose (#0521
   * review): folding this into `os` (e.g. a "macos-native" pseudo-OS) would
   * make `runsOn: ["macos"]` fail to match a real macOS host depending on
   * its runner, which is exactly the capability-matching bug this avoids.
   */
  runner?: "docker" | "native";
}

/**
 * Per-project `repoos check` step configuration (#0348), from `repoos.toml`'s
 * `[check]` section. `check` is the generic definition-of-done gate every
 * managed project runs, but some of its steps are only meaningful when the
 * project opts into them — `ui-smoke` used to boot RepoOS's own dashboard for
 * every repo, which is wrong for a project with no board UI. Each step is
 * opt-in: absent means the step skips cleanly, exactly like the existing
 * `fmt:check`/`lint`/`tests` steps do when the relevant script is absent.
 */
export interface CheckConfig {
  /**
   * Check-plan schema version (#0446). `1` is the current and only version.
   * A repo that declares `[[check.steps]]` should pin it: a future schema
   * change can then migrate or warn instead of silently reinterpreting an
   * old plan. Absent means "whatever the repo declares still parses", which
   * is the pre-#0446 behaviour.
   */
  version?: number;
  /**
   * Profile `repoos check` selects when `--profile` is not passed (#0446).
   * Defaults to `default`.
   */
  defaultProfile?: string;
  /**
   * The project's declarative check plan (#0446) — one row per gate step, run
   * in declaration order. Presence of at least one usable row replaces every
   * implicit/legacy step: `repoos check` then runs exactly what is declared,
   * for any stack (Go, Gradle/Android, Rust, JS, mixed).
   */
  steps?: CheckStepConfig[];
  /**
   * How many times `repoos check` re-runs each failing test file in isolation
   * after a failure, purely as an informational flake-triage label (#0655).
   * `0` disables the re-runs. Never turns a failed run green — a pass in
   * isolation does not prove the failure was load-induced.
   */
  isolationRuns?: number;
  /**
   * Shell command `repoos check` runs for its UI smoke step. When set it
   * overrides a `smoke` script in the project's `package.json` (config wins).
   * Absent and no `smoke` script means the step skips.
   */
  uiSmoke?: string;
  /**
   * Repo-relative path to the stylesheet the CSS-layering and theme-contrast
   * guards read (#0351). Both guards carry no RepoOS-shaped default path, so
   * absent means both skip cleanly.
   */
  uiStylesheet?: string;
  /**
   * Theme blocks inside `uiStylesheet`, each mapped to a variant name and the
   * earlier scopes it inherits declarations from — the token vocabulary that
   * used to be hardcoded for RepoOS (#0351). Absent means the theme-contrast
   * guard skips even when `uiStylesheet` is set.
   */
  themeScopes?: CheckThemeScope[];
  /** Foreground/background token pairs checked for ≥3:1 WCAG contrast (#0351). */
  contrastPairs?: CheckContrastPair[];
  /**
   * Token to composite semi-transparent colors over before measuring their
   * luminance — normally the page background (RepoOS uses `--bg`). Optional:
   * without it the pair's own background token is used, falling back to white.
   * A missing backdrop never skips a pair, it only approximates an alpha
   * channel (#0351).
   */
  backdropToken?: string;
  /**
   * Tokens consumed as `background-image` (so they must resolve to a gradient,
   * not a solid color — a solid value renders a transparent button) (#0351).
   */
  gradientTokens?: string[];
  /**
   * Repo-relative source roots the bare-`require()` guard scans (#0352). The
   * guard is generic — a bare `require` in a `"type": "module"` package breaks
   * only in the compiled ESM output — but the directories to scan are not, so
   * they are declared per-project here. Absent, the guard falls back to the
   * repo's `tsconfig` `include`/`files` list (minus its `exclude` list); if
   * neither yields a root it skips with a clear message.
   */
  bareRequireDirs?: string[];
  /**
   * Repo-relative paths or tsconfig-style globs the bare-`require()` guard
   * skips when scanning `bareRequireDirs` (#0352) — e.g. a generated subtree.
   * Only consulted alongside `bareRequireDirs`; when the roots come from the
   * tsconfig instead, the tsconfig's own `exclude` list is used.
   */
  bareRequireExcludes?: string[];
  /**
   * Source roots the `hardcoded-colors` guard scans (#0596) for hard-coded
   * color literals (`#hex`, `rgba(255,…)`) in component `<style>` blocks.
   * The guard is generic, but which trees are component style blocks is not —
   * a stylesheet's literals are theme tokens (checked by `theme-contrast`),
   * a component's are one-off overrides the rendered audit then verifies in
   * context. Absent means the guard skips with a clear message.
   */
  hardcodedColorDirs?: string[];
  /**
   * Selectors the rendered contrast audit (#0596) exempts, each with the
   * reason it is intentionally off-contrast (e.g. a dark code pane that is
   * dark in every theme). The audit's central allowlist — exemptions live
   * here with a reason, never as scattered ignores in component styles.
   */
  contrastExempts?: CheckContrastExempt[];
}

/**
 * Built-in step kinds a `[[check.steps]]` row can invoke instead of naming a
 * raw `command` (#0446). Each is stack-neutral: it inspects the repo and skips
 * with a stated reason when it does not apply, rather than assuming a
 * package.json/Bun pipeline.
 */
export type CheckStepKind =
  | "staleness"
  | "lockfile-sync"
  | "zero-runtime-deps"
  | "format"
  | "lint"
  | "build"
  | "tests"
  | "ui-smoke"
  | "css-layers"
  | "theme-contrast"
  | "hardcoded-colors"
  | "bare-require"
  | "task-assets";

/**
 * One declared step of a project's check plan (#0446) — a `[[check.steps]]`
 * row in `repoos.toml`. Either `kind` (a built-in, stack-aware guard) or
 * `command` (a raw shell command run in `cwd`) must be set; a row with
 * neither is dropped with a config warning rather than failing the whole gate
 * on a typo.
 */
export interface CheckStepConfig {
  /**
   * Stable step name, shown in `repoos check`'s results and used by
   * `dependsOn`. Must be unique within the plan and match
   * `[a-z][a-z0-9_.:-]*` (the close-out pipeline parses the printed results
   * block by name, so keep it lowercase and free of spaces).
   */
  name?: string;
  /** Built-in guard to run. Mutually exclusive with `command` (which wins). */
  kind?: string;
  /** Shell command to run. Takes precedence over `kind` when both are set. */
  command?: string;
  /** Repo-relative directory to run in. Defaults to the repo root. */
  cwd?: string;
  /**
   * Command that FIXES what this step checks, run by `repoos check --fix`
   * before the step and by handoff auto-format (#0651). A `kind = "format"`
   * step defaults to the package.json `fmt` script (the conventional
   * counterpart of `fmt:check`); a raw `command` step has no fix unless one is
   * declared here. Always safe to run twice.
   */
  fix?: string;
  /** Per-step timeout in milliseconds. Defaults to 600000 (10 min). */
  timeoutMs?: number;
  /**
   * When false the step is advisory: a failure is reported but does not fail
   * the gate. Defaults to true. Being optional is not the same as being
   * allowed to skip — a required step that cannot run must fail, not pass.
   */
  required?: boolean;
  /**
   * Profiles this step belongs to. Omitted or empty means every profile.
   * A step listed only in, say, `["full"]` is excluded from a bare
   * `repoos check` and runs under `--profile full`.
   */
  profiles?: string[];
  /**
   * Repo-relative path globs; in changed-path mode (`--changed <ref>`) the
   * step runs only when at least one changed path matches. Omitted means the
   * step always runs, changed mode or not.
   */
  whenChanged?: string[];
  /**
   * Binaries that must be on PATH for this step. A missing one fails an
   * optional step as a warning and a required step as an install-oriented
   * failure — never as a silent pass.
   */
  requires?: string[];
  /**
   * Host capabilities this step needs when the gate runs remotely (#0521),
   * e.g. `runsOn = ["macos"]`. The remote runner routes the whole job to a
   * host whose `os`/`labels` satisfy every capability; a job whose plan
   * declares no `runsOn` goes to any host. Local runs ignore it — a
   * capability with no matching remote host fails the remote gate clearly
   * rather than silently running in the wrong place.
   */
  runsOn?: string[];
  /**
   * Names of earlier steps this one depends on. If any of them failed, this
   * step is skipped as "blocked" (the gate is already failing on the real
   * cause). RepoOS declares `build`/`tests`/`ui-smoke` this way against
   * `check-fmt:check` and `check-lint`, so a formatting fix never has to pay
   * for a build against source that is about to be rewritten.
   */
  dependsOn?: string[];
}

/**
 * One theme block `repoos check`'s contrast guard evaluates (#0351): the
 * selector that opens it, a variant name for failure messages, and the earlier
 * scopes whose declarations it inherits (cascade order, later wins). RepoOS's
 * own `:root`/`[data-theme]`/`[data-ui-theme]` blocks are declared this way in
 * its `repoos.toml`; the guard itself knows none of those selector names.
 *
 * Two ways a declared scope still checks nothing, both silent rather than
 * failures — a theme author needs to know about both:
 *  1. An unregistered block. A `:root[data-ui-theme="…"]` block with no
 *     matching scope here is never evaluated. (RepoOS's own suite now asserts
 *     both directions of this match, in `check-stylesheet-config.test.ts`.)
 *  2. A block the scanner cannot read. `parseThemeBlocks` is line-oriented:
 *     the selector must open the block on one line ending in `{`, the block
 *     must be top-level (not nested in `@media`/`@layer`), one declaration per
 *     line, and no `/* … *\/` comment between declarations — a comment line
 *     corrupts the following key and silently drops that token from the check.
 */
export interface CheckThemeScope {
  /** CSS selector opening the block, e.g. `:root[data-ui-theme="clear"]`. */
  selector: string;
  /** Variant name used in failure messages, e.g. `clear-dark`. */
  name: string;
  /**
   * Names of earlier scopes whose declarations this scope inherits, in order
   * (later wins). Defaults to `[name]` — the block stands alone.
   */
  inherits?: string[];
}

/** A (foreground token, background token) pair checked for contrast (#0351). */
export interface CheckContrastPair {
  fg: string;
  bg: string;
}

/**
 * One rendered-contrast exemption (#0596): a CSS selector whose text is
 * deliberately allowed below the WCAG floor, plus why. Read by the rendered
 * audit (`scripts/ui-contrast-audit.mjs` → `cmdContrastAudit`), which also
 * honors `data-contrast-ok` on an element or an ancestor.
 */
export interface CheckContrastExempt {
  selector: string;
  reason: string;
}

/**
 * A named preview target (#0362): one previewable thing in a repo, selected by
 * matching the task's `area:` frontmatter (case-insensitive). A monorepo can
 * hold a landing page, a docs site, several web apps, etc.; each gets a target
 * whose `areas` list names the task areas it serves.
 */
export interface PreviewTargetConfig {
  /** Human label for diagnostics, e.g. "Landing page". */
  name: string;
  /** Task `area:` values this target serves, matched case-insensitively. */
  areas: string[];
  /**
   * Optional repo-relative glob list (#0582). A changed file matching any glob
   * makes this target a candidate for `repoos shot`, independent of the task's
   * `area` — which is often chosen before the changed files are known. `**`
   * spans path segments, `*` and `?` stay within one. Empty/absent means the
   * target is only reachable through area resolution or an explicit `--target`.
   */
  paths?: string[];
  /**
   * Shell command that boots the preview. `{port}` and `{host}` are replaced
   * with the OS-assigned values; `PORT`/`HOST` are also exported into the
   * child's environment. Runs with the worktree root as cwd unless `cwd` is set.
   */
  command: string;
  /** Optional subdirectory of the worktree to run the command in. */
  cwd?: string;
  /**
   * Optional path polled for readiness (relative to the preview URL). Defaults
   * to `/`.
   */
  readyPath?: string;
  /**
   * Optional override for how long the manager waits for this target to
   * answer before giving up (milliseconds). Defaults to a value sized for a
   * plain dev-server start; a command that also builds first (`bun run
   * build && ...`) needs this raised, or a cold/unbuilt worktree is killed
   * mid-build and reported as "did not become ready" (#0370).
   */
  readyTimeoutMs?: number;
}

/**
 * Per-project task-preview configuration (#0362), from `repoos.toml`'s
 * `[preview]` section plus any `[[preview.targets]]` tables. The whole point is
 * that "preview a task" is not hardcoded to RepoOS's own web UI: an adopting
 * repo declares how to boot its own previewable thing.
 *
 * Resolution order for a given task:
 *   1. a `[[preview.targets]]` whose `areas` include the task's `area` wins;
 *   2. else the top-level `command` (a default target for any area);
 *   3. else — nothing matches (or the section is absent entirely) — "no preview
 *      configured", returned cleanly with an actionable message rather than
 *      attempted (#0370).
 */
export interface PreviewConfig {
  /** Default preview command, used when no target matches the task's area. */
  command?: string;
  /**
   * Optional repo-relative glob list (#0594) declaring which files the DEFAULT
   * (main-app) target serves, i.e. the `[preview] command`. Without it that
   * target is only reachable through area resolution, so a diff touching the
   * main app declined to resolve whenever another target's globs matched
   * something too — a mixed app+docs diff was screenshotted as docs only.
   * Same syntax as `PreviewTargetConfig.paths`.
   */
  paths?: string[];
  /** Default subdirectory to run `command` in, relative to the worktree root. */
  cwd?: string;
  /** Default readiness path for `command` (default `/`). */
  readyPath?: string;
  /** Default readiness timeout for `command` — see PreviewTargetConfig.readyTimeoutMs. */
  readyTimeoutMs?: number;
  /** Named targets, selected by the task's `area:` frontmatter. */
  targets?: PreviewTargetConfig[];
}

/**
 * Per-project task-worktree behavior (#0373). Opt-in: omitted (the default)
 * keeps worktrees exactly as they were — no secrets placed in them.
 */
export interface WorktreesConfig {
  /**
   * When true, a task worktree is given access to the main checkout's
   * gitignored `.env` — symlinked in by `ensureWorktree` — so a worktree-local
   * build or preview command that needs local secrets (e.g. a repo with
   * `auth.enabled = true` and provider keys in `.env`) can actually boot.
   *
   * Default false: most projects need no `.env` in a worktree, and every
   * worktree is another place secrets would live on disk, so this is a
   * deliberate per-repo opt-in rather than a `node_modules`-style automatic.
   */
  inheritEnv?: boolean;
}

/** Whisper voice transcription configuration. */
export interface WhisperConfig {
  provider?: "groq" | "openai" | "none";
  apiKey?: string;
}

/**
 * Telegram bot integration configuration (#0531).
 *
 * Only non-secret settings live here. The bot token itself is delivered
 * server-side through the admin API and stored solely via the encrypted
 * secret store (`src/core/secret-store.ts`) — it never appears in
 * `repoos.toml`, in `.env`, or in any browser response. Connection state
 * (transport mode, webhook URL, profile) also lives outside config, in
 * `<root>/.repoos/telegram-bot.json`, so a change applies live without a
 * restart; see src/server/telegram/store.ts and docs/telegram-adapter.md.
 */
export interface TelegramConfig {
  /** Master switch for Telegram surfaces in this instance. Default false. */
  enabled?: boolean;
  /**
   * Base URL of the managed-provisioning service (#0559). TOML-only
   * (advanced/internal, documented deliberate exception — a dedicated UI
   * control would be misleading until the service is deployed): empty means
   * managed provisioning reports "not configured" and BYO keeps working.
   */
  provisioningUrl?: string;
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

/** Opt-in policy for Move to done without a human click (#0686). */
export interface ApprovalConfig {
  /** Master switch — default false when absent. */
  enabled?: boolean;
  autoApprove?: {
    /** Task `area` values eligible for auto-approval (any match). */
    areas?: string[];
    /** Task `type` values eligible (any match). */
    types?: string[];
    /**
     * Areas treated as UI — require successful handoff screenshots. Defaults to
     * web/ui/ui-app/frontend/mobile when unset.
     */
    uiAreas?: string[];
  };
}

/**
 * Close-out (Move to done) pipeline budget (#0573).
 */
export interface CloseOutConfig {
  /**
   * Total wall-clock budget for ONE close-out attempt, from when the job
   * leaves `queued` (sets `startedAt`) until it reaches `failed`, `done`, or
   * is removed by a user cancel. `0` disables the ceiling (today's unbounded
   * behaviour). Default `360000` (6 minutes).
   */
  timeoutMs: number;
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
 * without the full body, extra, or activity (saved ~4-5 KB per task at current
 * task counts). Includes a body preview for search, the compact agent/model
 * overrides rendered on cards, and releasedAt for the release timeline.
 */
export interface BoardTask {
  id: string;
  title: string;
  type: string;
  status: Status;
  needsInput: boolean;
  /** Specific human-decisions blocking implementation until answered. */
  questions?: string[];
  needsInputReason?: string;
  /** One-line AI tl;dr for the current failure — root cause + next action (#0570). */
  debugTldr?: string;
  /** When `debugTldr` was generated (ISO-8601 UTC). */
  debugTldrAt?: string;
  needsMerge: boolean;
  /** True when the task is shelved (#0657). Orthogonal to `status`. */
  isArchived: boolean;
  /** Optional free-text reason the task was archived; absent when none was given. */
  archiveDetail?: string;
  priority: Priority | string;
  area: string;
  /** The parsed area list (#0583) — one chip per entry in the UI. */
  areas?: string[];
  /** Optional cross-area delivery slice; empty string means untagged. */
  story?: string;
  /** Task ids that must be merged before this task can start. */
  dependsOn?: string[];
  /** Git-verified unmet prerequisites, computed for the board response. */
  blockedBy?: DependencyBlocker[];
  /** Exact task-branch commit recorded at close-out for ancestry checks. */
  mergedCommit?: string | null;
  assignee: Assignee;
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  /** Per-task Engineer agent name override, or null when using the default.
   *  Carried on the board payload so a card can show effective assignments
   *  without opening the drawer (#0455). */
  agentOverride: string | null;
  /** Per-task Engineer CLI override, or null when using the agent default. */
  cliOverride: string | null;
  /** Per-task Engineer model override, or null when using the agent default. */
  modelOverride: string | null;
  /** Per-task PM agent name override, or null when using the default (#0455). */
  pmAgentOverride: string | null;
  /** Per-task PM CLI override, or null when using the agent default. */
  pmCliOverride: string | null;
  /** Per-task PM model override, or null when using the agent default. */
  pmModelOverride: string | null;
  /** Per-task Reviewer agent name override, or null when using the default (#0455). */
  reviewAgentOverride: string | null;
  /** Per-task Reviewer CLI override, or null when using the agent default. */
  reviewCliOverride: string | null;
  /** Per-task Reviewer model override, or null when using the agent default. */
  reviewModelOverride: string | null;
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
  /** Registered story definition files (`stories/*.md`) when `[stories] enabled`. */
  storyDefinitions?: StoryDefinitionRecord[];
}

/** One git-tracked story definition surfaced on the board payload (#0486). */
export interface StoryDefinitionRecord {
  key: string;
  name: string;
  /**
   * Stable zero-padded 4-digit number, the story's counterpart to a task's
   * `id` (#0515). Absent/empty only for a story file not yet backfilled.
   */
  number?: string;
  path: string;
  body: string;
  createdAt: string;
  createdBy: string;
  /** True while the PM agent is fleshing this story out in the background. */
  pmWorking?: boolean;
}
