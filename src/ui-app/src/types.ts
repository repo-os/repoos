/** API-facing types for the RepoOS web UI. Mirrors src/core/types.ts. */

export type Status = "draft" | "inbox" | "ready" | "active" | "review" | "done";

/** A live read-only preview of a task's worktree (see POST /api/tasks/:id/preview). */
export interface PreviewInfo {
  port: number;
  url: string;
  startedAt: string;
}

/** Lightweight automatic-review state included with indexed tasks. */
export interface AutomaticReview {
  /** True only while the configured reviewer is actively inspecting this task. */
  running: boolean;
  /** Whether automatic review is configured at all. */
  enabled: boolean;
}

export interface Task {
  id: string;
  title: string;
  type: string;
  status: Status;
  /** True when the agent is waiting on the human. Layered on `active`. */
  needsInput: boolean;
  /** True when the task branch has drifted from main. Layered on `review`. */
  needsMerge: boolean;
  priority: string;
  area: string;
  assignee: "ai" | "human" | "unassigned";
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  /** Successful review-to-done merge timestamp, or null when not released. */
  releasedAt?: string | null;
  path: string;
  absPath: string;
  body: string;
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
  /** True when this task runs as a hotfix in the main checkout. */
  hotfix?: boolean;
  /** Hotfix merge target: "branch" or "main". */
  hotfixTarget?: "branch" | "main";
  git: {
    branchExists: boolean;
    worktreeExists: boolean;
    lastCommit: string | null;
    lastCommitAt: string | null;
    worktreePath: string | null;
    dirty: boolean;
  };
  /** Running preview of this task's worktree, or null when stopped. */
  preview: PreviewInfo | null;
  /** Server-authoritative automatic-review activity, refreshed with the index. */
  automaticReview?: AutomaticReview;
}

/** One persisted screenshot attached to a task (0123). */
export interface ScreenshotMeta {
  /** 1-based index within the task's attachment folder. */
  id: string;
  /** Original file name (sanitized). */
  name: string;
  /** Repo-relative path, e.g. "work/.attachments/0123/screenshot-1.png". */
  path: string;
  /** API URL the UI can load the image from. */
  url: string;
  size: number;
  mime: string;
}

export interface Health {
  ok: boolean;
  root: string;
  taskCount: number;
  workDir: string;
  /** App version (package.json), or null when unavailable. */
  version: string | null;
  /** ISO timestamp of the last build, or null when unavailable. */
  buildAt: string | null;
  /** Build hash the running server loaded, or null in dev mode. */
  buildHash: string | null;
  /** A newer build parked by a close-out (0143), or null when none is parked. */
  buildAvailableHash: string | null;
  /** On-disk build timestamp of the parked build, or null when none is parked. */
  buildAvailableAt: string | null;
  /** True when this server is a preview instance serving a specific task's worktree. */
  isPreviewBuild: boolean;
}

export interface Counts {
  draft: number;
  inbox: number;
  ready: number;
  active: number;
  review: number;
  done: number;
}

export interface RepoIndex {
  version: number;
  generatedAt: string;
  root: string;
  taskCount: number;
  tasks: Task[];
  counts: Counts;
}

/** Lightweight task view for board cards — no full body, extra, or agent overrides.
 * Includes a body preview for search and releasedAt for the release timeline. */
export interface BoardTask {
  id: string;
  title: string;
  type: string;
  status: Status;
  needsInput: boolean;
  needsMerge: boolean;
  priority: string;
  area: string;
  assignee: "ai" | "human" | "unassigned";
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
  git: {
    branchExists: boolean;
    worktreeExists: boolean;
    lastCommit: string | null;
    lastCommitAt: string | null;
    worktreePath: string | null;
    dirty: boolean;
  };
  /** Always null from server — populated from SSE events on the client. */
  preview: PreviewInfo | null;
  automaticReview?: AutomaticReview;
}

/** Board index response from GET /api/board. */
export interface BoardIndex {
  version: number;
  generatedAt: string;
  root: string;
  taskCount: number;
  tasks: BoardTask[];
  counts: Counts;
}

/**
 * One entry of a task's agent transcript. Legacy entries carry `s`/`d` (plain
 * lines from claude/qwen/codex and pre-JSON sessions); entries derived from
 * opencode's `--format json` stream carry a `type` discriminator.
 */
export type AgentOutputEntry =
  | { type: "text"; text: string }
  | { type: "human"; text: string }
  | {
      type: "tool";
      tool: string;
      input?: string;
      output?: string;
      state?: string;
    }
  | { type: "step"; kind: "start" | "finish"; reason?: string; at?: string }
  | { type: "sys"; d: string }
  | { s: "out" | "err" | "sys"; d: string };

/**
/**
 * The review agent's report on a task in `review` (GET /api/tasks/:id/review).
 * Advisory: it informs the human's sign-off, it never performs it.
 */
export interface ReviewReport {
  id: string;
  at: string;
  agent: string;
  cli: string;
  model: string;
  branch: string;
  /** "ok" when the agent reported; "failed" when the run itself failed. */
  state: "ok" | "failed";
  markdown: string;
}

/** Client-side view of a task's agent review. */
export interface ReviewState {
  /** True while the review agent is inspecting the worktree. */
  running: boolean;
  /** Whether the review agent is enabled on the Agents page. */
  enabled: boolean;
  /** The stored report, or null when none has been written yet. */
  report: ReviewReport | null;
  /**
   * The reviewer conversation, kept separate from the engineer session (0110).
   * Human messages and the reviewer's streamed output share this buffer only.
   */
  lines: AgentOutputEntry[];
}

/** Client-side view of the CTO board monitor (0174). */
export interface CtoState {
  /** True while a CTO run (monitor pass or a chat answer) is in progress. */
  running: boolean;
  /** Whether the CTO agent is enabled on the Agents page. */
  enabled: boolean;
  /** The latest board-health report, or null before the first run. */
  report: { markdown: string; at: string } | null;
  /**
   * The CTO conversation (session `cto:board`). Proactive reports and the
   * human's chat messages share this buffer only — never task transcripts.
   */
  lines: AgentOutputEntry[];
}

/**
 * Live run telemetry for one task's agent session (0080). Best-effort and
 * in-memory only. `null` means "the CLI hasn't reported this" — never a
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

/** One role's aggregated usage (engineer/pm/reviewer/cto/guide/…). */
export interface RoleUsage {
  role: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  /** "none"/"estimate"/"extractUsage"/"kiro-credits"/"mixed" — drives honest cost labeling. */
  costSource: string;
}

/** One individual agent session's usage row. */
export interface SessionUsage {
  sessionId: string;
  sessionType: string;
  agent: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  elapsedMs: number;
  totalTokens: number | null;
  costUsd: number | null;
  costSource: string;
  status: string;
}

/** Aggregated usage totals for a task, incl. role breakdown (0230). */
export interface TaskUsageStats {
  taskId: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
  roles: RoleUsage[];
  sessions: SessionUsage[];
}

/** One day's aggregated usage (server's local time). */
export interface DailyUsage {
  day: string;
  totalSessions: number;
  totalElapsedMs: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
}

/** Board-level usage totals: overall + per-role + per-day (0230). */
export interface BoardUsageStats {
  totalSessions: number;
  totalElapsedMs: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
  roles: RoleUsage[];
  days: DailyUsage[];
}

export type RepoEvent =
  | { type: "hello"; taskCount: number; at: string }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task; prev?: Partial<Task> }
  | { type: "task.deleted"; id: string }
  | { type: "task.progress"; id: string; step: string; at: string; detail?: string; phase?: string }
  | { type: "task.corrected"; id: string; path: string; note: string; at: string }
  | { type: "preview"; id: string; preview: PreviewInfo | null; at: string }
  | {
      type: "review";
      id: string;
      state: "running" | "ready" | "failed" | "cancelled";
      at: string;
      error?: string;
    }
  | {
      type: "cto";
      state: "running" | "ready" | "failed" | "cancelled";
      at: string;
      error?: string;
    }
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
  | { type: "agent.output"; id: string; entry: AgentOutputEntry; stream: "out" | "err" }
  | { type: "agent.stats"; id: string; stats: AgentSessionStats }
  | { type: "system.stats"; stats: SystemStats }
  | {
      type: "build.available";
      hash: string;
      buildAt: string | null;
      at: string;
    }
  | { type: "reload.failed"; reason: string; at: string }
  | {
      type: "auto-engineering.state";
      state: {
        enabled: boolean;
        maxActiveTasks: number;
        activeCount: number;
        availableSlots: number;
        reconciling: boolean;
        decision: AutoEngineeringDecision | null;
      };
      at: string;
    }
  | { type: "integration"; pipeline: IntegrationPipelineSnapshot };

/** Latest auto-engineering reconcile decision (mirrors the server shape). */
export interface AutoEngineeringDecision {
  timestamp: string;
  trigger: "active-to-review" | "inbox-to-ready" | "config-change" | "startup";
  outcome: "selected" | "no-capacity" | "no-ready-work" | "pm-unavailable" | "pm-failed";
  activeCount: number;
  maxActiveTasks: number;
  availableSlots: number;
  candidateIds: string[];
  selectedIds: string[];
  rationale?: string;
  error?: string;
}

/** The five discrete stages of the integration pipeline, in order (0207). */
export const INTEGRATION_STAGES = ["sync", "merge", "build", "check", "done"] as const;
export type IntegrationStage = (typeof INTEGRATION_STAGES)[number];

/** Live read-model of the integration pipeline for the pinned status bar (0207). */
export interface IntegrationPipelineSnapshot {
  /** True when nothing is queued or in progress — the idle empty state. */
  empty: boolean;
  /** The task currently being integrated, or null when none is in flight. */
  active: {
    taskId: string;
    stage: IntegrationStage | null;
    failed: boolean;
    error?: string;
  } | null;
  /** Task ids queued behind the active job, in FIFO order. */
  queue: string[];
  at: string;
}

/** Auto-engineering mode state shown on the Control page. */
export interface AutoEngineeringState {
  enabled: boolean;
  maxActiveTasks: number;
  activeCount: number;
  availableSlots: number;
  reconciling: boolean;
  decision: AutoEngineeringDecision | null;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "boolean" | "select" | "array";
  tier: "live" | "restart" | "guarded";
  group?: "general" | "voice";
  restartRequired: boolean;
  default: unknown;
  options?: { value: string; label: string }[];
  description: string;
}

/** An AI coding agent configured on the Agents page. */
export interface Agent {
  name: string;
  cli: string;
  model: string;
  enabled: boolean;
  instructions?: string;
}

/** Agent options served alongside /api/config. */
export interface AgentsMeta {
  clis: string[];
  models: string[];
  defaults: Agent[];
}

/** One row from GET /api/agents/detect. */
export interface DetectedAgent {
  id: string;
  name: string;
  binary: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  headless: boolean | null;
  drivable: boolean;
  installHint: string;
}

/** Live model result for one coding agent (GET /api/models). */
export interface ModelSourceResult {
  supported: boolean;
  models: string[];
  refreshable: boolean;
}

/** Response of GET /api/models, keyed by Agent.cli. */
export interface ModelSourcesResponse {
  byCli: Record<string, ModelSourceResult>;
  at: string;
}

export type ModelTestStatus = "passed" | "failed" | "timed_out" | "not_testable";

export interface ModelTestResult {
  cli: string;
  model: string;
  status: ModelTestStatus;
  durationMs: number;
  error?: string;
}

export interface ModelTestResponse {
  result: ModelTestResult;
  at: string;
}

export interface DocMeta {
  path: string;
  title: string;
}

export interface SkillMeta {
  path: string;
  name: string;
  description: string;
}

export interface MachineInfo {
  cpuCount: number;
  totalMem: number;
  freeMem: number;
  loadavg: number[];
  platform: string;
}

export interface ProcessInfo {
  pid: number;
  taskId: string | null;
  cpuPercent: number;
  memBytes: number;
  elapsed: string;
  orphaned: boolean;
  unverified: boolean;
}

export interface ServeProcessInfo {
  pid: number;
  ppid: number;
  port: number | null;
  root: string | null;
  rootExists: boolean;
  kind: "control-plane" | "known-preview" | "in-flight" | "stray";
}

/** Machine-wide `repoos serve` census — see #0216. */
export interface ServeScan {
  total: number;
  strays: number;
  inFlight: number;
  deadRoot: number;
  level: "ok" | "notice" | "warn";
  processes: ServeProcessInfo[];
}

export interface SystemStats {
  machine: MachineInfo;
  totals: {
    cpuPercent: number;
    memBytes: number;
    memPercent: number;
  };
  processes: ProcessInfo[];
  serve: ServeScan | null;
  serverPid: number;
  at: string;
}
