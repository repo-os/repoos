/** API-facing types for the RepoOS web UI. Mirrors src/core/types.ts. */

import type { RepoCommit } from "../../core/repo-log.js";
import type { DeclaredShot } from "../../core/shot-plan.js";
import type { Input } from "../../core/input.js";

export type Status = "draft" | "inbox" | "ready" | "active" | "review" | "done";

/** One uncommitted file in the sidebar git-state row (#0584): repo-relative
 *  path plus git's porcelain `XY` status code (`" M"` modified, `"??"` untracked). */
export interface RepoStatusDirtyFile {
  path: string;
  status: string;
}

/**
 * Repo root checkout git state for the persistent sidebar row (#0584) —
 * client mirror of `src/server/repo-status.ts` (the UI imports core, never
 * server, so the shape is restated here like every other API type).
 *
 * `ok: false` means git could not be read: branch and dirtiness are unknown
 * and must render as `unknown`, never as `clean`.
 */
export interface RepoStatus {
  ok: boolean;
  branch: string | null;
  detached: boolean;
  baseBranch: string | null;
  dirty: RepoStatusDirtyFile[];
  head: string | null;
  /** The three most recent commits on the checked-out branch (History tab's shape). */
  recentCommits: RepoCommit[];
  /** Absolute path of the checkout this describes (the popup says which). */
  path: string;
  /** When the server computed this (ISO). Stale data degrades to `unknown`. */
  computedAt: string;
}

/** A live read-only preview of a task's worktree (see POST /api/tasks/:id/preview). */
export interface PreviewInfo {
  port: number;
  url: string;
  startedAt: string;
  /** Which preview target is serving (#0379): the target's `name`, or
   *  "default" for the bare `[preview] command`. Undefined on very old servers. */
  label?: string;
  /**
   * Companion services running behind the main URL (#0681), each with its
   * name and port — e.g. an API a full-stack preview's web command proxies to.
   * Absent for a single-process preview.
   */
  services?: { name: string; port: number }[];
}

/** A preview target a task can be served from (#0379). More than one means the
 *  task's `area` is claimed by several `[[preview.targets]]`, so the drawer
 *  must let the user pick rather than silently previewing the first. */
export interface PreviewTargetOption {
  /** Human label shown in the drawer: the target's `name`, or "default". */
  name: string;
  /** Task areas this target declared (empty for the default command). */
  areas: string[];
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
  /** Specific questions blocking implementation until the human answers them. */
  questions?: string[];
  /** Machine-readable reason `needsInput` was set (e.g. "review-failed"). Only meaningful while needsInput is true. */
  needsInputReason?: string;
  /** Free-text detail for why `needsInput` was set. */
  needsInputDetail?: string;
  /** One-line AI tl;dr for the current failure — root cause + next action (#0570). */
  debugTldr?: string;
  /** When `debugTldr` was generated (ISO-8601 UTC). */
  debugTldrAt?: string;
  /** True when the task branch has drifted from main. Layered on `review`. */
  needsMerge: boolean;
  /** True when the task is shelved (#0657). Orthogonal to `status`. Optional on
   *  this client type so partial test fixtures need not set it. */
  isArchived?: boolean;
  /** Optional free-text reason the task was archived; absent when none was given. */
  archiveDetail?: string;
  priority: string;
  area: string;
  /** Parsed area list (#0583); `area` is the comma-joined display form. */
  areas?: string[];
  /** Optional cross-area delivery slice; empty string means untagged. */
  story?: string;
  /** Prerequisite task ids. */
  dependsOn?: string[];
  /** Exact branch commit captured at close-out for Git ancestry checks. */
  mergedCommit?: string | null;
  /** Live Git-verified prerequisites that are still blocking this task. */
  blockedBy?: DependencyBlocker[];
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
  /** Preview targets this task's area resolves to (server-computed, #0379).
   *  More than one means the user should choose; see `PreviewTargetOption`. */
  previewTargets?: PreviewTargetOption[];
  /** Server-authoritative automatic-review activity, refreshed with the index. */
  automaticReview?: AutomaticReview;
  /** True while the freeform-create PM agent is fleshing this draft out
   *  (0335) — live server state, refreshed with the index and via SSE. */
  pmWorking?: boolean;
  /** True when the agent emitted a handoff signal that is pending or actively
   *  finalizing — shows "Requested review" instead of "Paused" on the card. */
  pendingHandoff?: boolean;
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

export interface DependencyBlocker {
  id: string;
  state: "waiting" | "archived" | "cancelled";
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

/**
 * One captured preview shot (#0582), served from
 * `work/.attachments/<taskId>/shots/` — separate from the uploaded
 * `ScreenshotMeta` files above, and never referenced from the task body.
 */
export interface ShotMeta {
  /** File name within the task's `shots/` folder. */
  name: string;
  /** Resolved preview target this shot came from. */
  target: string;
  /** Requested route/URL, when the caller supplied one. */
  route?: string;
  /** Declared shot label (#0594), when the capture was captioned with one. */
  label?: string;
  /**
   * Why this shot exists (#0603), one line — "declared: <label>" or
   * "auto: matched <glob>" — shown under the image in the Changes tab.
   */
  provenance?: string;
  /**
   * The full declared entry a hand-added shot was captured from (#0627), so
   * delete can sync the exact `## Shots` declaration. Absent for legacy
   * captures and the automatic pass.
   */
  declared?: DeclaredShot;
  /** Repo-relative path. */
  path: string;
  /** API URL the UI loads the image from. */
  url: string;
  size: number;
  mime: string;
  /** ISO-8601 capture time. */
  capturedAt: string;
}

export interface Health {
  ok: boolean;
  root: string;
  /** The project display name — basename of the main checkout, never the worktree branch. */
  projectName: string;
  /** The branch name when running from a worktree, or null for the main checkout. */
  branch: string | null;
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
  /** ISO start time of the serve process (derived from process.uptime()). */
  serverStartedAt?: string;
  /** True when the dev-only copy inspector is available on this server build. */
  copyInspectorAvailable?: boolean;
  /** True when this server is a preview instance serving a specific task's worktree. */
  isPreviewBuild: boolean;
  /** Canary flow-test counter (0-9) — from the managed repo's canary file. */
  canaryCounter: number;
  /** Repo-relative path to the canary counter file (respects `cacheDir`). */
  canaryPath: string;
}

declare global {
  interface Window {
    __REPOOS_BUILD_HASH__?: string;
  }
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

/** Lightweight task view for board cards — no full body or extra. Includes a
 * body preview, compact agent/model overrides, and releasedAt. */
export interface BoardTask {
  id: string;
  title: string;
  type: string;
  status: Status;
  needsInput: boolean;
  questions?: string[];
  needsInputReason?: string;
  needsInputDetail?: string;
  /** One-line AI tl;dr for the current failure — root cause + next action (#0570). */
  debugTldr?: string;
  /** When `debugTldr` was generated (ISO-8601 UTC). */
  debugTldrAt?: string;
  needsMerge: boolean;
  /** True when the task is shelved (#0657). Orthogonal to `status`. */
  isArchived?: boolean;
  /** Optional free-text reason the task was archived; absent when none was given. */
  archiveDetail?: string;
  priority: string;
  area: string;
  /** The parsed area list (#0583) — one chip per entry in the UI. */
  areas?: string[];
  /** Optional cross-area delivery slice; empty string means untagged. */
  story?: string;
  dependsOn?: string[];
  mergedCommit?: string | null;
  blockedBy?: DependencyBlocker[];
  assignee: "ai" | "human" | "unassigned";
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  /** Per-task Engineer agent name override, or null when using the default (#0455). */
  agentOverride: string | null;
  cliOverride: string | null;
  modelOverride: string | null;
  /** Per-task PM agent name override, or null when using the default (#0455). */
  pmAgentOverride: string | null;
  pmCliOverride: string | null;
  pmModelOverride: string | null;
  /** Per-task Reviewer agent name override, or null when using the default (#0455). */
  reviewAgentOverride: string | null;
  reviewCliOverride: string | null;
  reviewModelOverride: string | null;
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
  /** Preview targets this task's area resolves to (server-computed, #0379). */
  previewTargets?: PreviewTargetOption[];
  automaticReview?: AutomaticReview;
  /** Advisory lock while the task is in review or close-out (#0598). */
  worktreeReviewLock?: {
    status: "review" | "closing-out";
    sha: string;
    at: string;
  } | null;
  /** True while the PM agent is fleshing this draft out (0335). */
  pmWorking?: boolean;
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
  storyDefinitions?: StoryDefinitionRecord[];
}

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
  /** "ok" when a parseable verdict is present; "incomplete" when output lacked one; "failed" when the run produced no usable report. */
  state: "ok" | "incomplete" | "failed";
  markdown: string;
}

/** Persisted handoff UI verification evidence (#0680). */
export interface UiHandoffVerificationIssue {
  kind: string;
  message: string;
  url?: string;
  viewportWidth?: number;
}

export interface UiHandoffVerificationEvidence {
  at: string;
  issues: UiHandoffVerificationIssue[];
  blankShots: string[];
  captures: number;
}

/** Client-side view of a task's agent review. */
export interface ReviewState {
  /** True while the review agent is inspecting the worktree. */
  running: boolean;
  /** Whether the review agent is enabled on the Agents page. */
  enabled: boolean;
  /** The stored report, or null when none has been written yet. */
  report: ReviewReport | null;
  /** Numbered review pass summaries (#0680). */
  history?: Array<{
    pass: number;
    at: string;
    state: string;
    verdict: string | null;
  }>;
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
  /** "none"/"extractUsage"/"kiro-credits"/"mixed" — drives honest cost labeling. */
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
  /** What triggered the run ("timer"/"manual"/"event: …"), or null when unset. */
  trigger: string | null;
  /** Truncated failure text for an errored session, or null when the run succeeded. */
  errorReason: string | null;
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

/**
 * Usage time window for the Mission Control AI usage panel (0334): a trailing
 * window on session start, or all time. Mirrors `UsageRange` in core/db.
 */
export type UsageRange = "1d" | "7d" | "30d" | "all";

/** Board-level usage totals: overall + per-role + per-day (0230). */
export interface BoardUsageStats {
  totalSessions: number;
  totalElapsedMs: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
  costSource: string;
  roles: RoleUsage[];
  days: DailyUsage[];
  /** Most recent errored sessions in range (newest first), for the failures list. */
  recentFailures: SessionUsage[];
}

/** How a close-out (Move to done) ended (#0640). Mirrors the server's
 *  `src/server/close-out-outcome.ts`; the UI never imports server code. */
export type CloseOutOutcome = "succeeded" | "failed" | "timedOut";

export interface CloseOutOutcomeEvent {
  taskId: string;
  outcome: CloseOutOutcome;
  /** When the close-out FINISHED (server time, ISO-8601 UTC). */
  finishedAt: string;
  reason: string;
}

export type RepoEvent =
  | { type: "hello"; taskCount: number; at: string }
  /** Background PM enrichment of a new input reached its terminal outcome
   *  (#0628, #0631): carries the input the client should render — enriched on
   *  success, unchanged on failure — so open views swap it in place and the
   *  in-progress indicator clears. Emitted on every outcome, not just success. */
  | { type: "input.enriched"; id: string; input: Input; at: string }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  /** Repo root checkout git state for the sidebar row (#0584). The server
   *  emits this only when the computed state actually differs. */
  | { type: "repo.status"; status: RepoStatus; at: string }
  | { type: "story.definitionsChanged"; at: string }
  | {
      type: "story.pmFinished";
      path: string;
      name: string;
      ok: boolean;
      reason?: string;
      taggedTaskIds: string[];
      at: string;
    }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task; prev?: Partial<Task> }
  | { type: "task.deleted"; id: string }
  /** The freeform-create PM flesh-out failed and the draft is kept as-is
   *  (0320): drop the "AI creation in flight" marker so a later manual move
   *  of the stale draft cannot flag the card as newly created. */
  | { type: "task.aiCreateFailed"; id: string; reason: string; at: string }
  /** The freeform-create PM flesh-out started working on a draft (0335):
   *  drives the live "PM is working" indicator on the card + task panel. */
  | { type: "task.pmWorking"; id: string; at: string }
  /** The freeform-create PM flesh-out finished — success or failure (0335).
   *  Emitted on every exit path so the indicator can never get stuck. */
  | { type: "task.pmFinished"; id: string; at: string }
  /** The task's Debugger is generating (started) or gave up on (finished) the
   *  one-line tl;dr for the current failure (#0570). `started` drives the
   *  drawer's subtle "diagnosing…" hint; `finished` clears it on every exit
   *  path so the hint can never get stuck. */
  | { type: "task.debugTldr"; id: string; state: "started" | "finished"; at: string }
  | { type: "task.doneErrorTldr"; id: string; tldr: string; at: string }
  | {
      type: "task.progress";
      id: string;
      step: string;
      at: string;
      detail?: string;
      phase?: string;
      /** Repo-relative durable log of the failed check's full output (#0428). */
      logPath?: string;
      /** Debugger tl;dr when already on the failed job (#0595). */
      tldr?: string;
    }
  | { type: "task.corrected"; id: string; path: string; note: string; at: string }
  | { type: "task.autoApproved"; id: string; rule: string; at: string }
  | { type: "preview"; id: string; preview: PreviewInfo | null; at: string }
  | {
      type: "review";
      id: string;
      state: "running" | "ready" | "failed" | "incomplete" | "cancelled";
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
  | { type: "config.changed"; at: string }
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
  /** A close-out (Move to done) run ended (#0640): succeeded, failed, or hit
   *  its wall-clock budget. Feeds the notices bell; a user cancel emits none. */
  | { type: "close-out.outcome"; outcome: CloseOutOutcomeEvent; at: string }
  | { type: "attention.updated"; at: string }
  | { type: "test-run.started"; at: string }
  | { type: "test-run.output"; chunk: string; at: string }
  | { type: "test-run.done"; code: number | null; at: string }
  | {
      type: "task-check.started";
      taskId: string;
      checkId: string;
      checkKind: TaskCheckKind;
      scope: string;
      machine: string;
      at: string;
    }
  | { type: "task-check.output"; taskId: string; checkId: string; chunk: string; at: string }
  | {
      type: "task-check.done";
      taskId: string;
      checkId: string;
      code: number | null;
      passed: boolean;
      /** #0592: the gate skipped — this repo has no check plan. */
      skipped: boolean;
      durationMs: number;
      scope: string;
      machine: string;
      at: string;
    }
  /** A built-in agent finished a run (0439) — surfaced as a toast. */
  | {
      type: "built-in.run";
      agent: string;
      label: string;
      findings: number;
      taskId: string | null;
      runDoc: string | null;
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
  /**
   * #0592: the gate skipped — this repo has no check plan. The server detects
   * it once at completion and sends the flag; optional so older payloads (or
   * test fixtures) without it still work via the output-marker fallback.
   */
  skipped?: boolean;
  /** 'full' or 'changed:<ref>' — what the run covers (#0564). */
  scope: string;
  /** Short hostname of the machine the check runs on (#0564). */
  machine: string;
}

/** One durable check run (#0564) — a row of the Runs tab / check history. */
export interface CheckRunRow {
  id: number;
  /** null for bare CLI runs. */
  taskId: string | null;
  phase: "pre-review" | "close-out" | "release" | "cli";
  /** Absolute worktree path the run executed in, when known. */
  worktree?: string | null;
  /** Short hostname of the executing machine, or null when never dispatched. */
  machine: string | null;
  /** True when the run executed on a remote validation host. */
  remote: boolean;
  /** 'full' or 'changed:<ref>'. */
  scope: string;
  startedAt: string;
  durationMs: number | null;
  /** `skipped` (#0592): the gate ran nothing — this repo has no check plan. */
  outcome: "pass" | "fail" | "cancelled" | "skipped";
  failedStep: string | null;
  skippedSteps: string[];
  failedTests: string[];
  /** Informational isolation re-run label (#0655), e.g. `passed 3/3 alone`. */
  isolationNote?: string | null;
  detail: string | null;
}

/** One host's live state from `GET /api/remote-validation/status` (#0521/#0564). */
export interface RemoteHostStatusView {
  host: string;
  user: string;
  os?: string;
  labels: string[];
  maxConcurrent: number;
  inFlight: number;
  queued: number;
  probed: boolean;
  healthy: boolean;
  detail?: string;
  lastRun?: { taskId: string; ok: boolean; at: string; durationMs?: number };
  activeRuns?: {
    taskId: string;
    startedAt: string;
    phase?: string;
    label?: string;
    source?: "server" | "host-lock";
  }[];
  queuedTasks?: string[];
  hostLock?: {
    holders: Array<{
      state: "holding";
      taskId?: string;
      label: string;
      phase: string;
      ageSecs: number;
      slotIndex?: number;
    }>;
    waiters: Array<{
      state: "waiting";
      taskId?: string;
      label: string;
      phase: string;
      ageSecs: number;
      queuePosition?: number;
    }>;
    sampledAt?: string;
  };
  lockWaiters?: Array<{
    taskId: string;
    phase: string;
    label: string;
    queuePosition?: number;
    ageSecs: number;
  }>;
  serverStats?: {
    available: boolean;
    sampledAt?: string;
    loadAverage?: [number, number, number];
    cpuCount?: number;
    memoryUsedBytes?: number;
    memoryTotalBytes?: number;
    diskFreeBytes?: number;
    detail?: string;
  };
}

/** The `/api/remote-validation/status` payload (#0521/#0564). */
export interface RemoteValidationStatusView {
  enabled: boolean;
  running: boolean;
  provider: "hetzner" | "tailscale";
  tailscaleHosts: string[];
  hosts: RemoteHostStatusView[];
  tailscaleHost: string;
  tailscaleHostPinsTop: boolean;
  hostPoolEditable: boolean;
  activeServer: { id: number; ip: string; ageMinutes: number } | null;
  maxConcurrent: number;
}

/** One entry from a task's `.repoos/logs/tasks/<id>.log` (0310 Debug tab). */
export interface TaskLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  component: "system" | "task" | "agent" | "integration";
  message: string;
  context?: Record<string, unknown>;
}

/** One structured remote-validation event for a task (#0568 Debug tab) — which
 *  host ran, the exit code, and any infra/config error behind a non-test failure. */
export interface RemoteValidationEvent {
  at: string;
  level: "info" | "warn" | "error";
  phase: "queued" | "dispatch" | "run" | "result";
  message: string;
  host?: string;
  exitCode?: number | null;
  infra?: boolean;
  configError?: boolean;
}

/** Latest auto-engineering reconcile decision (mirrors the server shape). */
export interface AutoEngineeringDecision {
  timestamp: string;
  trigger:
    | "active-to-review"
    | "inbox-to-ready"
    | "dependency-merged"
    | "config-change"
    | "startup";
  outcome: "selected" | "no-capacity" | "no-ready-work" | "pm-failed";
  /** Which picker ran: the deterministic default, or the optional PM veto pass. */
  picker?: "deterministic" | "pm-veto";
  activeCount: number;
  maxActiveTasks: number;
  availableSlots: number;
  candidateIds: string[];
  selectedIds: string[];
  /** Eligible tasks left for a later slot, in pick order. */
  deferredIds?: string[];
  rationale?: string;
  error?: string;
}

/** The five discrete stages of the integration pipeline, in order (0207). */
export const INTEGRATION_STAGES = ["sync", "merge", "build", "check", "done"] as const;
export type IntegrationStage = (typeof INTEGRATION_STAGES)[number];

/** One resolved step of the repo's `[[check.steps]]` plan (#0458) — what the
 *  integration bar's "check" tooltip renders instead of hardcoded prose. */
export interface CheckPlanStep {
  name: string;
  kind?: string;
  command?: string;
  cwd?: string;
  timeoutMs: number;
  required: boolean;
  dependsOn: string[];
  profiles: string[];
}

/** The repo's resolved check plan, from its `repoos.toml` (#0446/#0458). */
export interface CheckPlanInfo {
  source: "declared" | "legacy" | "inferred" | "empty";
  defaultProfile: string;
  steps: CheckPlanStep[];
  /**
   * Plan-level problems (#0592): a plan whose rows are all unusable (or a
   * schema version newer than this build) resolves to 0 steps WITH errors —
   * the gate fails red for that, which is NOT the same state as "no checks
   * configured". The bar shows its amber strip only for a genuinely empty
   * error-free plan.
   */
  errors: string[];
}

/** One step of the Checks surface, with prerequisites and selection (#0447). */
export interface CheckPlanStepView {
  name: string;
  kind?: string;
  command?: string;
  cwd?: string;
  timeoutMs: number;
  required: boolean;
  profiles: string[];
  whenChanged: string[];
  dependsOn: string[];
  requires: string[];
  /** No `whenChanged` → runs on any change (a contract/integration step). */
  crossCutting: boolean;
  /** Whether the selected profile includes this step. */
  selected: boolean;
  /** Set when the step will not run this invocation, with the reason why. */
  skip?: { reason: string; detail: string };
  /** Declared prerequisites missing from PATH, with install advice. */
  missing: { tool: string; hint: string }[];
}

/** One persisted step result from the last `repoos check` run. */
export interface CheckRunStepResult {
  name: string;
  status: "passed" | "failed" | "timeout" | "missing-prereq" | "skipped";
  command?: string;
  cwd?: string;
  durationMs: number;
  output?: string;
  detail?: string;
  required: boolean;
}

/** The last completed `repoos check` run, or null when none was recorded. */
export interface CheckRunRecord {
  profile: string;
  source: "declared" | "legacy" | "inferred" | "empty";
  changedRef?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: boolean;
  /**
   * #0592: what the gate did — `passed` / `failed`, or `skipped` when the repo
   * has no check plan and nothing was verified. Optional for records written
   * before #0592 (they carry only `passed`); an absent outcome is inferred
   * from `passed` by callers that need the distinction.
   */
  outcome?: "passed" | "failed" | "skipped";
  results: CheckRunStepResult[];
}

/** The full Checks surface payload from `GET /api/check-plan` (#0447). */
export interface CheckPlanView {
  source: "declared" | "legacy" | "inferred" | "empty";
  defaultProfile: string;
  profile: string;
  profiles: string[];
  changedRef?: string;
  changedPaths?: string[];
  warnings: string[];
  errors: string[];
  steps: CheckPlanStepView[];
  lastRun: CheckRunRecord | null;
}

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
    /** When the active job started (ISO), for the live stopwatch. */
    startedAt: string | null;
  } | null;
  /** Task ids queued behind the active job, in FIFO order. */
  queue: string[];
  /** The repo's resolved check plan (`repoos.toml`), for data-driven tooltips (#0458). */
  checkPlan?: CheckPlanInfo;
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
  type: "string" | "boolean" | "select" | "array" | "number";
  tier: "live" | "restart" | "guarded";
  group?: "general" | "voice";
  restartRequired: boolean;
  default: unknown;
  options?: { value: string; label: string }[];
  description: string;
}

/**
 * Attachment-storage status from `GET /api/config` (#0659). Reports which
 * provider is configured and which is actually in effect (local when the
 * configured cloud provider is not usable yet), plus a non-alarming
 * explanation of why, so the Settings UI explains the effective provider
 * instead of guessing.
 */
export interface StorageStatus {
  /** Provider id configured in `repoos.toml` (defaults to `local`). */
  configured: string;
  /** Provider id actually in effect — `local` when the configured one is unavailable. */
  effective: string;
  /** Whether the configured provider is available right now. */
  available: boolean;
  /** Human-readable explanation when configured and effective differ; `""` otherwise. */
  reason: string;
}

/** An AI coding agent configured on the Agents page. */
export interface Agent {
  name: string;
  cli: string;
  model: string;
  enabled: boolean;
  instructions?: string;
  skills?: string[];
}

/** Agent options served alongside /api/config. */
export interface AgentsMeta {
  clis: string[];
  models: string[];
  defaults: Agent[];
  /** Repository skills available for explicit per-agent assignment. */
  skills: SkillMeta[];
}

/** One row from GET /api/agents/detect. */
export interface DetectedBinary {
  name: string;
  path: string;
  version: string | null;
  headless: boolean;
}

export interface DetectedAgent {
  id: string;
  name: string;
  /** Canonical configured CLI id, when this detector row is drivable. */
  cli?: string;
  binary: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  headless: boolean | null;
  drivable: boolean;
  installHint: string;
  /** Copyable sign-in hint, when the CLI reports auth state. */
  authHint?: string;
  /** One-line capability note shown beside the agent. */
  capability?: string;
  /** Auth state from the CLI's own status probe: true/false/null (unknown). */
  auth: boolean | null;
  compatibility?: {
    status:
      | "verified"
      | "upgrade_recommended"
      | "newer_than_verified"
      | "unsupported"
      | "not_probed";
    label: string;
    explanation: string;
    installedVersion: string | null;
    newestCertifiedVersion: string | null;
    capabilities: string[];
    /** Present when a source-controlled contract tracks this harness. */
    contract?: { cli: string; name: string } | null;
  };
  update?: AgentUpdate;
  /** All copies found on PATH when more than one exists. */
  allBinaries?: DetectedBinary[];
}

export interface AgentUpdate {
  status: "up_to_date" | "update_available" | "unavailable" | "manual";
  installedVersion: string | null;
  latestVersion: string | null;
  source: string | null;
  sourceUrl: string | null;
  checkedAt: string | null;
  updateCommand: string | null;
  error?: string;
}

/** Live model result for one coding agent (GET /api/models). */
export interface ModelSourceResult {
  supported: boolean;
  models: string[];
  refreshable: boolean;
  /**
   * Why the list is empty or incomplete when the probe failed: binary not
   * found on PATH, timed out, not signed in, spawn failed (#0593). Absent on
   * success.
   */
  error?: string;
}

/** Response of GET /api/models, keyed by Agent.cli. */
export interface ModelSourcesResponse {
  byCli: Record<string, ModelSourceResult>;
  at: string;
}

export type ModelTestStatus = "passed" | "failed" | "timed_out" | "cold_start" | "not_testable";

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

// ---- Model providers tab (0327) ----

/** `live` rows poll a spend API behind a user-pasted key; `link` rows are dashboard link-outs. */
export type ModelProviderKind = "live" | "link";

/** One row of the Model providers tab (GET /api/model-providers). */
export interface ModelProviderRow {
  id: string;
  label: string;
  kind: ModelProviderKind;
  dashboardUrl: string;
  note: string;
  /** Whether an API key is saved — never the key itself. */
  hasKey: boolean;
}

export interface ModelProvidersResponse {
  providers: ModelProviderRow[];
  at: string;
}

export interface ModelProvidersKeyResponse {
  ok: boolean;
  hasKey: boolean;
}

/** One rolling usage window from the opencode Go usage API. */
export interface ModelProviderUsageWindow {
  id: string;
  label: string;
  /** 0–100, percent of the window consumed. */
  usedPct: number | null;
  usedUsd: number | null;
  limitUsd: number | null;
  resetsAt: string | null;
}

/** OpenRouter live spend (GET /api/model-providers/openrouter/usage). */
export interface OpenRouterUsage {
  kind: "openrouter";
  credits: {
    totalCredits: number | null;
    totalUsage: number | null;
    remaining: number | null;
  } | null;
  /** Per-endpoint error — e.g. a non-management key can't read /credits. */
  creditsError: string | null;
  key: {
    label: string | null;
    usageDaily: number | null;
    usageWeekly: number | null;
    usageMonthly: number | null;
    limit: number | null;
    limitRemaining: number | null;
    rateLimit: { requests: number | null; interval: string | null } | null;
  } | null;
  keyError: string | null;
}

/** opencode Go live usage (GET /api/model-providers/opencode-go/usage). */
export interface OpenCodeGoUsage {
  kind: "opencode-go";
  windows: ModelProviderUsageWindow[];
  unrecognized: boolean;
}

/** DeepInfra live spend (GET /api/model-providers/deepinfra/usage). */
export interface DeepInfraUsage {
  kind: "deepinfra";
  checklist: {
    /**
     * Ready-to-spend credit — DeepInfra's `stripe_balance` with its sign
     * flipped (negative balance = funds available). Null when a debt/zero.
     */
    availableUsd: number | null;
    /** Positive `stripe_balance`: money the account owes. */
    owedUsd: number | null;
    recentUsd: number | null;
    limitUsd: number | null;
    suspended: boolean;
    suspendReason: string | null;
    scopedCredits: {
      name: string;
      grantedUsd: number | null;
      remainingUsd: number | null;
      expired: boolean;
    }[];
  } | null;
  checklistError: string | null;
  /** Current + previous month totals (converted from upstream cents). */
  usage: { period: string; totalUsd: number | null }[] | null;
  usageError: string | null;
}

/** GitHub Copilot's usage lives in its web settings — no public API for personal accounts. */
export type ModelProviderUsage = OpenRouterUsage | OpenCodeGoUsage | DeepInfraUsage;

export interface DocMeta {
  path: string;
  title: string;
  /** File mtime from the server listing (ms since epoch). */
  mtimeMs: number;
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
