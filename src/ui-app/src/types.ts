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

export interface Health {
  ok: boolean;
  root: string;
  taskCount: number;
  workDir: string;
  /** App version (package.json), or null when unavailable. */
  version: string | null;
  /** ISO timestamp of the last build, or null when unavailable. */
  buildAt: string | null;
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

export type RepoEvent =
  | { type: "hello"; taskCount: number; at: string }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task; prev?: Partial<Task> }
  | { type: "task.deleted"; id: string }
  | { type: "task.progress"; id: string; step: string; at: string }
  | { type: "task.corrected"; id: string; path: string; note: string; at: string }
  | { type: "preview"; id: string; preview: PreviewInfo | null; at: string }
  | {
      type: "review";
      id: string;
      state: "running" | "ready" | "failed" | "cancelled";
      at: string;
      error?: string;
    }
  | { type: "agent.running"; id: string }
  | { type: "agent.exited"; id: string }
  | { type: "agent.output"; id: string; entry: AgentOutputEntry; stream: "out" | "err" }
  | { type: "agent.stats"; id: string; stats: AgentSessionStats }
  | { type: "system.stats"; stats: SystemStats };

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "boolean" | "select" | "array";
  tier: "live" | "restart" | "guarded";
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

export interface SystemStats {
  machine: MachineInfo;
  totals: {
    cpuPercent: number;
    memBytes: number;
    memPercent: number;
  };
  processes: ProcessInfo[];
  serverPid: number;
  at: string;
}
