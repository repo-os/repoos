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
  /** Machine-readable reason `needsInput` was set (e.g. "review-failed"). Only meaningful while needsInput is true. */
  needsInputReason?: string;
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
  /** Per-task reviewer agent name override, or null when using the default. */
  reviewAgentOverride?: string | null;
  /** Per-task reviewer CLI override, or null when using the agent's default. */
  reviewCliOverride?: string | null;
  /** Per-task reviewer model override, or null when using the agent's default. */
  reviewModelOverride?: string | null;
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
  /** Automatic check-failure retries used on this task's most recent handoff
   *  (capped at 2) — distinguishes a post-handoff check-fix loop from
   *  ordinary coding once a review-status task shows a running agent. */
  checkRetryCount?: number;
  /** Automatic merge-conflict retries used on this task's most recent
   *  close-out attempt (capped at 2, #0271 follow-up) — same purpose as
   *  checkRetryCount, one step earlier in the pipeline. */
  mergeConflictRetryCount?: number;
  /** Automatic retries after the watchdog detected a dead session that
   *  exited without a clean handoff (capped at 2, #0271 follow-up). Unlike
   *  the other two, the task stays `active` throughout. */
  handoffSignalRetryCount?: number;
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
  /** Canary flow-test counter (0-9) — see src/core/canary.ts. */
  canaryCounter: number;
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
  needsInputReason?: string;
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
  /** See Task.checkRetryCount. */
  checkRetryCount: number;
  /** See Task.mergeConflictRetryCount. */
  mergeConflictRetryCount: number;
  /** See Task.handoffSignalRetryCount. */
  handoffSignalRetryCount: number;
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
export type AgentOutputEntry = (
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
  | { s: "out" | "err" | "sys"; d: string }
) & {
  /**
   * ISO timestamp of when the entry was created (0258). Populated by the
   * server on every entry it creates; absent on persisted legacy transcripts.
   */
  at?: string;
};

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
  totalCacheReadTokens?: number | null;
  totalCacheCreationTokens?: number | null;
  totalTurns?: number | null;
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
  /** The actual coding CLI/engine (e.g. "opencode", "claude") — distinct from `agent`, which is the config role name. */
  codingAgent: string;
  startedAt: string;
  endedAt: string | null;
  elapsedMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Input tokens served from the provider's prompt cache; null if the CLI didn't report it. */
  cacheReadTokens: number | null;
  /** Input tokens written to the prompt cache this session; null if unreported. */
  cacheCreationTokens: number | null;
  /** Model round-trips ("turns") this session ran; null if the CLI didn't report it. */
  turns: number | null;
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
  totalCacheReadTokens: number | null;
  totalCacheCreationTokens: number | null;
  totalTurns: number | null;
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
  /** The freeform-create PM flesh-out failed and the draft is kept as-is
   *  (0320): drop the "AI creation in flight" marker so a later manual move
   *  of the stale draft cannot flag the card as newly created. */
  | { type: "task.aiCreateFailed"; id: string; reason: string; at: string }
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
  | { type: "agent.queued"; id: string; at: string }
  | { type: "agent.dequeued"; id: string; at: string }
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
  | { type: "integration"; pipeline: IntegrationPipelineSnapshot }
  | { type: "test-run.started"; at: string }
  | { type: "test-run.output"; chunk: string; at: string }
  | { type: "test-run.done"; code: number | null; at: string }
  | {
      type: "task-check.started";
      taskId: string;
      checkId: string;
      checkKind: TaskCheckKind;
      at: string;
    }
  | { type: "task-check.output"; taskId: string; checkId: string; chunk: string; at: string }
  | {
      type: "task-check.done";
      taskId: string;
      checkId: string;
      code: number | null;
      passed: boolean;
      durationMs: number;
      at: string;
    };

/** A server-run `repoos check` for a task (0310 Debug tab) — either the
 *  handoff-finalize check or the MTD merge-gate check. */
export type TaskCheckKind = "handoff-finalize" | "merge-gate";

export interface TaskCheckRun {
  id: string;
  taskId: string;
  kind: TaskCheckKind;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  running: boolean;
  passed: boolean | null;
  code: number | null;
  output: string;
}

/** One entry from a task's `.repoos/logs/tasks/<id>.log` (0310 Debug tab). */
export interface TaskLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  component: "system" | "task" | "agent" | "integration";
  message: string;
  context?: Record<string, unknown>;
}

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

/** One model worth trying in the Model Playground (GET /api/playground/models). */
export interface PlaygroundModel {
  id: string;
  runId: string;
  name: string;
  reason: string;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  contextWindow: number | null;
}

/** One provider's catalog in the Model Playground. */
export interface PlaygroundProviderGroup {
  id: string;
  label: string;
  models: PlaygroundModel[];
  error?: string;
  fetchedAt: string;
}

export interface PlaygroundModelsResponse {
  providers: PlaygroundProviderGroup[];
  at: string;
}

export interface PlaygroundChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PlaygroundChatResponse {
  ok: boolean;
  text: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
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
  /** Truly-free pages only. On macOS this is always tiny (the OS caches everything). */
  freeMem: number;
  /** Memory reclaimable on demand without swapping (free + inactive + cache).
   *  The meaningful "headroom" figure. Older servers may omit it. */
  availableMem?: number;
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

/** git-derived codebase size for the Control page. Older servers omit it. */
export interface RepoStats {
  worktrees: number;
  trackedFiles: number;
  linesOfCode: number;
  /** Advisory ceiling; `worktrees` above this turns the count amber. 0 disables. */
  worktreeWarnThreshold?: number;
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
  repo?: RepoStats | null;
  serverPid: number;
  at: string;
}
