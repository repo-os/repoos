/**
 * The agent runner: launches the repo's default coding agent against a task in
 * its worktree, tracks running processes, and supports graceful pause.
 *
 * Zero runtime deps — `node:child_process` only. Everything here is best-effort:
 * a missing CLI or a broken agent config must never crash the server or block
 * an HTTP response, so spawns are async-fired and failures surface as events.
 */
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Agent, AgentOutputEntry, AgentSessionStats, RepoOSConfig, Task } from "../core/types.js";
import { agentsForConfig, defaultMaxConcurrentAgents } from "../core/config.js";
import { fileCommittedClean, currentBranch } from "../core/git.js";
import { buildIndex } from "../core/indexer.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import { patchTaskFile, type TaskPatch } from "./write.js";
import { stripAnsi } from "./done.js";
import type { Logger } from "../core/logger.js";
import { getRepoOSDb, type RepoOSDb } from "../core/db.js";

/** The SSE events the runner emits. Subset of RepoEvent. */
export type AgentEvent =
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
  /** A start/send/chat was accepted but held for a free maxConcurrentAgents slot. */
  | { type: "agent.queued"; id: string; at: string }
  /** A queued id left the queue — about to spawn (an agent.running follows immediately). */
  | { type: "agent.dequeued"; id: string; at: string }
  | {
      type: "agent.output";
      id: string;
      entry: AgentOutputEntry;
      stream: "out" | "err";
      at: string;
    }
  | { type: "agent.stats"; id: string; stats: AgentSessionStats; at: string }
  | {
      type: "task.corrected";
      id: string;
      path: string;
      note: string;
      at: string;
    };

export const HANDOFF_READY_SIGNAL = "::repoos-handoff-ready::";

/**
 * The exact line a sandboxed agent emits to request ITS managed preview
 * (#0121). Like the handoff signal, it is an output-only intent: the agent
 * never touches localhost or picks a port — the runner binds it to the live
 * run and the server starts/probes the preview on the agent's behalf.
 */
export const PREVIEW_REQUEST_SIGNAL = "::repoos-preview-request::";

/**
 * The transcript marker appended when a user interrupts an in-flight AI chat
 * response. Shared so the runner and the CTO manager (and tests) never drift.
 */
export const INTERRUPTED_MARKER = "— response interrupted —";

/** A capability minted by the runner for one completed agent turn. */
export interface AgentHandoffRequest {
  taskId: string;
  runId: string;
  branch: string;
  workdir: string;
  sessionId?: string;
}

/** A capability minted when a clean turn requested its managed preview (#0121). */
export interface AgentPreviewRequest {
  taskId: string;
  runId: string;
  branch: string;
  workdir: string;
  sessionId?: string;
}

export interface StartResult {
  ok: boolean;
  pid?: number;
  /** True when the request was rejected because a turn is already running. */
  busy?: boolean;
  /** True when accepted but held for a free slot under maxConcurrentAgents — it will spawn once one frees. */
  queued?: boolean;
  reason?: string;
}

export interface StopResult {
  stopped: boolean;
  reason?: string;
}

export interface RunningAgentInfo {
  id: string;
  pid: number;
  startedAt: string;
  /** Working directory the agent runs in (worktree path, or repo root). */
  workdir?: string;
}

interface Entry {
  /** Undefined for an entry adopted after this server process started. */
  proc?: ChildProcess;
  startedAt: string;
  workdir?: string;
  killTimer?: ReturnType<typeof setTimeout>;
  /** The task being worked on (start turns only — resume turns have none). */
  task?: Task;
  branch: string;
  runId: string;
  handoffRequested: boolean;
  /** Whether the agent requested its managed preview during this run (#0121). */
  previewRequested: boolean;
  /** A review-fix follow-up keeps the worktree's last committed review state. */
  skipBoardDivergence?: boolean;
  /**
   * True for a durable REVIEW turn (0288). Set when the entry is spawned
   * through the review path so cleanup() can (a) skip its own DB session
   * recording (ReviewManager owns that) and (b) fire `onReviewDone` on
   * completion — including for entries re-attached after a reload.
   */
  review?: boolean;
  /** Which kind of review turn: "run" (fresh report) or "chat" (follow-up). */
  reviewKind?: "run" | "chat";
  /**
   * For adopted entries (0214): the PID to poll for liveness. When non-null
   * the stall checker periodically verifies the PID is still alive and cleans
   * up if it died.
   */
  adoptedPid?: number;
  /** Pollers reading the durable stdout/stderr logs into the live transcript. */
  tailers?: { timer: ReturnType<typeof setInterval>; drain: () => void; flush: () => void }[];
}

/**
 * Durable agent registry entry persisted to .repoos/agents.json (0214).
 * Survives a server restart so the new process can re-attach to in-flight agent
 * children by PID and resume streaming from their log files.
 */
interface DurableRegistryEntry {
  taskId: string;
  pid: number;
  workdir: string;
  branch: string;
  runId: string;
  /** "review" marks a durable review turn so a restart re-attaches as one (0288). */
  kind?: "engineer" | "review";
  /** Which review variant the turn is (run vs chat), for completion handling. */
  reviewKind?: "run" | "chat";
}

interface DurableRegistry {
  entries: DurableRegistryEntry[];
}

/** Line-buffered transcript for one task, retained across turns and pause. */
interface Session {
  lines: AgentOutputEntry[];
  pending: string;
  bytes: number;
  workdir?: string;
  sessionId?: string;
  task?: Task;
  branch?: string;
  /** Agent name (e.g., "engineer", "reviewer", "Ross"). */
  agent?: string;
  /** Model name (e.g., "big pickle", "default"). */
  model?: string;
  /** Which session engine parses the CLI output into AgentOutputEntry cards. */
  engine: "opencode" | "claude" | "copilot" | "qwen" | "codex" | "kiro" | "plain";
  /** Cumulative ms across completed turns — excludes any turn in flight (0080). */
  accumulatedMs: number;
  /** ISO timestamp when the session was first created (never changes). */
  createdAt?: string;
  /** ISO timestamp the current turn started, or undefined when no turn is running. */
  turnStartedAt?: string;
  /** ISO timestamp of the most recent output line, or undefined until first output. */
  lastOutputAt?: string;
  /** Best-effort cumulative input token count reported by the CLI, or undefined if never reported. */
  inputTokens?: number;
  /** Best-effort cumulative output token count reported by the CLI, or undefined if never reported. */
  outputTokens?: number;
  /** Best-effort cumulative token count reported by the CLI, or undefined if never reported. */
  tokens?: number;
  /** Best-effort cumulative cost (USD) reported by the CLI, or undefined if never reported. */
  costUsd?: number;
  /**
   * claude stream only (0109): a `tool_use` whose `tool_result` has not
   * arrived yet. claude emits the call and its result as separate events, so
   * the tool card is held back until the result line arrives and the entry
   * can carry name + input + output together. Flushed without output if the
   * turn ends before the result.
   */
  pendingTool?: { id: string; name: string; input?: string };
  /**
   * Edge-detection only, not part of the public stats shape: whether the last
   * `agent.stats` snapshot we pushed already reported `stalled: true`, so the
   * periodic check emits exactly once per stall (not every tick) and output
   * arriving after a stall clears it exactly once too.
   */
  stalledEmitted: boolean;
}

const now = (): string => new Date().toISOString();

/** Hard cap on a session transcript (drop oldest lines beyond this). */
const OUTPUT_CAP_BYTES = 256 * 1024;

/** Path to the durable agent registry (0214). */
function registryPath(cacheDir: string): string {
  return join(cacheDir, "agents.json");
}

/** Path to the pending-handoffs store (#0235). */
function pendingHandoffsPath(cacheDir: string): string {
  return join(cacheDir, "pending-handoffs.json");
}

/** On-disk pending handoff store: keyed by taskId, newer runs supersede older ones. */
interface PendingHandoffStore {
  requests: AgentHandoffRequest[];
}

/** Read the pending handoff store; returns empty when missing or corrupted. */
function readPendingHandoffs(cacheDir: string): PendingHandoffStore {
  try {
    const raw = readFileSync(pendingHandoffsPath(cacheDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<PendingHandoffStore>;
    if (Array.isArray(parsed.requests)) {
      return {
        requests: parsed.requests.filter(
          (r) => typeof r.taskId === "string" && typeof r.runId === "string" && typeof r.branch === "string" && typeof r.workdir === "string",
        ),
      };
    }
  } catch {
    /* missing or corrupt — start fresh */
  }
  return { requests: [] };
}

/** Persist the pending handoff store atomically (best-effort). */
function writePendingHandoffs(cacheDir: string, store: PendingHandoffStore): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const file = pendingHandoffsPath(cacheDir);
    const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");
      renameSync(temp, file);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  } catch {
    /* best-effort */
  }
}

/** Read the durable registry; returns empty when missing or corrupted. */
function readRegistry(cacheDir: string): DurableRegistry {
  try {
    const raw = readFileSync(registryPath(cacheDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<DurableRegistry>;
    if (Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.filter((e) => typeof e.taskId === "string" && typeof e.pid === "number" && typeof e.workdir === "string") };
    }  } catch {
    /* missing or corrupt — start fresh */
  }
  return { entries: [] };
}

/** Persist the durable registry atomically (best-effort). */
function writeRegistry(cacheDir: string, registry: DurableRegistry): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const file = registryPath(cacheDir);
    const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(registry, null, 2), "utf8");
      renameSync(temp, file);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Default silence window before a still-running turn is flagged as possibly
 * stalled (0080). Conservative on purpose: silence alone is never proof of a
 * hang (the agent could just be thinking through a slow step), so this only
 * fires a neutral "may be stalled" warning, never a definitive "it's dead."
 * `AgentRunner`'s constructor accepts an override for tests.
 */
export const DEFAULT_STALL_TIMEOUT_MS = 90_000;

/**
 * Estimate cost from token count when the CLI doesn't report it explicitly.
 * Uses rough pricing for common models: claude 3.5 sonnet $3/M input, $15/M output.
 * This is a fallback when extractUsage yields no cost; never fabricates when
 * the CLI provides no data at all.
 */
export function estimateCostUsd(tokens?: number): number | undefined {
  if (!tokens || tokens < 1) return undefined;
  const avgCostPerToken = (3 + 15) / 2 / 1_000_000;
  return Math.max(0.001, tokens * avgCostPerToken);
}

/**
 * Best-effort usage/cost extraction from one raw output line. Tries a JSON
 * parse first (codex `--json` usage events, opencode payloads carrying usage)
 * and falls back to plain-text patterns (the kind of human-readable summary
 * claude/qwen print). Returns only the fields it actually found — this must
 * never fabricate a number for a CLI that reports nothing.
 */
export function extractUsage(raw: string): { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number } {
  const out: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number } = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const inputTokens = inputTokensFromObject(obj);
      if (inputTokens !== undefined) out.inputTokens = inputTokens;
      const outputTokens = outputTokensFromObject(obj);
      if (outputTokens !== undefined) out.outputTokens = outputTokens;
      const totalTokens = tokensFromObject(obj);
      if (totalTokens !== undefined) out.totalTokens = totalTokens;
      const cost = costFromObject(obj);
      if (cost !== undefined) out.costUsd = cost;
    }
  } catch {
    /* not JSON — fall through to text patterns below */
  }
  if (out.totalTokens === undefined) {
    const m = raw.match(/\btotal[_ ]tokens\b["'\s:=]+([\d,]+)/i) ?? raw.match(/\b([\d,]+)\s+tokens\b/i);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) out.totalTokens = n;
    }
  }
  if (out.costUsd === undefined) {
    const m =
      raw.match(/total cost[:\s]+\$?([\d.]+)/i) ?? raw.match(/\bcost_usd\b["'\s:=]+\$?([\d.]+)/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.costUsd = n;
    }
  }
  // Kiro CLI emits a credits footer on stderr: " ▸ Credits: 0.15 • Time: 12s"
  // Map credits → costUsd so the task panel shows the charge. Note: for Kiro
  // sessions, costUsd holds credits (Kiro's billing unit), not US dollars.
  if (out.costUsd === undefined) {
    const m = raw.match(/▸\s*Credits:\s*([\d.]+)/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.costUsd = n;
    }
  }
  return out;
}

/**
 * Fold usage/cost found in a raw output line into a running total, clamped to
 * never move backward (some CLIs report a running total, some reset per turn).
 * Mirrors `AgentRunner.applyUsage` so one-shot roles aggregate the same way the
 * streaming engineer runner does. Never fabricates a number — absent fields are
 * simply left untouched.
 */
export function foldUsage(
  total: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number },
  raw: string,
): void {
  const found = extractUsage(raw);
  if (found.inputTokens !== undefined) total.inputTokens = Math.max(total.inputTokens ?? 0, found.inputTokens);
  if (found.outputTokens !== undefined) total.outputTokens = Math.max(total.outputTokens ?? 0, found.outputTokens);
  if (found.totalTokens !== undefined) total.totalTokens = Math.max(total.totalTokens ?? 0, found.totalTokens);
  if (found.costUsd !== undefined) total.costUsd = Math.max(total.costUsd ?? 0, found.costUsd);
}

/**
 * Classify the cost source for a recorded session (0230). Authoritative
 * CLI-reported cost wins; Kiro is flagged as its own unit (credits), never
 * passed off as USD. Callers that compute a token-based estimate (the engineer
 * runner) set `costSource` to "estimate" themselves — this only reports whether
 * a real CLI figure was present.
 */
export function usageCostSource(
  agent: Agent,
  usage: { costUsd?: number },
): string {
  if (usage.costUsd) return agent.cli === "kiro" ? "kiro-credits" : "extractUsage";
  return "none";
}

/**
 * Map a runner session key to the REAL task id it belongs to (0230). Engineer
 * and review sessions are keyed by the task id directly. PM chats are keyed by
 * a synthetic `pm-task-v2:<id>` id whose suffix is the actual task — attribute
 * them under that real id so PM cost/tokens aggregate per-task. Non-task chats
 * (guide) have no task and return null. Per-user PM sessions (0248) append
 * `::<email>` after the task id; that suffix is stripped here too so cost
 * attribution doesn't treat "<id>::<email>" as the task id.
 */
export function resolveSessionTaskId(taskKey: string | undefined): string | null {
  if (!taskKey) return null;
  // Each alternative has a strict literal prefix so nothing else is captured;
  // covers the current `pm-task-v2:<id>` scheme (with or without a `::<email>`
  // per-user suffix) and the legacy `pm-task:<id>` / `pm:<id>` forms, without
  // mis-parsing their suffixes (0230 / review).
  const pm =
    taskKey.match(/^pm-task-v2:([^:]+)(?:::.*)?$/i) ??
    taskKey.match(/^pm-task:(.+)$/i) ??
    taskKey.match(/^pm:(.+)$/i);
  if (pm) return pm[1] || null;
  // Durable review sessions are keyed by `review:<taskId>` (0288); strip the
  // prefix so any DB attribution lands on the real task.
  if (/^review:/i.test(taskKey)) return taskKey.replace(/^review:/i, "") || null;
  return taskKey;
}

/** Input tokens from a `usage`-shaped JSON object, or undefined if absent. */
function inputTokensFromObject(obj: Record<string, unknown>): number | undefined {
  const usage = findUsage(obj);
  if (usage && typeof usage.input_tokens === "number") return usage.input_tokens;
  return undefined;
}

/** Output tokens from a `usage`-shaped JSON object, or undefined if absent. */
function outputTokensFromObject(obj: Record<string, unknown>): number | undefined {
  const usage = findUsage(obj);
  if (usage && typeof usage.output_tokens === "number") return usage.output_tokens;
  return undefined;
}

/**
 * Locate a `usage`-shaped block: top-level (codex `usage` events and claude's
 * terminal `result`) or nested at `message.usage` (claude per-`assistant`
 * events, 0109). Also recognizes opencode's `step_finish` shape, whose tokens
 * live at `part.tokens.{total,input,output}` and cost at `part.cost` — a
 * different field layout entirely, normalized here to the `input_tokens` /
 * `output_tokens` / `total_tokens` / `cost_usd` names the callers expect.
 */
function findUsage(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  if (obj.usage && typeof obj.usage === "object") return obj.usage as Record<string, unknown>;
  const msg = obj.message;
  if (msg && typeof msg === "object") {
    const m = msg as Record<string, unknown>;
    if (m.usage && typeof m.usage === "object") return m.usage as Record<string, unknown>;
  }
  const part = obj.part;
  if (part && typeof part === "object") {
    const p = part as Record<string, unknown>;
    const tokens = p.tokens;
    if (tokens && typeof tokens === "object") {
      const t = tokens as Record<string, unknown>;
      return {
        ...(typeof t.input === "number" ? { input_tokens: t.input } : {}),
        ...(typeof t.output === "number" ? { output_tokens: t.output } : {}),
        ...(typeof t.total === "number" ? { total_tokens: t.total } : {}),
        ...(typeof p.cost === "number" ? { cost_usd: p.cost } : {}),
      };
    }
  }
  return undefined;
}

/**
 * Token count from a `usage`-shaped JSON object, or undefined if absent.
 *
 * Only billable input+output (or an explicit `total_tokens`) count toward the
 * headline number: claude's `cache_creation_input_tokens` / `cache_read_input_tokens`
 * bill at different rates, so summing them into the same "tokens" figure would
 * be fabricated precision (0109). The terminal `result` event reports the
 * authoritative turn total, so the running figure converges on it.
 */
function tokensFromObject(obj: Record<string, unknown>): number | undefined {
  const usage = findUsage(obj);
  if (usage) {
    if (typeof usage.total_tokens === "number") return usage.total_tokens;
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    if (input || output) return input + output;
  }
  if (typeof obj.total_tokens === "number") return obj.total_tokens;
  return undefined;
}

/** Cost (USD) from a `usage`-shaped JSON object, or undefined if absent. */
function costFromObject(obj: Record<string, unknown>): number | undefined {
  // claude's terminal `result` event reports the authoritative per-turn cost.
  if (typeof obj.total_cost_usd === "number") return obj.total_cost_usd;
  if (typeof obj.cost_usd === "number") return obj.cost_usd;
  const usage = findUsage(obj);
  if (usage) {
    if (typeof usage.cost_usd === "number") return usage.cost_usd;
    if (typeof usage.total_cost_usd === "number") return usage.total_cost_usd;
  }
  return undefined;
}

/** On-disk transcript schema. Bump when persisted fields change incompatibly. */
const SESSION_FILE_VERSION = 1;
const SESSION_WRITE_DELAY_MS = 500;
const SESSION_RETENTION_DAYS = 30;
const SESSION_RETENTION_COUNT = 1000;

interface PersistedSession {
  version: typeof SESSION_FILE_VERSION;
  lines: AgentOutputEntry[];
  sessionId?: string;
  engine: Session["engine"];
  workdir?: string;
  createdAt?: string;
  completedAt?: string;
  updatedAt: string;
  /** Agent config name (e.g. "engineer", "reviewer") — see Session.agent. */
  agent?: string;
  /** Model name — see Session.model. */
  model?: string;
}

export interface AgentRunnerOptions {
  /** Test/embedding overrides; production defaults are the documented policy. */
  writeDelayMs?: number;
  retentionDays?: number;
  retentionCount?: number;
  now?: () => Date;
  /** Resolve a task from the repo task index by ID. Used to populate task/branch on resume turns. */
  getTask?: (taskId: string) => Task | null;
}

/** Best-effort session-id extraction from agent output (opencode / claude). */
const SESSION_ID_PATTERNS: RegExp[] = [
  /"session_id"\s*:\s*"([^"]+)"/,
  /session[ \t]+id[:\s]*["']?([A-Za-z0-9][A-Za-z0-9_.-]{5,})/i,
];

/**
 * Which structured-event engine (if any) a session should use for a CLI. Both
 * structured engines parse newline-delimited JSON events; they differ only in
 * event shape (`part` vs `message.content[]`), so each gets its own parser
 * branch in `appendLine`.
 */
function engineForCli(cli: string): Session["engine"] {
  if (cli === "claude code") return "claude";
  if (cli === "github copilot") return "copilot";
  if (cli === "qwen code") return "qwen";
  if (cli === "codex") return "codex";
  if (cli === "kiro") return "kiro";
  return "opencode";
}

/** The opencode `--format json` event fields we consume. */
interface OpenCodeEvent {
  type?: unknown;
  sessionID?: unknown;
  path?: unknown;
  part?: {
    text?: unknown;
    tool?: unknown;
    reason?: unknown;
    path?: unknown;
    state?: { status?: unknown; input?: unknown; output?: unknown; error?: unknown };
  };
  error?: { name?: unknown; data?: { message?: unknown } };
}

/**
 * Render a tool input as display text: a bash call shows its command, an
 * object input becomes pretty JSON, and strings pass through untouched.
 */
function toolInputText(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input === undefined || input === null) return undefined;
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string" && obj.command) return obj.command;
    try {
      const s = JSON.stringify(obj, null, 2);
      return s && s !== "{}" ? s : undefined;
    } catch {
      return String(input);
    }
  }
  return String(input);
}

/**
 * Render a tool output as display text: strings pass through untouched and
 * object outputs become pretty JSON. Falls back to the error payload when the
 * call failed.
 */
function toolOutputText(output: unknown): string | undefined {
  if (typeof output === "string" && output) return output;
  if (output === undefined || output === null) return undefined;
  if (typeof output === "object") {
    try {
      const s = JSON.stringify(output, null, 2);
      return s && s !== "{}" ? s : undefined;
    } catch {
      return String(output);
    }
  }
  const s = String(output);
  return s ? s : undefined;
}

/**
 * Parse one line of opencode's `--format json` stream into a structured
 * transcript entry. Returns null for malformed lines and for event types we
 * don't surface (session-id, title, reasoning, …) — callers fall back to the
 * plain-line handling in those cases.
 */
export function parseJsonEvent(
  raw: string,
): { entry: AgentOutputEntry; sessionID?: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const ev = parsed as OpenCodeEvent;
  const type = typeof ev.type === "string" ? ev.type : "";
  if (!type) return null;
  const sessionID =
    typeof ev.sessionID === "string" && ev.sessionID ? ev.sessionID : undefined;
  const part = ev.part ?? {};

  switch (type) {
    case "text": {
      const text = typeof part.text === "string" ? part.text : "";
      if (!text.trim()) return null;
      return { entry: { type: "text", text }, sessionID };
    }
    case "tool_use": {
      const tool = typeof part.tool === "string" ? part.tool : "";
      if (!tool) return null;
      const state = part.state ?? {};
      const status = typeof state.status === "string" ? state.status : undefined;
      const input = toolInputText(state.input);
      const output = toolOutputText(state.output ?? state.error);
      return {
        entry: {
          type: "tool",
          tool,
          ...(input ? { input } : {}),
          ...(output ? { output } : {}),
          ...(status ? { state: status } : {}),
        },
        sessionID,
      };
    }
    case "step_start":
      return { entry: { type: "step", kind: "start", at: now() }, sessionID };
    case "step_finish":
      return {
        entry: {
          type: "step",
          kind: "finish",
          at: now(),
          ...(typeof part.reason === "string" && part.reason
            ? { reason: part.reason }
            : {}),
        },
        sessionID,
      };
    case "error": {
      const err = ev.error ?? {};
      const data = err.data ?? {};
      const msg =
        typeof data.message === "string" && data.message
          ? data.message
          : typeof err.name === "string" && err.name
            ? err.name
            : "";
      if (!msg) return null;
      return { entry: { type: "sys", d: `error: ${msg}` }, sessionID };
    }
    case "file-update": {
      // Older opencode emitted file-write events directly; surface the path.
      const path =
        typeof ev.path === "string" && ev.path
          ? ev.path
          : typeof part.path === "string"
            ? part.path
            : "";
      if (!path) return null;
      return { entry: { type: "sys", d: `✎ ${path}` }, sessionID };
    }
    default:
      return null;
  }
}

/**
 * Result of parsing one line of claude code's `--output-format stream-json`
 * stream (0109). Fields are mutually exclusive:
 *
 * - `entry` — a ready-to-surface transcript entry (assistant text, a completed
 *   tool call, or a step boundary).
 * - `pendingTool` — a `tool_use` whose `tool_result` hasn't arrived yet. The
 *   line has no entry yet; the runner buffers it and emits the tool card only
 *   when the matching `tool_result` line arrives (name + input + output
 *   together).
 * - `toolResult` — a `tool_result` line to attach to the buffered tool.
 * - `sessionID` — the `system/init` event's real `session_id` field (never
 *   regex-scraped).
 *
 * `null` means the line is not a claude stream event (a non-JSON warning line,
 * unknown JSON schema, …) — callers fall back to the plain-line path.
 */
export interface ClaudeParseResult {
  entry?: AgentOutputEntry;
  sessionID?: string;
  pendingTool?: { id: string; name: string; input?: string };
  toolResult?: { id: string; content?: string; isError?: boolean };
}

/** The claude stream-json event fields we consume. */
interface ClaudeEvent {
  type?: unknown;
  subtype?: unknown;
  session_id?: unknown;
  message?: { content?: unknown };
}

/** A single block inside `message.content` (text / tool_use / tool_result / …). */
interface ClaudeContentBlock {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  is_error?: unknown;
}

/** Render a claude tool_result `content` (string or a list of text blocks). */
function toolResultText(content: unknown): string | undefined {
  if (typeof content === "string" && content) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((b): b is ClaudeContentBlock => !!b && typeof b === "object")
      .map((b) => (typeof b.text === "string" ? b.text : ""))
      .join("\n");
    return text || undefined;
  }
  if (typeof content === "object" && content !== null) {
    try {
      const s = JSON.stringify(content);
      return s && s !== "{}" ? s : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** A claude `assistant` event's first surfaceable content block, if any. */
function claudeAssistantEntry(
  content: ClaudeContentBlock[],
):
  | { entry: AgentOutputEntry }
  | { pendingTool: { id: string; name: string; input?: string } }
  | null {
  for (const block of content) {
    if (typeof block.type !== "string") continue;
    if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text : "";
      if (!text.trim()) continue;
      return { entry: { type: "text", text } };
    }
    if (block.type === "tool_use") {
      const id = typeof block.id === "string" ? block.id : "";
      const name = typeof block.name === "string" ? block.name : "";
      if (!id || !name) continue;
      const input = toolInputText(block.input);
      return { pendingTool: { id, name, ...(input ? { input } : {}) } };
    }
    // thinking / unknown blocks are not surfaced — same policy as opencode's
    // reasoning events. Swallowed by the caller, never dumped as raw JSON.
  }
  return null;
}

/**
 * Parse one line of claude code's `--output-format stream-json` stream into a
 * structured transcript result. Mirrors `parseJsonEvent` for opencode but with
 * claude's event shapes: content is nested under `message.content[]` (not
 * `part`), the session id is a real `session_id` field on `system/init`, and
 * tool results arrive as separate `user` events. Recognized-but-voiceless
 * events (rate_limit, thinking-only assistant messages, the terminal `result`)
 * are returned without an `entry` so the runner swallows them instead of
 * dumping raw JSON into the transcript. `null` for anything else — callers
 * fall back to the plain-line path.
 */
export function parseClaudeEvent(raw: string): ClaudeParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const ev = parsed as ClaudeEvent;
  const type = typeof ev.type === "string" ? ev.type : "";
  if (!type) return null;
  const sessionID =
    typeof ev.session_id === "string" && ev.session_id ? ev.session_id : undefined;
  const content = Array.isArray(ev.message?.content)
    ? (ev.message.content as ClaudeContentBlock[])
    : [];

  switch (type) {
    case "system": {
      const subtype = typeof ev.subtype === "string" ? ev.subtype : "";
      if (subtype === "init") {
        // The stream's real session id lives here; the runner captures it for
        // `--resume` on follow-up turns instead of regex-scraping prose.
        return { sessionID };
      }
      if (subtype === "thinking_tokens") {
        // A thinking phase begins — a step boundary the UI renders as a start
        // marker (visually dropped in favor of a quiet timeline).
        return { entry: { type: "step", kind: "start", at: now() }, sessionID };
      }
      if (subtype === "post_turn_summary") {
        // The turn's work is done — the boundary before the `result` line.
        return { entry: { type: "step", kind: "finish", at: now() }, sessionID };
      }
      // Unknown system subtypes: swallow, don't dump.
      return { sessionID };
    }
    case "assistant": {
      const surfaced = claudeAssistantEntry(content);
      if (surfaced) return { ...surfaced, sessionID };
      // Thinking-only (or empty) assistant events are voiceless — swallow.
      return { sessionID };
    }
    case "user": {
      for (const block of content) {
        if (typeof block.type !== "string" || block.type !== "tool_result") continue;
        const id = typeof block.tool_use_id === "string" ? block.tool_use_id : "";
        if (!id) continue;
        const contentText = toolResultText(block.content);
        return {
          toolResult: {
            id,
            ...(contentText ? { content: contentText } : {}),
            ...(block.is_error === true ? { isError: true } : {}),
          },
          sessionID,
        };
      }
      return { sessionID };
    }
    case "result": {
      // Authoritative usage/cost totals — consumed by extractUsage on the raw
      // line; the `result` text duplicates the final assistant text, so it is
      // never surfaced as its own entry.
      return { sessionID };
    }
    case "rate_limit_event":
      return { sessionID };
    case "stream_event": {
      // Anthropic API streaming events wrapped by claude code CLI (0151).
      // These are intermediate streaming updates (content_block_delta,
      // content_block_stop, etc.) that are not surfaced as their own entries —
      // they are aggregated by the API layer and only the final "message" or
      // "assistant" event is rendered to the transcript. Swallow them here with
      // the session id extracted from the outer wrapper.
      const streamSessionId = typeof ev.session_id === "string" && ev.session_id ? ev.session_id : undefined;
      return { sessionID: streamSessionId };
    }
    default:
      return null;
  }
}

/** The Copilot CLI JSONL event fields consumed by the task transcript. */
interface CopilotEvent {
  type?: unknown;
  data?: {
    content?: unknown;
    deltaContent?: unknown;
    toolName?: unknown;
    tool?: unknown;
    arguments?: unknown;
    input?: unknown;
    result?: unknown;
    output?: unknown;
    error?: unknown;
    message?: unknown;
  };
  sessionId?: unknown;
}

/** Text-bearing values in Copilot tool results and error payloads. */
function copilotText(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of ["content", "text", "message", "error"]) {
    if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
  }
  return toolOutputText(value);
}

/**
 * Parse Copilot CLI's `--output-format json` JSONL stream. The CLI emits
 * lifecycle telemetry alongside assistant and tool events; lifecycle records
 * are recognized and swallowed so the Agent tab remains a useful transcript.
 */
export function parseCopilotEvent(
  raw: string,
): { entry?: AgentOutputEntry; sessionID?: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const event = parsed as CopilotEvent;
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) return null;
  const data = event.data ?? {};
  const sessionID = typeof event.sessionId === "string" && event.sessionId
    ? event.sessionId
    : undefined;

  if (type === "assistant.message_delta") return { sessionID };
  if (type === "assistant.message") {
    const text = typeof data.content === "string" ? data.content : "";
    return text ? { entry: { type: "text", text }, sessionID } : { sessionID };
  }

  if (type === "tool.execution_start") {
    const tool = typeof data.toolName === "string"
      ? data.toolName
      : typeof data.tool === "string"
        ? data.tool
        : "";
    if (!tool) return { sessionID };
    const input = toolInputText(data.arguments ?? data.input);
    return {
      entry: { type: "tool", tool, ...(input ? { input } : {}), state: "running" },
      sessionID,
    };
  }

  if (type === "tool.execution_complete") {
    const tool = typeof data.toolName === "string"
      ? data.toolName
      : typeof data.tool === "string"
        ? data.tool
        : "tool";
    const input = toolInputText(data.arguments ?? data.input);
    const output = copilotText(data.result ?? data.output ?? data.error);
    return {
      entry: {
        type: "tool",
        tool,
        ...(input ? { input } : {}),
        ...(output ? { output } : {}),
        ...(data.error ? { state: "error" } : { state: "completed" }),
      },
      sessionID,
    };
  }

  if (type === "error" || type.endsWith(".error")) {
    const message = copilotText(data.error ?? data.message ?? data);
    return message ? { entry: { type: "sys", d: `error: ${message}` }, sessionID } : { sessionID };
  }

  if (
    type === "result" ||
    type.startsWith("session.") ||
    type.startsWith("model.") ||
    type.startsWith("mcp.")
  ) return { sessionID };
  return null;
}

/**
 * Qwen's stream-json is Claude-compatible for assistant/tool content, but
 * versions in the wild also emit the shorter `{type, content}` form. Keep
 * this adapter deliberately tolerant so a CLI upgrade cannot turn the chat
 * into a wall of JSON.
 */
export function parseQwenEvent(raw: string): ClaudeParseResult | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const sessionID =
    typeof event.session_id === "string" ? event.session_id :
    typeof event.sessionId === "string" ? event.sessionId : undefined;
  const type = typeof event.type === "string" ? event.type : "";
  if (!type) return null;
  const message = event.message && typeof event.message === "object"
    ? (event.message as Record<string, unknown>)
    : undefined;
  const content = Array.isArray(message?.content)
    ? message.content as ClaudeContentBlock[]
    : typeof event.content === "string"
      ? [{ type: "text", text: event.content }]
      : [];
  if (type === "system" || type === "session_start" || type === "session_started") {
    return { sessionID };
  }
  if (type === "assistant" || type === "message" || type === "assistant_message") {
    const surfaced = claudeAssistantEntry(content);
    return surfaced ? { ...surfaced, sessionID } : { sessionID };
  }
  if (type === "content_block_delta" || type === "message_delta") {
    const delta = event.delta && typeof event.delta === "object"
      ? event.delta as Record<string, unknown>
      : undefined;
    const text = typeof delta?.text === "string" ? delta.text :
      typeof event.text === "string" ? event.text : "";
    return text ? { entry: { type: "text", text }, sessionID } : { sessionID };
  }
  if (type === "user") {
    for (const block of content) {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
      return {
        toolResult: {
          id: block.tool_use_id,
          ...(toolResultText(block.content) ? { content: toolResultText(block.content) } : {}),
          ...(block.is_error === true ? { isError: true } : {}),
        },
        sessionID,
      };
    }
  }
  if (content.length) {
    const surfaced = claudeAssistantEntry(content);
    return surfaced ? { ...surfaced, sessionID } : { sessionID };
  }
  if (["result", "turn_complete", "turn.completed", "rate_limit_event"].includes(type)) {
    return { sessionID };
  }
  return null;
}

interface CodexEventResult {
  entry?: AgentOutputEntry;
  sessionID?: string;
}

/** Parse Codex `exec --json` JSONL into the same chat cards as OpenCode. */
export function parseCodexEvent(raw: string): CodexEventResult | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  const sessionID =
    typeof event.thread_id === "string" ? event.thread_id :
    typeof event.session_id === "string" ? event.session_id : undefined;
  if (!type) return null;
  const item = event.item && typeof event.item === "object"
    ? event.item as Record<string, unknown>
    : undefined;
  if (type === "thread.started") return { sessionID };
  if (type === "item.updated" && typeof event.delta === "string") {
    return event.delta.trim() ? { entry: { type: "text", text: event.delta }, sessionID } : { sessionID };
  }
  if (type === "error" || type === "turn.failed") {
    const message = typeof event.message === "string" ? event.message :
      typeof event.error === "string" ? event.error : undefined;
    return message ? { entry: { type: "sys", d: `error: ${message}` }, sessionID } : { sessionID };
  }
  if (!item) return { sessionID };
  const itemType = typeof item.type === "string" ? item.type : "";
  if (itemType === "agent_message") {
    const text = typeof item.text === "string" ? item.text :
      typeof item.delta === "string" ? item.delta : "";
    return text.trim() ? { entry: { type: "text", text }, sessionID } : { sessionID };
  }
  if (itemType === "command_execution") {
    const command = typeof item.command === "string" ? item.command : undefined;
    const output = typeof item.aggregated_output === "string" ? item.aggregated_output :
      typeof item.output === "string" ? item.output : undefined;
    const state = typeof item.status === "string" ? item.status :
      typeof item.exit_code === "number" ? (item.exit_code === 0 ? "completed" : "error") : undefined;
    return {
      entry: {
        type: "tool",
        tool: "shell",
        ...(command ? { input: command } : {}),
        ...(output ? { output } : {}),
        ...(state ? { state } : {}),
      },
      sessionID,
    };
  }
  if (itemType === "file_change" || itemType === "file_changes") {
    const changes = item.changes ?? item.files;
    const detail = typeof changes === "string" ? changes : toolOutputText(changes);
    return { entry: { type: "tool", tool: "file changes", ...(detail ? { output: detail } : {}) }, sessionID };
  }
  return { sessionID };
}

/** Byte estimate of one entry, for the transcript cap. */
function entryBytes(e: AgentOutputEntry): number {
  const legacy = e as { d?: string };
  if (typeof legacy.d === "string") return legacy.d.length + 1;
  return JSON.stringify(e).length + 1;
}

/** Branch derived from a task title, mirroring the UI's `feat/<slug>` rule. */
export function deriveBranch(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `feat/${slug || "task"}`;
}

/**
 * Role-name matching is case-insensitive: the Agents page stores agent names
 * verbatim (it only lowercases when checking duplicates), so a stored
 * `"CTO"`/`"Reviewer"`/`"PM"` must still resolve to its role. This bit the CTO
 * (0174): the merged `repoos.toml` stored `name = "CTO"`, so the exact-match
 * `"cto"` lookup always returned null and the agent read as permanently
 * disabled.
 */
function matchesRole(a: { name: string }, role: string): boolean {
  return a.name.toLowerCase() === role;
}

/** Resolve the enabled `engineer` agent, or null when none is configured. */
export function resolveEngineer(config: RepoOSConfig): Agent | null {
  const list = agentsForConfig(config);
  return list.find((a) => a.enabled && matchesRole(a, "engineer")) ?? null;
}

/** Resolve the enabled `pm` agent, or null when none is configured. */
export function resolvePmAgent(config: RepoOSConfig): Agent | null {
  const list = agentsForConfig(config);
  return list.find((a) => a.enabled && matchesRole(a, "pm")) ?? null;
}

/**
 * Resolve the enabled `reviewer` agent, or null when it is disabled/absent.
 *
 * This is the single source of truth for whether a task landing in `review`
 * gets an automatic agent review (0101): the Agents page writes the toggle
 * into `repoos.toml`, and null here means "no agent review runs".
 */
export function resolveReviewer(config: RepoOSConfig): Agent | null {
  const list = agentsForConfig(config);
  return list.find((a) => a.enabled && matchesRole(a, "reviewer")) ?? null;
}

/**
 * Resolve the reviewer agent for a specific task, honoring per-task review
 * overrides (set via the Review tab's selector, like Dev/PM overrides).
 *
 * When the task has no review override, this behaves exactly as the global
 * `resolveReviewer` — the Agents-page reviewer. When a `reviewAgentOverride`
 * is set, the enabled agent with that name is used (falling back to the global
 * reviewer base when only CLI/model are overridden); `reviewCliOverride` /
 * `reviewModelOverride` then replace the agent's CLI and model.
 */
export function resolveReviewerForTask(config: RepoOSConfig, task: Task): Agent | null {
  const modelPinned = isModelOverridePinned(task.reviewModelOverride);
  const hasOverride = task.reviewAgentOverride || task.reviewCliOverride || modelPinned;
  if (!hasOverride) {
    return resolveReviewer(config);
  }
  const list = agentsForConfig(config);
  const baseName = task.reviewAgentOverride || "reviewer";
  const base = list.find((a) => a.enabled && matchesRole(a, baseName)) ?? null;
  if (!base) return null;
  return {
    ...base,
    ...(task.reviewCliOverride ? { cli: task.reviewCliOverride } : {}),
    ...(modelPinned ? { model: task.reviewModelOverride as string } : {}),
  };
}

export function resolveCto(config: RepoOSConfig): Agent | null {
  const list = agentsForConfig(config);
  return list.find((a) => a.enabled && matchesRole(a, "cto")) ?? null;
}

/**
 * Resolve the agent for a specific task, honoring per-task overrides.
 *
 * When the task has an `agentOverride`, the enabled agent with that name is
 * used (falling back to the base agent when the override name matches). When
 * only `cliOverride` or `modelOverride` are set (without a different agent
 * name), the base agent's name and instructions are kept but cli/model are
 * overridden.
 *
 * @param config  Global config (provides the agents list and defaults).
 * @param task    The task being run (may carry overrides).
 * @param role    The role to resolve when no agent override is set (default: "engineer").
 * @returns A merged Agent, or null when no matching enabled agent exists.
 */
/**
 * True when a model-override field carries a real pin, not the "default"
 * sentinel `AGENT_MODELS` offers for "use the base agent's own configured
 * model, whatever that is" (config.ts). Every per-task model-override
 * resolver (this file's `resolveAgentForTask`/`resolveReviewerForTask`, and
 * routes/tasks.ts's inline PM-override logic) MUST run the override string
 * through this before treating it as active — bare truthiness treats the
 * literal string `"default"` as a real pin and force-overwrites the base
 * agent's actual configured model with the string `"default"`, which then
 * skips `--model` entirely (see `modelArgs` below) and falls back to the
 * underlying CLI's own raw default — NOT the model configured on the
 * Agents page. Confirmed live: tasks kept ending up running
 * opencode+(no model flag) instead of the configured model every time a
 * Dev/Review/PM override dropdown was left on (or reset to) "Default".
 */
export function isModelOverridePinned(model: string | null | undefined): boolean {
  return !!model && model !== "default";
}

export function resolveAgentForTask(
  config: RepoOSConfig,
  task: Task,
  role: string = "engineer",
): Agent | null {
  const list = agentsForConfig(config);
  const modelPinned = isModelOverridePinned(task.modelOverride);
  const hasOverride = task.agentOverride || task.cliOverride || modelPinned;
  if (!hasOverride) {
    return list.find((a) => a.enabled && a.name === role) ?? null;
  }

  // Resolve the base agent: use the override name if set, else the role.
  const baseName = task.agentOverride || role;
  const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
  if (!base) return null;

  // Merge overrides onto the base agent.
  return {
    ...base,
    ...(task.cliOverride ? { cli: task.cliOverride } : {}),
    ...(modelPinned ? { model: task.modelOverride as string } : {}),
  };
}

/** Resolve the enabled built-in repository assistant (by current "Ross" name or legacy "RepoOS Guide"). */
export function resolveRepoGuide(config: RepoOSConfig): Agent | null {
  const agents = agentsForConfig(config);
  return agents.find(
    (agent) =>
      agent.enabled &&
      (agent.name.toLowerCase() === "ross" ||
        agent.name.toLowerCase() === "repoos guide"),
  ) ?? null;
}

/**
 * Map an agent `cli` string to the binary + args that run it headless.
 *
 * opencode re-resolves its project directory from `--git-common-dir`, which
 * for a linked worktree points at the main repo's `.git` — so every worktree
 * path would be treated as `external_directory` and auto-rejected. `--dir`
 * forces the worktree path explicitly. claude code and qwen code use the spawn
 * `cwd` and need no flag.
 *
 * Verified flags (0042/0043):
 * - claude code: `claude -p <prompt> --output-format stream-json --verbose
 *   --dangerously-skip-permissions` (print mode, 0109). stream-json emits one
 *   JSON event per line (assistant text, tool calls, results) that streams
 *   live instead of claude buffering all stdout until exit — the #0070/#0101/
 *   #0080 blank-Agent-tab fix. `--verbose` is required alongside stream-json
 *   in print mode. The permission flag is REQUIRED here, not optional: the
 *   agent is spawned with stdin ignored, so no approval prompt can ever reach
 *   a human. Without it every non-read-only command (`bun`, `repoos check`,
 *   writes) is denied instantly, the agent stalls explaining it needs
 *   approval, and the task is left stuck in `active` with no changes. Same
 *   intent as codex's `--sandbox workspace-write` below; the blast radius is
 *   the task's own git worktree.
 * - qwen code: `qwen -p <prompt> --output-format stream-json` — stream-json
 *   emits one JSON event per line, which streams live and carries a
 *   `session_id` RepoOS can resume.
 * - codex: `codex exec <prompt> --json --sandbox workspace-write` — `--json`
 *   streams newline-delimited events; `--sandbox workspace-write` lets the
 *   agent edit files inside the worktree (the default is read-only).
 * - opencode: `opencode run --format json --dir <cwd> --auto <prompt>` —
 *   `--auto` ("auto-approve permissions that are not explicitly denied") is
 *   REQUIRED for the same reason claude's flag is: stdin is ignored, so a
 *   permission prompt can never be answered. Without it, opencode blocks on
 *   its first gated tool call and hangs indefinitely — confirmed live on
 *   #0069, which sat at ~1% CPU with zero commits for ~2 hours before being
 *   killed. Same blast radius as the other engines: the task's own worktree.
 */
function modelArgs(cli: string, model: string): string[] {
  if (!model || model === "default") return [];
  if (cli === "codex") return ["--model", model];
  return ["--model", model];
}

const COPILOT_TOOL_PERMISSIONS = [
  "--allow-tool", "write",
  "--allow-tool", "shell(bun:*)",
  "--allow-tool", "shell(node:*)",
  "--allow-tool", "shell(npm:*)",
  "--allow-tool", "shell(npx:*)",
  "--allow-tool", "shell(git:*)",
  "--allow-tool", "shell(curl:*)",
  "--allow-tool", "shell(ls)",
  "--allow-tool", "shell(cat)",
] as const;

function copilotArgs(options: { write: boolean }): string[] {
  return [
    "--output-format", "json",
    "--no-ask-user",
    "--no-auto-update",
    "--no-remote",
    "--no-remote-export",
    ...(options.write ? COPILOT_TOOL_PERMISSIONS : []),
  ];
}

function cliCommand(agent: Agent, mission: string, cwd: string): { cmd: string; args: string[] } {
  const { cli, model } = agent;
  if (cli === "claude code") {
    return {
      cmd: "claude",
      args: [
        "-p",
        mission,
        ...modelArgs(cli, model),
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
    };
  }
  if (cli === "qwen code") {
    return { cmd: "qwen", args: ["-p", mission, ...modelArgs(cli, model), "--output-format", "stream-json", "--include-partial-messages"] };
  }
  if (cli === "codex") {
    return { cmd: "codex", args: ["exec", mission, ...modelArgs(cli, model), "--json", "--sandbox", "workspace-write"] };
  }
  if (cli === "github copilot") {
    return {
      cmd: "copilot",
      args: ["-p", mission, ...modelArgs(cli, model), ...copilotArgs({ write: true })],
    };
  }
  if (cli === "kiro") {
    // --no-interactive: headless mode (no TUI, answer is printed to stdout).
    // --trust-all-tools: REQUIRED — stdin is ignored so no approval prompt can
    // ever be answered. Without it every file write/shell call is denied and
    // the agent stalls. Same blast radius as claude's --dangerously-skip-permissions:
    // the task's own git worktree.
    return {
      cmd: "kiro-cli",
      args: ["chat", "--no-interactive", "--trust-all-tools", ...modelArgs(cli, model), mission],
    };
  }
  // default: opencode's headless `run` mode. `--format json` streams one JSON
  // event per line (step_start / text / tool_use / step_finish / error) that
  // the runner parses into structured transcript entries. `--dir` (0044) keeps
  // the worktree path explicit so linked-worktree paths are never auto-rejected.
  return {
    cmd: "opencode",
    args: ["run", "--format", "json", "--dir", cwd, ...modelArgs(cli, model), "--auto", mission],
  };
}

/**
 * Map a follow-up turn to a resume invocation that continues the SAME session.
 * claude: `-p --resume <id>` + stream-json/--verbose (falls back to
 * `-c --continue` when the id is unknown). opencode: `run --format json
 * --session <id>`. qwen: `--resume <id>` / `--continue` with `-p` +
 * stream-json. codex: `exec resume <id>` / `exec resume --last`.
 * All degrade to a fresh run with the user's text if resume metadata is
 * unavailable — the turn still happens.
 */
function resumeCommand(
  agent: Agent,
  text: string,
  sessionId?: string,
  cwd?: string,
): { cmd: string; args: string[] } {
  const { cli, model } = agent;
  if (cli === "claude code") {
    return {
      cmd: "claude",
      args: [
        "-p",
        ...(sessionId ? ["--resume", sessionId] : ["-c", "--continue"]),
        text,
        ...modelArgs(cli, model),
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
    };
  }
  if (cli === "qwen code") {
    return {
      cmd: "qwen",
      args: [
        ...(sessionId ? ["--resume", sessionId] : ["--continue"]),
        "-p",
        text,
        ...modelArgs(cli, model),
        "--output-format",
        "stream-json",
        "--include-partial-messages",
      ],
    };
  }
  if (cli === "codex") {
    return {
      cmd: "codex",
      args: [
        "exec",
        "--sandbox",
        "workspace-write",
        "resume",
        ...modelArgs(cli, model),
        "--json",
        ...(sessionId ? [sessionId] : ["--last"]),
        text,
      ],
    };
  }
  if (cli === "github copilot") {
    // Never use --continue here: it could attach a different task's most
    // recent Copilot session. Without a saved id, start a fresh safe turn.
    return {
      cmd: "copilot",
      args: [
        "-p",
        text,
        ...(sessionId ? [`--resume=${sessionId}`] : []),
        ...modelArgs(cli, model),
        ...copilotArgs({ write: true }),
      ],
    };
  }
  if (cli === "kiro") {
    // --resume-id <uuid>: resume a specific session by UUID (preferred).
    // -r / --resume: fall back to most-recent session in cwd when no id yet.
    return {
      cmd: "kiro-cli",
      args: [
        "chat",
        "--no-interactive",
        "--trust-all-tools",
        ...(sessionId ? ["--resume-id", sessionId] : ["-r"]),
        ...modelArgs(cli, model),
        text,
      ],
    };
  }
  return {
    cmd: "opencode",
    args: [
      "run",
      "--format",
      "json",
      ...(sessionId ? ["--session", sessionId] : []),
      ...(cwd ? ["--dir", cwd] : []),
      ...modelArgs(cli, model),
      "--auto",
      text,
    ],
  };
}

/** Build the read-only mission used by the persistent repository chat. */
export function repoGuidePrompt(
  question: string,
  repositoryContext: string,
  agent: Agent,
): string {
  return `You are Ross, the always-available assistant for the repository in your current working directory.

${agent.instructions ?? "Answer questions about RepoOS and this repository."}

Rules:
- Answer the user's question directly and concisely.
- Ground answers in the repository context below and inspect repository files when useful.
- You may read files and run read-only discovery commands. Never edit files, change task status, commit, launch servers, or start agents.
- When discussing tasks, include task IDs and current statuses when relevant.
- If the repository does not support a claim, say what you could not verify.

Current repository context:
${repositoryContext}

User question:
${question}`;
}

/** Persistent session id for the Debugger's bug-paste conversation. */
export const debuggerSessionId = "__repoos-debugger__";

/** The Debugger agent's role name, used to route its chat prompt. */
export const DEBUGGER_NAME = "debugger";

/**
 * The Debugger agent: a chat-first bug diagnostician (no background scan).
 * Its CLI/model can be overridden from the persisted built-in agent state so
 * the inline "coding agent + model" selector on the Agents page actually drives
 * which model the Debugger runs on.
 */
export function debuggerAgent(override?: { cli?: string; model?: string }): Agent {
  // previously "big pickle"
  const base = { cli: "opencode", model: "deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731" } as const;
  return {
    name: DEBUGGER_NAME,
    cli: override?.cli || base.cli,
    model: override?.model || base.model,
    enabled: true,
    instructions:
      "You are the Debugger, a bug diagnostician. When you're handed a pasted bug report, stack trace, or error message, identify the root cause and suggest a concrete, actionable fix. Ask for more context only when the report is too ambiguous to diagnose. Ground your diagnosis in the repository when the pasted text references code you can inspect.",
  };
}

export function debuggerPrompt(
  question: string,
  repositoryContext: string,
  agent: Agent,
): string {
  return `You are the Debugger, the agent you copy a failing report to for a clear diagnosis.

${agent.instructions ?? "Diagnose the root cause and suggest a fix."}

Rules:
- Identify the root cause, not just the symptom, and explain your reasoning briefly.
- Give a concrete, actionable suggested fix (code or config where appropriate).
- You may read repository files and run read-only discovery commands to verify.
- Never edit files, change task status, commit, launch servers, or start agents.
- If you cannot determine the cause with confidence, say exactly what is missing.

The pasted bug / error / question is below. Current repository context:
${repositoryContext}

Bug report:
${question}`;
}

/** Build the writable task-management mission used only by the PM chat. */
export function taskPmPrompt(
  request: string,
  taskContext: string,
  agent: Agent,
): string {
  return `You are the Product Manager for RepoOS, working on the task below. You are not Ross or the read-only repository assistant.

${agent.instructions ?? "Own the roadmap and keep task specifications accurate."}

Rules:
- You may create or update tasks, including task body, metadata, and status, only through RepoOS CLI commands (e.g. \`repoos new\`, \`repoos update\`, \`repoos mv\`). Never call the RepoOS HTTP API directly (no \`curl\`/fetch against localhost) — it requires a browser session and is not reachable from your sandbox.
- Never edit \`work/*.md\` files directly. Never move task files between folders.
- Do not implement product code, commit code, merge branches, or start servers unless the user explicitly asks for that separately.
- Explain the requested task change briefly after applying it, including the task ID and what changed.

Task context:
${taskContext}

User request:
${request}`;
}

/** The mission handed to the coding agent: instructions + task pointer. */
function missionFor(
  task: Task,
  branch: string,
  workdir: string,
  agent: Agent,
  config: RepoOSConfig,
  contextPack?: string,
  resumePreamble?: string,
): string {
  // Source edits stay inside the sandbox. RepoOS owns the privileged Git and
  // canonical-board mutations after the structured signal below (ADR-0005).
  const worktreeTask = join(workdir, relative(config.root, task.path));
  const baseBranch = currentBranch(config.root) ?? "main";
  const parts: string[] = [];

  if (contextPack) {
    parts.push(contextPack);
    parts.push("");
  }

  if (resumePreamble) {
    parts.push(resumePreamble);
    parts.push("");
  }

  parts.push(
    agent.instructions?.trim() ? agent.instructions.trim() : "Implement this task.",
    "",
    `Task #${task.id}: ${task.title}`,
    `Working directory: ${workdir} (a git worktree checked out on branch ${branch} — work here).`,
    `Task file (read this worktree copy for the specification): ${worktreeTask}`,
    "",
    "Run this fail-safe checklist IN ORDER. Do not stop until it is fully checked off:",
    "",
    "1. Read the task file and implement what it describes.",
    `2. Run \`REPOOS_CHECK_CHANGED=${baseBranch} repoos check\` and confirm it passes (build, typecheck, tests scoped to what your branch changed vs ${baseBranch}, UI smoke test). It MUST be green before requesting handoff. RepoOS re-verifies it server-side before finalizing your handoff, and runs the full unscoped test suite again when your branch actually merges — so this scoped run is a fast correctness check, not the final word.`,
    "3. Do not run git add/commit and do not edit the main checkout; those privileged paths are intentionally outside your sandbox.",
    "   RepoOS commits only source, work, docs, and config files to the branch — never `dist/` or `screenshots/`; build artifacts created by `repoos check` stay local.",
    `4. When the implementation is ready, finish your response with this exact line: ${HANDOFF_READY_SIGNAL}`,
    "5. Stop. RepoOS will independently run `repoos check`, commit the implementation, set the worktree task to review, and update the canonical board copy.",
    "",
    "If you are blocked or need a decision from the human:",
    "1. Explain the blocker clearly and do NOT emit the handoff-ready signal.",
    "2. Leave the task active and STOP so the same worktree/session can be resumed.",
    "",
    "Work in turns: finish the requested work, then stop and report. The session can be continued later with follow-up instructions from the user.",
    "",
    "## Managed previews are server-owned — never run `repoos serve` yourself",
    "",
    "RepoOS owns previews and the control-plane port. Do NOT launch `repoos serve` directly, do not choose a port, and never run a long-lived serve process: direct serve attempts from managed agent processes are rejected. Preview ports and lifecycle are managed for you.",
    "",
    "Preview requests are the human's to make, not yours. Do NOT automatically request a preview before handoff or as a routine part of finishing a task. If the human wants to inspect a change in the browser, they request the preview manually from the UI — no action needed from you.",
    "",
    "Only use the preview request signal below if the human explicitly asks you to verify something the way a browser would see it (or to confirm your change serves). It is idempotent — repeat requests return the same task preview. Do NOT call the control-plane HTTP API and do NOT use `curl`: your sandbox may have no localhost network access. Instead, include this exact line in your response so RepoOS can start and verify the preview for you:",
    "",
    `    ${PREVIEW_REQUEST_SIGNAL}`,
    "",
    "RepoOS validates the request against your live run, starts the preview from your worktree, probes it server-side (health + static page), and records the result — the preview URL and the probe outcome — in your task transcript as trusted system entries. You never need a port or localhost.",
    "",
    "If the preview fails, RepoOS records an actionable reason in your transcript. Leave the task active and stop so the same worktree/session can be resumed. Do NOT retry the request repeatedly, and never fall back to launching your own server.",
    "",
    "If this working directory has no build artifacts yet, build before relying on the `repoos` CLI — it warns when its build is stale.",
  );
  return parts.join("\n");
}

/** One-shot run outcome: resolved stdout, or a human-readable failure. */
export interface PromptResult {
  ok: boolean;
  output?: string;
  error?: string;
  /** Wall-clock elapsed ms for the run, or 0 if it never spawned. */
  elapsedMs?: number;
  /** Cumulative tokens/cost the CLI reported, when extractUsage found any. */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

/** Default ceiling on a one-shot agent run (agent rewrites can be slow). */
const PROMPT_TIMEOUT_MS = 180_000;

/**
 * Map an agent `cli` to a one-shot (print mode) invocation that writes its
 * answer to stdout. opencode: `run`, claude: `-p`, qwen: `-p`, codex:
 * `exec`. Explicit configured models are forwarded with the driver's model
 * flag; `default` intentionally omits the flag and lets the CLI resolve it.
 */
export function promptCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  const extra = modelArgs(agent.cli, agent.model);
  if (agent.cli === "claude code") return { cmd: "claude", args: ["-p", prompt, ...extra] };
  if (agent.cli === "qwen code") return { cmd: "qwen", args: ["-p", prompt, ...extra] };
  if (agent.cli === "codex") return { cmd: "codex", args: ["exec", prompt, ...extra] };
  if (agent.cli === "github copilot") {
    return {
      cmd: "copilot",
      // One-shot callers (PM/freeform and model probes) consume the final
      // response, not the streaming transcript. Keep JSONL exclusive to the
      // AgentRunner so freeform task parsing receives markdown.
      args: ["-p", prompt, ...extra, "--no-ask-user", "--no-auto-update", "--no-remote", "--no-remote-export"],
    };
  }
  if (agent.cli === "kiro") {
    return {
      cmd: "kiro-cli",
      args: ["chat", "--no-interactive", "--trust-all-tools", ...extra, prompt],
    };
  }
  return { cmd: "opencode", args: ["run", ...extra, prompt] };
}

/**
 * Map an agent `cli` to a one-shot REVIEW invocation: the agent inspects a
 * worktree it must not modify and prints its report to stdout.
 *
 * Same print-mode shape as `promptCommand`, with one difference that matters:
 * a reviewer has to READ the worktree (git diff, file reads, maybe the test
 * suite), and stdin is ignored — so any engine that gates those calls behind a
 * permission prompt would hang until the timeout instead of reporting. Only
 * flags already verified for this repo's drivers are used:
 * - claude code: `--dangerously-skip-permissions` (same reason as the runner's
 *   start turns — nobody can answer a prompt).
 * - opencode: `--dir <cwd>` so a linked-worktree path is not auto-rejected,
 *   plus `--auto` so gated tool calls resolve instead of blocking.
 * - codex: `exec` alone — its default sandbox is already read-only, which is
 *   exactly the blast radius a reviewer should have.
 * - qwen code: plain `-p`, matching `promptCommand`.
 * - opencode: `--format json`, matching the interactive runner (`cliCommand`
 *   below). Without it, `run`'s plain-text stdout interleaves the model's
 *   step-by-step narration ("Let me look at...") with its final answer, and
 *   nothing separates the two — the whole transcript ends up as the review
 *   report (0264 vs 0253). `extractOneShotReportText` below picks the final
 *   text event back out of the JSON stream.
 */
export function reviewCommand(
  agent: Agent,
  prompt: string,
  cwd: string,
): { cmd: string; args: string[] } {
  const extra = modelArgs(agent.cli, agent.model);
  if (agent.cli === "claude code") {
    // stream-json — same structured usage output the engineer's `cliCommand`
    // uses — so `runPrompt`'s extractUsage/foldUsage sees real tokens/cost and
    // the reviewer lands in the ledger (0273). The review stays read-only
    // (no codex-style write sandbox is involved for claude).
    return {
      cmd: "claude",
      args: [
        "-p",
        prompt,
        ...extra,
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
    };
  }
  if (agent.cli === "qwen code") {
    // Mirrors the engineer's claude-compatible stream-json so usage is captured.
    return { cmd: "qwen", args: ["-p", prompt, ...extra, "--output-format", "stream-json", "--include-partial-messages"] };
  }
  if (agent.cli === "codex") {
    // `--json` streams usage events; the default (read-only) sandbox is exactly
    // the blast radius a reviewer should have — no `--sandbox workspace-write`.
    return { cmd: "codex", args: ["exec", prompt, ...extra, "--json"] };
  }
  if (agent.cli === "github copilot") {
    // copilotArgs already emits `--output-format json`, so usage is captured.
    return {
      cmd: "copilot",
      args: ["-p", prompt, ...extra, ...copilotArgs({ write: false })],
    };
  }
  if (agent.cli === "kiro") {
    // Review is read-only; --trust-all-tools still needed so file reads
    // aren't gated behind a prompt that can never be answered (stdin ignored).
    return {
      cmd: "kiro-cli",
      args: ["chat", "--no-interactive", "--trust-all-tools", ...extra, prompt],
    };
  }
  return { cmd: "opencode", args: ["run", "--format", "json", "--dir", cwd, ...extra, "--auto", prompt] };
}

/**
 * Turn one line of a one-shot (review/CTO) agent's stdout into a transcript
 * entry for live display. Structured event streams (opencode `--format json`,
 * claude/qwen stream-json, codex `--json`, copilot json) get the same per-line
 * parsing the interactive runner applies, so the review transcript reads
 * cleanly instead of dumping raw JSON. A recognized-but-voiceless structured
 * event (claude `result`, `system/init`, a thinking-only assistant message …)
 * returns null so the caller can swallow it; a non-JSON line (warnings, plain
 * text from kiro) passes through as a plain `{s, d}` entry.
 */
export function parseOneShotLine(cli: string, raw: string): AgentOutputEntry | null {
  let isJson = false;
  try {
    isJson = raw.trim().startsWith("{");
    void JSON.parse(raw);
  } catch {
    return { s: "out", d: raw };
  }
  if (!isJson) return { s: "out", d: raw };
  if (cli === "opencode") {
    const parsed = parseJsonEvent(raw);
    return parsed ? parsed.entry : null;
  }
  if (cli === "claude code") {
    const parsed = parseClaudeEvent(raw);
    return parsed?.entry ?? null;
  }
  if (cli === "qwen code") {
    const parsed = parseQwenEvent(raw);
    return parsed?.entry ?? null;
  }
  if (cli === "codex") {
    const parsed = parseCodexEvent(raw);
    return parsed?.entry ?? null;
  }
  if (cli === "github copilot") {
    const parsed = parseCopilotEvent(raw);
    return parsed?.entry ?? null;
  }
  return { s: "out", d: raw };
}

/**
 * Isolate the final report/answer from a one-shot agent's full captured
 * stdout. Structured JSONL engines (opencode `--format json`, claude/qwen
 * stream-json, codex `--json`, copilot json) carry the model's whole narration
 * as a sequence of `text` events interleaved with tool calls — the actual final
 * answer is the LAST `text` event, so this discards the rest (0264 vs 0253).
 * Non-JSON one-shot CLIs (kiro) print only the final answer, so their raw
 * output IS the report. Falls back to the raw output if no text event parses,
 * so a format change never yields an empty report.
 */
export function extractOneShotReportText(cli: string, rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (!trimmed) return trimmed;
  let last = "";
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    const entry = parseOneShotLine(cli, line);
    if (entry && "type" in entry && entry.type === "text") last = entry.text;
  }
  return (last || trimmed).trim();
}

/**
 * Run a coding agent once, non-interactively, and capture its full stdout.
 * Unlike the streaming runner this is synchronous — callers wait for the whole
 * answer (e.g. freeform task creation). Never throws: failures and timeouts
 * resolve as `{ ok: false, error }` so an HTTP handler can respond cleanly.
 *
 * `onLine` streams each complete stdout line as it arrives (line-buffered, the
 * same shape the runner uses) so a caller can forward live progress over SSE
 * without waiting for the run to finish. It is called for real output only —
 * never for a synthetic failure — and a trailing partial line is flushed on
 * exit.
 *
 * `command` overrides the invocation (default: `promptCommand`) so a caller
 * that needs different flags — the review agent's read-the-worktree mode —
 * reuses this spawn/timeout/capture handling instead of duplicating it.
 * `onSpawn` hands the live child to the caller so it can be killed early.
 *
 * The child inherits the server's env verbatim: unlike the streaming runner,
 * NO `REPOOS_API_URL` / `REPOOS_TASK_ID` is injected, so a one-shot agent has
 * no pointer at the control plane's task endpoints.
 */
export function runPrompt(
  agent: Agent,
  prompt: string,
  opts: {
    cwd?: string;
    timeoutMs?: number;
    onLine?: (line: string) => void;
    command?: { cmd: string; args: string[] };
    onSpawn?: (proc: ChildProcess) => void;
  } = {},
): Promise<PromptResult> {
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? PROMPT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const { cmd, args } = opts.command ?? promptCommand(agent, prompt);
    let proc: ChildProcess;
    const startedAt = Date.now();
    try {
      proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      resolve({ ok: false, error: `could not launch ${cmd}: ${reason}` });
      return;
    }
    opts.onSpawn?.(proc);

    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let pending = "";
    // The full stdout, folded through the same usage/extract path the streaming
    // runner uses, so one-shot roles (reviewer/CTO) persist real CLI-reported
    // tokens/cost instead of zeros (0230). `costUsd` holds Kiro credits when
    // this is a Kiro session (extractUsage maps its credits footer) — callers
    // must present it as credits, never as USD.
    const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number } = {};
    const forwardChunk = (c: Buffer): void => {
      out.push(c);
      pending += c.toString("utf8").replace(/\r/g, "\n");
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      for (const part of parts) {
        if (part.length === 0) continue;
        // Fold usage regardless of whether a consumer wants live lines, so the
        // one-shot result always carries CLI-reported tokens/cost (0230).
        foldUsage(usage, part);
        opts.onLine?.(part);
      }
    };
    proc.stdout?.on("data", forwardChunk);
    proc.stderr?.on("data", (c: Buffer) => errOut.push(c));

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve({
        ok: false,
        error: `the ${agent.cli} agent timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);

    const done = (): void => {
      clearTimeout(timer);
      const elapsedMs = Date.now() - startedAt;
      // Flush a trailing line with no final newline so nothing is held back.
      if (opts.onLine && pending.trim()) {
        foldUsage(usage, pending.trimEnd());
        opts.onLine(pending.trimEnd());
      }
      pending = "";
      const output = stripAnsi(Buffer.concat(out).toString("utf8").trim());
      const stderr = Buffer.concat(errOut).toString("utf8").trim();
      // The line stream may drop usage when a CLI emits no trailing newline, so
      // fold the full accumulated stdout as a backstop (idempotent via Math.max).
      foldUsage(usage, output);
      const usageFields = {
        elapsedMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.costUsd,
      };
      if (output) {
        resolve({ ok: true, output, ...usageFields });
        return;
      }
      const reason = stderr
        ? stderr.split("\n").slice(-3).join(" ").trim()
        : "no output produced";
      resolve({ ok: false, error: `${cmd} exited without output: ${reason}`, ...usageFields });
    };
    // `close` (not `exit`) fires only after stdio has drained, so a trailing
    // line with no final newline is still readable when we flush it.
    proc.on("close", () => done());
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `could not launch ${cmd}: ${err.message}` });
    });
  });
}

export class AgentRunner {
  private entries = new Map<string, Entry>();
  private readonly sessions = new Map<string, Session>();
  private readonly config: RepoOSConfig;
  /**
   * Cap on simultaneously-spawned agent CLI processes — each one may
   * itself run a build/test worker pool sized to the host's core count, so
   * unlimited concurrent agents oversubscribe the machine. Configurable via
   * `maxConcurrentAgents` in repoos.toml; "auto" (unset) sizes it to this
   * machine's CPU count so the same repo behaves on a laptop and a desktop.
   */
  private readonly maxConcurrentAgents: number;
  /** Ids (taskId or chat sessionId) with a queued start/send waiting for a free slot, mapped to when they were queued. */
  private readonly queuedIds = new Map<string, string>();
  /** FIFO of deferred spawns, drained as running agents exit (see cleanup()). */
  private readonly startQueue: (() => void)[] = [];
  private readonly emit: (e: AgentEvent) => void;
  private readonly logger?: Logger;
  private readonly sessionsDir: string;
  private readonly cacheDir: string;
  private readonly logDir: string;
  private readonly db: RepoOSDb | null;
  private readonly writeDelayMs: number;
  private readonly retentionDays: number;
  private readonly retentionCount: number;
  private readonly clock: () => Date;
  private readonly writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingCompletion = new Set<string>();
  /**
   * The main RepoOS server's own API URL, injected into every agent process so
   * agents with host networking have an informational pointer at the ACTUAL
   * control plane, never a hardcoded port. Managed previews are requested by
   * signal (#0121), so this is not a requirement — it stays for diagnostics
   * and future HTTP-capable drivers.
   */
  apiUrl?: string;
  private readonly stallTimeoutMs: number;
  private readonly stallTimer: ReturnType<typeof setInterval>;

  private readonly authorizedHandoffs = new Map<string, AgentHandoffRequest>();
  private readonly handoffsInFlight = new Set<string>();
  private readonly onHandoff?: (request: AgentHandoffRequest) => void | Promise<void>;
  /**
   * Fired on completion of a durable REVIEW turn (0288) — including for an
   * entry re-attached after a reload, whose process finishes on the new
   * server. The owning ReviewManager finalizes the report from this hook
    * rather than a post-spawn continuation that would die with the old process.
    * `reviewKind` (run vs chat) and `exitedCleanly` are threaded through so the
    * ReviewManager can finalize an adopted turn in the right mode and decide
    * whether it finished cleanly.
    */
  private readonly onReviewDone?: (sessionKey: string, exitedCleanly: boolean, reviewKind?: "run" | "chat") => void;

  /**
   * Tasks a human deliberately paused (via POST /api/tasks/:id/pause, 0070).
   * The task stays `active` with no process, so without this the watchdog would
   * treat a legitimately-paused task as stuck and disturb it (#0180). In-memory
   * only: a paused task across a server restart loses the marker and reads as a
   * stopped agent — the watchdog then surfaces it, which is the correct default
   * (the paused process is, after all, gone).
   */
  private readonly pausedTasks = new Set<string>();

  /**
   * Preview capabilities minted per clean run (#0121). Superseded when a new
   * run starts for the same task, so a stale request can never start a preview
   * against a different worktree.
   */
  private readonly authorizedPreviews = new Map<string, AgentPreviewRequest>();
  private readonly onPreviewRequest?: (request: AgentPreviewRequest) => void | Promise<void>;

  /** Resolve a task from the repo task index by ID. Used to populate task/branch on resume turns. */
  private readonly getTask?: (taskId: string) => Task | null;

  /**
   * `opts.stallTimeoutMs` overrides the 90s default (tests use a small value
   * so stall detection doesn't need a real 90s wait); `opts.stallCheckIntervalMs`
   * overrides the poll cadence, which otherwise scales with the timeout.
   */
  constructor(
    config: RepoOSConfig,
    emit: (e: AgentEvent) => void,
    opts: { stallTimeoutMs?: number; stallCheckIntervalMs?: number; onHandoff?: (request: AgentHandoffRequest) => void | Promise<void>; onPreviewRequest?: (request: AgentPreviewRequest) => void | Promise<void>; onReviewDone?: (sessionKey: string, exitedCleanly: boolean, reviewKind?: "run" | "chat") => void; logger?: Logger } & AgentRunnerOptions = {},
  ) {
    this.config = config;
    this.maxConcurrentAgents = config.maxConcurrentAgents ?? defaultMaxConcurrentAgents();
    this.emit = emit;
    this.logger = opts.logger;
    this.onHandoff = opts.onHandoff;
    this.onPreviewRequest = opts.onPreviewRequest;
    this.onReviewDone = opts.onReviewDone;
    this.getTask = opts.getTask;
    this.db = getRepoOSDb(config.root);
    this.cacheDir = join(config.root, config.cacheDir);
    this.sessionsDir = join(this.cacheDir, "sessions");
    this.logDir = join(this.cacheDir, "agent-logs");
    this.writeDelayMs = opts.writeDelayMs ?? SESSION_WRITE_DELAY_MS;
    this.retentionDays = opts.retentionDays ?? SESSION_RETENTION_DAYS;
    this.retentionCount = opts.retentionCount ?? SESSION_RETENTION_COUNT;
    this.clock = opts.now ?? (() => new Date());
    this.stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    const checkMs =
      opts.stallCheckIntervalMs ?? Math.max(20, Math.min(5000, Math.floor(this.stallTimeoutMs / 3)));
    this.stallTimer = setInterval(() => this.checkStalls(), checkMs);
    this.stallTimer.unref();
    this.loadHotSessions();
    this.pruneSessions();
  }

  /** Stop the stall-check timer (server shutdown / test cleanup). Idempotent. */
  dispose(): void {
    clearInterval(this.stallTimer);
    for (const entry of this.entries.values()) {
      for (const tailer of entry.tailers ?? []) clearInterval(tailer.timer);
    }
  }

  /**
   * Re-attach to agent children that survived a server restart (0214).
   * Reads the durable registry, checks PID aliveness, and for each still-live
   * child tail-catches the log file and restores the in-memory entry/session
   * so `isRunning()` reports true and SSE streaming resumes from this point.
   * Stale entries (PID dead) are dropped — this must not resurrect dead sessions.
   */
  adoptRunningAgents(): void {
    const registry = readRegistry(this.cacheDir);
    const live: DurableRegistryEntry[] = [];
    for (const rec of registry.entries) {
      if (this.entries.has(rec.taskId)) continue;
      let alive = false;
      try {
        process.kill(rec.pid, 0);
        alive = true;
      } catch {
        /* PID is dead — drop it */
      }
      const isReview = rec.kind === "review";
      // A dead non-review entry is stale — drop it (must not resurrect dead
      // sessions). A DEAD REVIEW entry, however, means the review process
      // finished sometime during the reload handoff before this process could
      // adopt it — its durable log still holds the full report, so we replay
      // it and hand completion to the new ReviewManager (0288). By the time the
      // deferred hook fires, the server has built `reviews`.
      if (!alive && !isReview) continue;
      const outLog = join(this.logDir, `${rec.taskId}.out.log`);
      const errLog = join(this.logDir, `${rec.taskId}.err.log`);
      // Restore the session so the transcript is pre-loaded for the task.
      let session = this.sessions.get(rec.taskId) ?? this.loadSession(rec.taskId);
      if (!session) {
        session = this.emptySession();
        session.workdir = rec.workdir;
        session.engine = "plain";
      }
      session.workdir = rec.workdir;
      session.turnStartedAt = session.turnStartedAt ?? now();
      session.lastOutputAt = session.lastOutputAt ?? now();
      this.sessions.set(rec.taskId, session);
      // Tail-catch: read any log output written during the handoff gap and
      // replay it into the session so the transcript isn't missing a chunk.
      // Separate logs preserve stdout/stderr type during the handoff gap.
      try {
        this.replayLog(rec.taskId, outLog, "out");
        this.replayLog(rec.taskId, errLog, "err");
        // Compatibility with an early 0214 build that used one tagged log.
        this.replayLog(rec.taskId, join(this.logDir, `${rec.taskId}.log`), "out", true);
      } catch {
        /* best-effort */
      }
      if (!alive && isReview) {
        // The reviewer already finished: finalize its report and drop the entry.
        this.removeRegistryEntry(rec.taskId);
        session.accumulatedMs = Date.now() - Date.parse(session.turnStartedAt ?? now());
        // Defer so `reviews` (and safe handler wiring) exists before we finalize.
        setTimeout(() => {
          try {
            this.onReviewDone?.(rec.taskId, false, rec.reviewKind);
          } catch {
            /* best-effort */
          }
        }, 0);
        continue;
      }
      live.push(rec);
      // Start tailing the log file for live output, and register a fake Entry
      // so isRunning() is true and the task reads as in-flight. The real ChildProcess
      // is referenced by PID, not held directly — we poll for aliveness instead.
      const tailers = [
        this.tailLog(rec.taskId, outLog, "out", true),
        this.tailLog(rec.taskId, errLog, "err", true),
      ];
      this.entries.set(rec.taskId, {
        startedAt: now(),
        workdir: rec.workdir,
        task: undefined,
        branch: rec.branch,
        runId: rec.runId,
        handoffRequested: false,
        previewRequested: false,
        adoptedPid: rec.pid,
        review: isReview,
        reviewKind: rec.kind === "review" ? rec.reviewKind : undefined,
        tailers,
      });
    }
    if (live.length > 0) {
      writeRegistry(this.cacheDir, { entries: live });
    } else {
      this.clearRegistry();
    }
  }

  /** Replay a durable log into a transcript, optionally decoding the legacy tagged format. */
  private replayLog(taskId: string, logFile: string, stream: "out" | "err", tagged = false): void {
    if (!existsSync(logFile)) return;
    const data = readFileSync(logFile, "utf8");
    for (const line of data.split("\n")) {
      if (!line) continue;
      if (tagged && line.startsWith("O:")) this.appendLine(taskId, "out", line.slice(2));
      else if (tagged && line.startsWith("E:")) this.appendLine(taskId, "err", line.slice(2));
      else this.appendLine(taskId, stream, line);
    }
  }

  /** Tail one durable stream file into the live transcript. */
  private tailLog(
    taskId: string,
    logFile: string,
    stream: "out" | "err",
    startAtEnd = false,
  ): { timer: ReturnType<typeof setInterval>; drain: () => void; flush: () => void } {
    // `stat.size` is a byte offset. Keep it in bytes and decode only the new
    // buffer range; slicing a decoded string with that offset loses output as
    // soon as an agent writes emoji, CJK, or any other multi-byte UTF-8.
    let lastSize = 0;
    let pending = "";
    let decoder = new StringDecoder("utf8");
    if (startAtEnd) {
      try { lastSize = statSync(logFile).size; } catch { /* missing log */ }
    }
    const drain = (): void => {
      try {
        const currentSize = statSync(logFile).size;
        // A new turn truncates the same durable log path. Reset both the byte
        // cursor and decoder rather than treating the truncated file as idle.
        if (currentSize < lastSize) {
          lastSize = 0;
          decoder = new StringDecoder("utf8");
        }
        if (currentSize > lastSize) {
          const data = readFileSync(logFile);
          const delta = decoder.write(data.subarray(lastSize));
          lastSize = currentSize;
          const lines = (pending + delta).replace(/\r/g, "\n").split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (line.length === 0) continue;
            this.appendLine(taskId, stream, line);
          }
        }
      } catch (err) {
        /* best-effort on any other error */
      }
    };
    const interval = setInterval(() => {
      if (!this.entries.has(taskId)) {
        clearInterval(interval);
        return;
      }
      drain();
    }, 200);
    interval.unref();
    // `pending` is local to this tailer (rather than Session.pending), so a
    // process that exits without its final newline needs an explicit flush.
    // Route it through appendLine to preserve structured JSON parsing.
    const flush = (): void => {
      const line = pending.trimEnd();
      pending = "";
      if (line) this.appendLine(taskId, stream, line);
    };
    return { timer: interval, drain, flush };
  }

  /** Persist a registry entry for one running task (0214). */
  private writeRegistryEntry(
    taskId: string,
    pid: number,
    workdir: string,
    branch: string,
    runId: string,
    kind?: "engineer" | "review",
    reviewKind?: "run" | "chat",
  ): void {
    const registry = readRegistry(this.cacheDir);
    const existing = registry.entries.findIndex((e) => e.taskId === taskId);
    const entry: DurableRegistryEntry = { taskId, pid, workdir, branch, runId, kind, reviewKind };
    if (existing >= 0) {
      registry.entries[existing] = entry;
    } else {
      registry.entries.push(entry);
    }
    writeRegistry(this.cacheDir, registry);
  }

  /** Remove a registry entry for a task (0214). */
  private removeRegistryEntry(taskId: string): void {
    const registry = readRegistry(this.cacheDir);
    registry.entries = registry.entries.filter((e) => e.taskId !== taskId);
    writeRegistry(this.cacheDir, registry);
  }

  /** Clear the entire durable registry (0214). */
  private clearRegistry(): void {
    try {
      const file = registryPath(this.cacheDir);
      if (existsSync(file)) unlinkSync(file);
    } catch {
      /* best-effort */
    }
  }

  // ---- Pending handoff persistence (#0235) ----

  /** Persist a handoff request for recovery across process boundaries. */
  private persistPendingHandoff(request: AgentHandoffRequest): void {
    const store = readPendingHandoffs(this.cacheDir);
    // Newer run supersedes older one for the same task.
    store.requests = store.requests.filter((r) => r.taskId !== request.taskId);
    store.requests.push(request);
    writePendingHandoffs(this.cacheDir, store);
  }

  /** Remove a persisted handoff request (by task id). */
  private clearPendingHandoff(taskId: string): void {
    const store = readPendingHandoffs(this.cacheDir);
    const before = store.requests.length;
    store.requests = store.requests.filter((r) => r.taskId !== taskId);
    if (store.requests.length < before) {
      writePendingHandoffs(this.cacheDir, store);
    }
  }

  /**
   * Recover persisted handoff requests at server boot. Validates each request
   * (task still exists, still active, branch matches, not already finalizing)
   * and re-fires onHandoff for valid ones. Idempotent: a request already in
   * handoffsInFlight is skipped.
   */
  recoverPendingHandoffs(): void {
    const store = readPendingHandoffs(this.cacheDir);
    if (store.requests.length === 0) return;
    for (const request of store.requests) {
      if (this.handoffsInFlight.has(request.taskId)) continue;
      // Validate: task must still exist and be active, branch must match.
      const task = this.getTask?.(request.taskId) ?? null;
      if (!task) {
        this.clearPendingHandoff(request.taskId);
        continue;
      }
      if (task.status !== "active") {
        this.clearPendingHandoff(request.taskId);
        continue;
      }
      if (task.branch !== request.branch) {
        this.clearPendingHandoff(request.taskId);
        continue;
      }
      // Admit to the authorized-capability map so the server's
      // consumeHandoff validation (server.ts onHandoff) succeeds. The normal
      // clean-exit path does the same in cleanup().
      this.authorizedHandoffs.set(request.runId, request);
      // Move to in-flight before firing so concurrent checks see it.
      this.handoffsInFlight.add(request.taskId);
      // Clear the persisted entry so a later boot does not re-fire the same
      // request. If finalization ultimately fails, the task stays active and
      // can be resumed manually.
      this.clearPendingHandoff(request.taskId);
      // Ensure the session is loaded so system()/appendLine() can write to
      // the transcript.  For a dead-interrupted task, adoptRunningAgents only
      // pre-loads sessions for live PIDs — the interrupted-turn session is on
      // disk but not yet in memory (#0235 review fix).
      if (!this.sessions.has(request.taskId)) {
        const loaded = this.loadSession(request.taskId);
        if (loaded) this.sessions.set(request.taskId, loaded);
      }
      // Surface in the transcript so the human sees recovery.
      this.system(request.taskId, "Recovering pending handoff from interrupted turn — finalizing now");
      void Promise.resolve(this.onHandoff?.(request))
        .catch((err) => {
          this.appendLine(request.taskId, "sys", `✗ recovered handoff failed: ${(err as Error).message}`);
        })
        .finally(() => {
          this.handoffsInFlight.delete(request.taskId);
          // If the server handler rejected (consumeHandoff denied, or a
          // concurrent finalization was already in flight), the capability
          // was never consumed — remove it so it does not leak and confuse
          // a later validateHandoff check.
          if (this.authorizedHandoffs.has(request.runId)) {
            this.authorizedHandoffs.delete(request.runId);
          }
          // If the task is still active after recovery, record the outcome in
          // the Activity log so the watchdog's HANDOFF_RETAINED guard can
          // unstick it: without this, the retained line permanently blocks
          // auto-surface/escalation even when recovery has already been
          // attempted and failed (#0235 review fix).
          const task = this.getTask?.(request.taskId) ?? null;
          if (task && task.status === "active") {
            this.persistHandoffFailure(request.taskId, task, "handoff recovery attempted · finalization failed");
          }
        });
    }
  }

  /** Append trusted server orchestration progress to the retained transcript. */
  system(taskId: string, text: string): void {
    this.appendLine(taskId, "sys", text);
  }

  /** Validate that a handoff capability was minted by a successful active turn. */
  validateHandoff(request: AgentHandoffRequest): boolean {
    const issued = this.authorizedHandoffs.get(request.runId);
    return Boolean(
      issued &&
      issued.taskId === request.taskId &&
      issued.branch === request.branch &&
      this.samePath(issued.workdir, request.workdir) &&
      issued.sessionId === request.sessionId,
    );
  }

  /** Validate and expire one runner-issued handoff capability atomically. */
  consumeHandoff(request: AgentHandoffRequest): boolean {
    if (!this.validateHandoff(request)) return false;
    this.authorizedHandoffs.delete(request.runId);
    return true;
  }

  /**
   * Validate that a preview capability was minted by a real, current runner
   * turn (#0121). The capability carries the task id, the run id issued for
   * that turn, the registered branch, and the registered worktree — a forged,
   * expired (superseded by a newer run), cross-task, or path-substituted
   * request never matches all four.
   */
  validatePreview(request: AgentPreviewRequest): boolean {
    const issued = this.authorizedPreviews.get(request.runId);
    return Boolean(
      issued &&
        issued.taskId === request.taskId &&
        issued.branch === request.branch &&
        this.samePath(issued.workdir, request.workdir) &&
        issued.sessionId === request.sessionId,
    );
  }

  isRunning(taskId: string): boolean {
    return this.entries.has(taskId);
  }

  /**
   * The review turn kind ("run" | "chat") of a durable review session, if the
   * entry is one (0288). Used by ReviewManager to finalize an ADOPTED turn in
   * the right mode — the session's own `Run` record is not carried across a
   * reload, but its review kind is (persisted in the registry).
   */
  reviewKindOf(sessionKey: string): "run" | "chat" | undefined {
    return this.entries.get(sessionKey)?.reviewKind;
  }

  /**
   * Record a deliberate human pause (0070): the task stays `active` but its
   * agent is intentionally stopped, so the watchdog must not touch it (#0180).
   * Cleared automatically the moment a new turn starts for the task.
   */
  markPaused(taskId: string): void {
    this.pausedTasks.add(taskId);
  }

  /** True when the task was explicitly paused and no new turn has started since. */
  isPaused(taskId: string): boolean {
    return this.pausedTasks.has(taskId);
  }

  /**
   * True while the server-side handoff for a task is still finalizing (check,
   * commit, review). The process is already gone, so `isRunning` is false, but
   * the task is not stuck — the close-out pipeline owns it for a few seconds.
   */
  isHandoffInFlight(taskId: string): boolean {
    return this.handoffsInFlight.has(taskId);
  }

  /** Live run telemetry for a task's session — zeros/nulls when none exists yet. */
  stats(taskId: string): AgentSessionStats {
    return this.snapshotStats(taskId);
  }

  running(): RunningAgentInfo[] {
    const out: RunningAgentInfo[] = [];
    for (const [id, e] of this.entries) {
      out.push({
        id,
        pid: e.adoptedPid ?? e.proc?.pid ?? -1,
        startedAt: e.startedAt,
        workdir: e.workdir,
      });
    }
    return out;
  }

  /** Query historical stats for a task from the database. */
  taskStats(taskId: string) {
    return this.db?.getTaskStats(taskId) ?? null;
  }

  /** Query historical stats grouped by session type from the database. */
  sessionTypeStats() {
    return this.db?.getSessionTypeStats() ?? [];
  }

  /** Per-day usage totals (server's local time). */
  dailyTotals() {
    return this.db?.getDailyTotals() ?? [];
  }

  /** Query board-level summary stats from the database. */
  boardStats() {
    return this.db?.getBoardStats() ?? null;
  }

  /**
   * Spawn the coding agent on the task. Never blocks — the child runs
   * detached from the HTTP response. Returns a StartResult describing the
   * launch attempt; an async spawn failure is emitted as agent.exited.
   *
   * `opts.cwd` is the task's worktree directory when one was provisioned;
   * defaults to the repo root so launch still works (best-effort) when
   * worktree setup failed or the task's branch is the main checkout.
   */
  start(
    task: Task,
    branch: string,
    agent: Agent,
    opts: { cwd?: string; contextPack?: string; resumePreamble?: string } = {},
  ): StartResult {
    if (this.entries.has(task.id) || this.handoffsInFlight.has(task.id) || this.queuedIds.has(task.id)) {
      return { ok: false, reason: "task is already running or finalizing" };
    }
    const cwd = opts.cwd ?? this.config.root;
    const session =
      this.sessions.get(task.id) ??
      this.loadSession(task.id) ??
      this.emptySession();
    session.workdir = cwd;
    session.engine = engineForCli(agent.cli);
    session.task = task;
    session.branch = branch;
    session.agent = agent.name;
    session.model = agent.model;
    this.sessions.set(task.id, session);
    const mission = missionFor(task, branch, cwd, agent, this.config, opts.contextPack, opts.resumePreamble);
    const { cmd, args } = cliCommand(agent, mission, cwd);
    return this.spawnOrQueue(task.id, cmd, args, cwd, task, branch);
  }

  /** Start a persistent, non-task conversation with an explicit role mission. */
  startChat(
    sessionId: string,
    text: string,
    agent: Agent,
    repositoryContext: string,
    promptBuilder: (text: string, context: string, agent: Agent) => string = repoGuidePrompt,
  ): StartResult {
    if (this.entries.has(sessionId) || this.queuedIds.has(sessionId)) {
      return { ok: false, busy: true, reason: "agent is busy — wait for the current turn to finish" };
    }
    if (this.sessions.has(sessionId)) {
      return { ok: false, reason: "conversation already exists — send a follow-up instead" };
    }
    const human: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
    const session: Session = {
      lines: [human],
      pending: "",
      bytes: entryBytes(human),
      workdir: this.config.root,
      engine: engineForCli(agent.cli),
      agent: agent.name,
      model: agent.model,
      accumulatedMs: 0,
      stalledEmitted: false,
    };
    this.sessions.set(sessionId, session);
    const mission =
      agent.name === DEBUGGER_NAME
        ? debuggerPrompt(text, repositoryContext, agent)
        : promptBuilder(text, repositoryContext, agent);
    const { cmd, args } = cliCommand(agent, mission, this.config.root);
    return this.spawnOrQueue(sessionId, cmd, args, this.config.root);
  }

  /**
   * Spawn a durable REVIEW turn under a synthetic session key (0288), so the
   * reviewer survives a server reload the same way engineer/PM turns do: the
   * child's stdout/stderr stream to durable log files and its PID is registered
   * so the next server's `adoptRunningAgents()` re-attaches and replays any
   * output written during the handoff. On completion — even post-reload —
   * `cleanup()` fires `onReviewDone` for the owning ReviewManager to finalize.
   *
   * Unlike `start`/`send`, the review agent is deliberately NOT given
   * `REPOOS_TASK_ID` / `REPOOS_API_URL`, preserving the read-only boundary that
   * keeps it from reaching the control plane's task endpoints (review.ts layer
   * 2). `kind: "review"` is persisted in the durable registry so adoption knows
   * to re-attach as a review.
   *
   * `reset: true` (a fresh run) clears any prior conversation; a chat turn
   * (`reset: false`, with `humanEntry`) continues the existing one.
   */
  startReview(
    sessionKey: string,
    agent: Agent,
    mission: string,
    cwd: string,
    opts: { humanEntry?: AgentOutputEntry; reset?: boolean; reviewKind?: "run" | "chat" } = {},
  ): StartResult {
    if (this.entries.has(sessionKey)) {
      return { ok: false, busy: true, reason: "a review is already running for this task" };
    }
    let session = this.sessions.get(sessionKey) ?? this.loadSession(sessionKey);
    if (!session || opts.reset) {
      session = this.emptySession();
    }
    if (opts.reset) {
      session.lines = [];
      session.bytes = 0;
    }
    session.workdir = cwd;
    session.engine = engineForCli(agent.cli);
    session.agent = agent.name;
    session.model = agent.model;
    if (opts.humanEntry) {
      session.lines.push(opts.humanEntry);
      session.bytes += entryBytes(opts.humanEntry);
      while (session.bytes > OUTPUT_CAP_BYTES) {
        const dropped = session.lines.shift();
        if (!dropped) break;
        session.bytes -= entryBytes(dropped);
      }
    }
    this.sessions.set(sessionKey, session);
    const { cmd, args } = reviewCommand(agent, mission, cwd);
    return this.spawnTurn(sessionKey, cmd, args, cwd, undefined, "", {
      review: true,
      reviewKind: opts.reviewKind ?? "run",
    });
  }

  /** Release a durable review session from the in-memory map (its file stays). */
  discardReviewSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
  }

  /**
   * Send a follow-up message to a task's session, resuming the same
   * conversation as a new turn. Rejected when the task has no session yet
   * (`ok: false`) or when a turn is already running (`ok: false, busy: true`).
   */
  send(
    taskId: string,
    text: string,
    agent: Agent,
    opts: { resumePreamble?: string; skipBoardDivergence?: boolean } = {},
  ): StartResult {
    // Completed/non-task conversations are deliberately not preloaded at boot.
    // Hydrate one on demand so a persisted RepoOS Guide transcript can resume
    // after a server reload instead of being visible-but-unsendable.
    const session = this.sessions.get(taskId) ?? this.loadSession(taskId);
    if (!session) {
      return { ok: false, reason: "no session for this task — start work first" };
    }
    if (this.entries.has(taskId) || this.handoffsInFlight.has(taskId) || this.queuedIds.has(taskId)) {
      return { ok: false, busy: true, reason: "agent is busy — wait for the current turn or handoff to finish" };
    }
    this.sessions.set(taskId, session);
    const entry: AgentOutputEntry = { type: "human", text, at: new Date().toISOString() };
    session.lines.push(entry);
    session.bytes += entryBytes(entry);
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
    }
    this.schedulePersist(taskId);
    // On resume turns, resolve the task from the index if not already set in the session.
    // This ensures task/branch are always available for handoff finalization.
    if (!session.task && this.getTask) {
      const resolvedTask = this.getTask(taskId);
      if (resolvedTask) {
        session.task = resolvedTask;
        session.branch = resolvedTask.branch;
      }
    }
    const fullText = opts.resumePreamble
      ? `${opts.resumePreamble}\n\n${text}`
      : text;
    // session.sessionId is only meaningful to the CLI that produced it — if
    // agent.cli has since changed (override edited/cleared between turns),
    // reusing it would hand one CLI's session id to a different CLI's
    // --resume flag (e.g. an opencode `ses_...` id passed to `claude
    // --resume`, which requires a UUID and errors out). Drop it and let
    // resumeCommand fall back to a fresh/most-recent-session start instead.
    const sessionId = session.engine === engineForCli(agent.cli) ? session.sessionId : undefined;
    const { cmd, args } = resumeCommand(agent, fullText, sessionId, session.workdir ?? this.config.root);
    return this.spawnOrQueue(
      taskId,
      cmd,
      args,
      session.workdir ?? this.config.root,
      session.task,
      session.branch,
      { skipBoardDivergence: opts.skipBoardDivergence },
    );
  }

  /** The retained transcript for a task, or null when no session exists. */
  output(taskId: string): Session | null {
    return this.sessions.get(taskId) ?? this.loadSession(taskId);
  }

  /** Whether a session exists for a key (in memory or persisted on disk). */
  hasSession(sessionKey: string): boolean {
    return this.sessions.has(sessionKey) || this.readPersisted(sessionKey) !== null;
  }

  /** Drop a session both in memory and from disk (a fresh review run). */
  clearSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
    const file = this.sessionFile(sessionKey);
    if (file && existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        /* best-effort */
      }
    }
  }

  /**
   * Mark a task transcript complete and release its RAM. If its child is still
   * draining after a stop request, cleanup performs the final flush/eviction.
   */
  complete(taskId: string): void {
    // Task is leaving active — clear any persisted handoff (#0235).
    this.clearPendingHandoff(taskId);
    for (const [runId, req] of this.authorizedPreviews) {
      if (req.taskId === taskId) this.authorizedPreviews.delete(runId);
    }
    if (this.entries.has(taskId)) {
      this.pendingCompletion.add(taskId);
      return;
    }
    this.finishCompletion(taskId);
  }

  /** Flush all debounced transcript writes before shutdown/reload handover. */
  flushAll(): void {
    for (const taskId of this.writeTimers.keys()) this.persist(taskId);
  }

  /**
   * Gate for every spawnTurn call site: at capacity, defer the spawn
   * instead of oversubscribing the machine. The caller still gets `ok: true`
   * immediately — `queued: true` distinguishes "will run shortly" from
   * "running now" without changing callers' happy-path handling. `id` is
   * marked busy via queuedIds so a second start/send for the same task/chat
   * while queued is rejected the same way an already-running one would be.
   */
  private spawnOrQueue(
    id: string,
    cmd: string,
    args: string[],
    cwd: string,
    task?: Task,
    branch?: string,
    opts: { skipBoardDivergence?: boolean } = {},
  ): StartResult {
    if (this.entries.size < this.maxConcurrentAgents) {
      return this.spawnTurn(id, cmd, args, cwd, task, branch, opts);
    }
    this.queuedIds.set(id, now());
    this.startQueue.push(() => {
      this.queuedIds.delete(id);
      this.emit({ type: "agent.dequeued", id, at: now() });
      this.spawnTurn(id, cmd, args, cwd, task, branch, opts);
    });
    this.logger?.agent(
      id,
      "info",
      `Queued — ${this.entries.size}/${this.maxConcurrentAgents} agent processes already running.`,
    );
    this.emit({ type: "agent.queued", id, at: now() });
    return { ok: true, queued: true };
  }

  /** Tasks/chats currently waiting for a free maxConcurrentAgents slot. */
  queued(): { id: string; queuedAt: string }[] {
    return Array.from(this.queuedIds.entries()).map(([id, queuedAt]) => ({ id, queuedAt }));
  }

  /** Start the next queued spawn once a slot is free (called from cleanup() on every exit). */
  private drainQueue(): void {
    while (this.startQueue.length > 0 && this.entries.size < this.maxConcurrentAgents) {
      const next = this.startQueue.shift();
      next?.();
    }
  }

  /**
   * Spawn one turn and attach streaming. Everything after the spawn is async;
   * failures surface as agent.exited via cleanup.
   */
  private spawnTurn(
    taskId: string,
    cmd: string,
    args: string[],
    cwd: string,
    task?: Task,
    branch?: string,
    opts: { skipBoardDivergence?: boolean; review?: boolean; reviewKind?: "run" | "chat" } = {},
  ): StartResult {
    const runId = randomUUID();
    // A new turn means the task is active again — a human restarted a paused
    // task, or sent a follow-up — so the pause marker no longer applies.
    this.pausedTasks.delete(taskId);
    // A new turn supersedes any persisted handoff from a previous turn (#0235).
    this.clearPendingHandoff(taskId);
    // A new run supersedes the previous run's preview capability for this task
    // (#0121): a capability minted for an older run is expired the moment a
    // newer turn claims the task.
    for (const [prevRunId, req] of this.authorizedPreviews) {
      if (req.taskId === taskId) this.authorizedPreviews.delete(prevRunId);
    }
    const outLog = join(this.logDir, `${taskId}.out.log`);
    const errLog = join(this.logDir, `${taskId}.err.log`);
    let outFd: number | undefined;
    let errFd: number | undefined;
    let proc: ChildProcess;
    try {
      // Give the child file descriptors, not pipes owned by this server. The
      // child keeps those descriptors when this process exits during reload,
      // so subsequent output cannot fail with EPIPE.
      mkdirSync(this.logDir, { recursive: true });
      outFd = openSync(outLog, "w");
      errFd = openSync(errLog, "w");
      // REPOOS_AGENT=1 marks every managed agent process so the CLI's defense
      // in depth can reject an accidental direct `repoos serve` attempt, and
      // REPOOS_TASK_ID/REPOOS_RUN_ID let the runner bind any capability-request
      // signal to this exact turn. REPOOS_API_URL is kept as an informational
      // pointer at the control plane (ADR-0005: agents express intent, RepoOS
      // owns privileged process/network lifecycle) — managed previews are
      // requested by signal, never by a sandboxed localhost call (#0121).
      // A managed agent is, by definition, never a preview child or a reload
      // replacement. Scrub the control-plane's lifecycle markers and reload
      // secret before they can leak into the agent (and from it into the
      // #0096 agent-serve-guard test, where REPOOS_RELOAD=1 would exempt the
      // child from the direct-serve guard and hang the test).
      const agentEnv: NodeJS.ProcessEnv = { ...process.env };
      delete agentEnv.REPOOS_RELOAD;
      delete agentEnv.REPOOS_RELOAD_SECRET;
      delete agentEnv.REPOOS_PREVIEW_CHILD;
      agentEnv.REPOOS_AGENT = "1";
      // A REVIEW turn is deliberately read-only: unlike the engineer/PM, it is
      // NOT given REPOOS_TASK_ID / REPOOS_API_URL, so it has no pointer at the
      // control plane's task endpoints and cannot reach /done (review.ts layer
      // 2). REPOOS_RUN_ID is still bound so any capability-request signal (none
      // expected) would route to this exact run.
      if (!opts.review) agentEnv.REPOOS_TASK_ID = taskId;
      agentEnv.REPOOS_RUN_ID = runId;
      if (this.apiUrl && !opts.review) agentEnv.REPOOS_API_URL = this.apiUrl;
      proc = spawn(cmd, args, {
        cwd,
        stdio: ["ignore", outFd, errFd],
        env: agentEnv,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger?.agent(taskId, "error", `Failed to spawn agent: ${reason}`, { cmd, args });
      this.emit({ type: "agent.exited", id: taskId, at: now() });
      return { ok: false, reason };
    } finally {
      // spawn duplicates the descriptors into the child. The parent's copies
      // are no longer needed and must not keep the files artificially open.
      if (outFd !== undefined) closeSync(outFd);
      if (errFd !== undefined) closeSync(errFd);
    }
    const tailers = [this.tailLog(taskId, outLog, "out"), this.tailLog(taskId, errLog, "err")];
    this.entries.set(taskId, {
      proc,
      startedAt: now(),
      workdir: cwd,
      task,
      branch: branch ?? task?.branch ?? "",
      runId,
      handoffRequested: false,
      previewRequested: false,
      skipBoardDivergence: opts.skipBoardDivergence,
      review: opts.review,
      reviewKind: opts.review ? opts.reviewKind : undefined,
      tailers,
    });
    // Turn-start bookkeeping for the live stats readout (0080): the silence
    // clock resets here too, not just on output, so a follow-up turn on a
    // session that's been idle in `review` for hours doesn't immediately read
    // as "stalled" before the freshly-spawned process has had a chance to
    // produce a single line.
    const session = this.sessions.get(taskId);
    if (session) {
      session.turnStartedAt = now();
      session.lastOutputAt = now();
      session.stalledEmitted = false;
    }
    // Persist the durable registry entry so a restart can re-attach (0214).
    if (proc.pid) {
      this.writeRegistryEntry(
        taskId,
        proc.pid,
        cwd,
        branch ?? task?.branch ?? "",
        runId,
        opts.review ? "review" : "engineer",
        opts.review ? opts.reviewKind : undefined,
      );
    }
    // Either path means the run is over: natural exit, spawn error (e.g. the
    // CLI isn't installed), or our own SIGKILL after a graceful pause. `close`
    // (not `exit`) fires only after stdio has drained, so a trailing line with
    // no final newline is still in `pending` when cleanup flushes it.
    const finishTurn = (code: number | null): void => {
      // The final write can arrive just before close, before the next polling
      // tick. Drain synchronously so no trailing output is lost.
      for (const tailer of this.entries.get(taskId)?.tailers ?? []) tailer.drain();
      this.cleanup(taskId, code === 0);
    };
    proc.on("close", finishTurn);
    proc.on("error", () => this.cleanup(taskId, false));
    // A very short-lived command can exit between `spawn()` and listener
    // registration. ChildProcess does not replay a missed `close` event, so
    // finalize it explicitly instead of leaving its last log line and runner
    // entry behind forever.
    if (proc.exitCode !== null) finishTurn(proc.exitCode);

    this.logger?.agent(taskId, "info", "Agent started", { pid: proc.pid, cwd, cmd });

    this.emit({ type: "agent.running", id: taskId, at: this.entries.get(taskId)?.startedAt ?? now() });
    this.emitStats(taskId);
    return { ok: true, pid: proc.pid };
  }

  /** Line-buffer a chunk into the session transcript and stream it out. */
  private onData(taskId: string, stream: "out" | "err", chunk: Buffer): void {
    const session = this.sessions.get(taskId);
    if (!session) return;
    session.pending += chunk.toString("utf8").replace(/\r/g, "\n");
    const parts = session.pending.split("\n");
    session.pending = parts.pop() ?? "";
    for (const raw of parts) {
      if (raw.length === 0) continue;
      this.appendLine(taskId, stream, raw);
    }
  }

  /** Turn one buffered line into a transcript entry and stream it out. */
  private appendLine(taskId: string, stream: "out" | "err" | "sys", raw: string): void {
    const session = this.sessions.get(taskId);
    if (!session) return;

    // claude's stream-json event shapes (nested under `message.content[]`)
    // differ from opencode's `part` shapes, so it gets its own parser branch
    // rather than a merged parser sniffing both (0109).
    if (stream === "out" && session.engine === "claude") {
      this.appendClaudeLine(taskId, session, raw);
      return;
    }
    if (stream === "out" && session.engine === "copilot") {
      this.appendCopilotLine(taskId, session, raw);
      return;
    }
    if (stream === "out" && session.engine === "qwen") {
      this.appendClaudeLine(taskId, session, raw, parseQwenEvent);
      return;
    }
    if (stream === "out" && session.engine === "codex") {
      this.appendCodexLine(taskId, session, raw);
      return;
    }

    const parsed =
      stream === "out" && session.engine === "opencode"
        ? parseJsonEvent(raw)
        : null;
    let entry: AgentOutputEntry;
    if (parsed) {
      if (parsed.sessionID && !session.sessionId) session.sessionId = parsed.sessionID;
      entry = parsed.entry;
    } else {
      // Plain line: qwen / codex output, malformed JSON, anything on stderr,
      // or a `sys` notice. Keep the legacy `{s,d}` shape and the regex
      // session-id extraction (opencode's session-id event, unknown schemas).
      entry = { s: stream, d: raw };
      this.tryExtractSessionId(raw, session);
    }
    if (stream === "out") {
      entry = this.applySignals(taskId, raw, entry, session);
    }
    this.recordEntry(taskId, session, stream, entry);
    this.lineTouched(taskId, session, raw);
  }

  /**
   * Append a transcript entry, stream it out, and enforce the output cap.
   * `sys` entries (self-heal notices) flow on the "out" stream, matching how
   * parsed `error`/`file-update` events already surface as sys lines.
   */
  private recordEntry(
    taskId: string,
    session: Session,
    stream: "out" | "err" | "sys",
    entry: AgentOutputEntry,
  ): void {
    const stamped: AgentOutputEntry = entry.at
      ? entry
      : { ...entry, at: new Date().toISOString() };
    session.lines.push(stamped);
    session.bytes += entryBytes(stamped);
    this.emit({
      type: "agent.output",
      id: taskId,
      entry: stamped,
      stream: stream === "sys" ? "out" : stream,
      at: now(),
    });
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
    }
    this.schedulePersist(taskId);
  }

  /**
   * Per-line bookkeeping shared by every append path: fold any usage/cost the
   * line reported into the session and reset the stall clock. Any output is
   * evidence the process isn't hung, so it resets the silence clock and clears
   * a stall warning immediately — the periodic check only ever needs to raise
   * the flag, never lower it.
   */
  private lineTouched(taskId: string, session: Session, raw: string): void {
    const usageChanged = this.applyUsage(session, raw);
    session.lastOutputAt = now();
    const stallCleared = session.stalledEmitted;
    session.stalledEmitted = false;
    if (usageChanged || stallCleared) this.emitStats(taskId);
  }

  /**
   * The claude stream-json branch of `appendLine` (0109). Recognized events
   * map onto structured entries, or are swallowed when they have no transcript
   * representation; anything else (a non-JSON `Warning: no stdin…` line, an
   * unknown schema) falls back to the plain-line path so nothing the CLI said
   * is lost.
   */
  private appendClaudeLine(
    taskId: string,
    session: Session,
    raw: string,
    parser: (line: string) => ClaudeParseResult | null = parseClaudeEvent,
  ): void {
    const parsed = parser(raw);
    if (!parsed) {
      const entry: AgentOutputEntry = { s: "out", d: raw };
      this.tryExtractSessionId(raw, session);
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, entry, session));
      this.lineTouched(taskId, session, raw);
      return;
    }
    if (parsed.sessionID && !session.sessionId) session.sessionId = parsed.sessionID;
    if (parsed.pendingTool) {
      // A tool call with its result still to come: buffer it and emit the card
      // only when the matching tool_result line arrives, so it carries name +
      // input + output together. If a second call starts before the first
      // resolved, flush the stale one without its output so it isn't lost.
      if (session.pendingTool && session.pendingTool.id !== parsed.pendingTool.id) {
        this.recordEntry(taskId, session, "out", this.pendingToolEntry(session.pendingTool));
      }
      session.pendingTool = parsed.pendingTool;
    } else if (parsed.toolResult) {
      const pending =
        session.pendingTool && session.pendingTool.id === parsed.toolResult.id
          ? session.pendingTool
          : undefined;
      if (pending) {
        session.pendingTool = undefined;
        this.recordEntry(taskId, session, "out", {
          type: "tool",
          tool: pending.name,
          ...(pending.input ? { input: pending.input } : {}),
          ...(parsed.toolResult.content ? { output: parsed.toolResult.content } : {}),
          ...(parsed.toolResult.isError ? { state: "error" } : {}),
        });
      }
      // An orphaned tool_result (an id we never saw a tool_use for) has
      // nothing to attach to — drop it rather than fabricate a tool card.
    } else if (parsed.entry) {
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, parsed.entry, session));
    }
    // Otherwise the line was a recognized-but-voiceless claude event (init,
    // rate_limit, thinking-only assistant message, terminal `result`) — it is
    // swallowed rather than dumped into the transcript as raw JSON.
    this.lineTouched(taskId, session, raw);
  }

  /** Copilot's JSONL branch; unlike Claude, tool start/finish events stand alone. */
  private appendCopilotLine(taskId: string, session: Session, raw: string): void {
    const parsed = parseCopilotEvent(raw);
    if (!parsed) {
      const entry: AgentOutputEntry = { s: "out", d: raw };
      this.tryExtractSessionId(raw, session);
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, entry, session));
      this.lineTouched(taskId, session, raw);
      return;
    }
    if (parsed.sessionID && !session.sessionId) session.sessionId = parsed.sessionID;
    if (parsed.entry) {
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, parsed.entry, session));
    }
    this.lineTouched(taskId, session, raw);
  }

  /** Codex has one completed item per tool/message rather than Claude blocks. */
  private appendCodexLine(taskId: string, session: Session, raw: string): void {
    const parsed = parseCodexEvent(raw);
    if (!parsed) {
      const entry: AgentOutputEntry = { s: "out", d: raw };
      this.tryExtractSessionId(raw, session);
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, entry, session));
      this.lineTouched(taskId, session, raw);
      return;
    }
    if (parsed.sessionID && !session.sessionId) session.sessionId = parsed.sessionID;
    if (parsed.entry) {
      this.recordEntry(taskId, session, "out", this.applySignals(taskId, raw, parsed.entry, session));
    }
    this.lineTouched(taskId, session, raw);
  }

  /** The transcript entry for a tool_use whose result never arrived. */
  private pendingToolEntry(pending: { name: string; input?: string }): AgentOutputEntry {
    return {
      type: "tool",
      tool: pending.name,
      ...(pending.input ? { input: pending.input } : {}),
    };
  }

  /**
   * Whether a raw line carries the exact capability-request `signal` in plain
   * or structured output. Codex `--json` wraps the final assistant response in
   * an `item.completed` event, so the signal is matched inside `item.text` too,
   * not just as a standalone line.
   */
  private signalPresent(raw: string, entry: AgentOutputEntry, signal: string): boolean {
    if (raw.trim() === signal) return true;
    if (
      "type" in entry &&
      entry.type === "text" &&
      entry.text.split("\n").some((line) => line.trim() === signal)
    ) return true;
    try {
      const event = JSON.parse(raw) as {
        type?: unknown;
        item?: { type?: unknown; text?: unknown };
      };
      return event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string" &&
        event.item.text.split("\n").some((line) => line.trim() === signal);
    } catch {
      return false;
    }
  }

  /** Recognize the exact handoff-request signal in plain or structured output. */
  private isHandoffSignal(raw: string, entry: AgentOutputEntry): boolean {
    return this.signalPresent(raw, entry, HANDOFF_READY_SIGNAL);
  }

  /** Recognize the exact managed-preview request signal (#0121). */
  private isPreviewRequestSignal(raw: string, entry: AgentOutputEntry): boolean {
    return this.signalPresent(raw, entry, PREVIEW_REQUEST_SIGNAL);
  }

  /**
   * Detect the runner's capability-request signals in one output line and act:
   * the handoff signal is recorded for turn-end finalization, and the preview
   * request is recorded for server-side start+probe at turn exit (#0121). The
   * surfaced entry becomes a trusted system line so the raw signal text never
   * clutters the transcript.
   *
   * When a handoff signal is recognized (#0235), the request is persisted to
   * disk immediately so it survives an interrupted turn or server restart.
   */
  private applySignals(taskId: string, raw: string, entry: AgentOutputEntry, session?: Session): AgentOutputEntry {
    let out = entry;
    if (this.isPreviewRequestSignal(raw, entry)) {
      const running = this.entries.get(taskId);
      if (running) running.previewRequested = true;
      out = { s: "sys", d: "✓ agent requested a managed preview" };
    }
    if (this.isHandoffSignal(raw, entry)) {
      const running = this.entries.get(taskId);
      if (running) running.handoffRequested = true;
      // Persist immediately so the request survives a crash before cleanup (#0235).
      if (running) {
        this.persistPendingHandoff({
          taskId,
          runId: running.runId,
          branch: running.branch,
          workdir: running.workdir ?? this.config.root,
          ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
        });
      }
      out = { s: "sys", d: "✓ agent requested server-side handoff" };
    }
    return out;
  }

  /**
   * Fold any usage/cost found in a raw output line into the session, clamped
   * to never move backward — some CLIs report a running total, some reset per
   * turn, and this readout must count up, never flicker down. Returns true
   * when a stored value actually changed (so callers only emit stats when
   * there's something new to show).
   *
   * The clamp also implements claude's contract naturally (0109): its terminal
   * `result` event reports the authoritative, cumulative-for-the-turn totals,
   * so `Math.max` "replaces" the per-message figures with the real number
   * rather than summing it on top of them.
   */
  private applyUsage(session: Session, raw: string): boolean {
    const found = extractUsage(raw);
    let changed = false;
    if (found.inputTokens !== undefined) {
      const next = Math.max(session.inputTokens ?? 0, found.inputTokens);
      if (next !== session.inputTokens) {
        session.inputTokens = next;
        changed = true;
      }
    }
    if (found.outputTokens !== undefined) {
      const next = Math.max(session.outputTokens ?? 0, found.outputTokens);
      if (next !== session.outputTokens) {
        session.outputTokens = next;
        changed = true;
      }
    }
    if (found.totalTokens !== undefined) {
      const next = Math.max(session.tokens ?? 0, found.totalTokens);
      if (next !== session.tokens) {
        session.tokens = next;
        changed = true;
      }
    }
    if (found.costUsd !== undefined) {
      const next = Math.max(session.costUsd ?? 0, found.costUsd);
      if (next !== session.costUsd) {
        session.costUsd = next;
        changed = true;
      }
    }
    return changed;
  }

  /** Emit the current live-stats snapshot for a task. */
  private emitStats(taskId: string): void {
    this.emit({ type: "agent.stats", id: taskId, stats: this.snapshotStats(taskId), at: now() });
  }

  /** Compute a fresh stats snapshot — always safe to call, even with no session. */
  private snapshotStats(taskId: string): AgentSessionStats {
    const session = this.sessions.get(taskId);
    const running = this.entries.has(taskId);
    const lastOutputAt = session?.lastOutputAt ?? null;
    const stalled =
      running && !!lastOutputAt && Date.now() - Date.parse(lastOutputAt) >= this.stallTimeoutMs;
    return {
      accumulatedMs: session?.accumulatedMs ?? 0,
      turnStartedAt: running ? (session?.turnStartedAt ?? null) : null,
      lastOutputAt,
      tokens: session?.tokens ?? null,
      costUsd: session?.costUsd ?? null,
      stalled,
    };
  }

  /**
   * Periodic sweep (every `stallCheckIntervalMs`) over currently-running turns:
   * raises the stall flag the moment silence crosses the threshold. Recovery
   * (new output, or the turn exiting) is handled inline where it happens, so
   * this only ever needs to turn the warning ON, never off.
   * Also polls adopted entries (0214) for PID liveness: if the adopted PID
   * died, clean up the entry so the task doesn't read as running forever.
   */
  private checkStalls(): void {
    for (const [taskId, entry] of this.entries) {
      if (entry.adoptedPid) {
        try {
          process.kill(entry.adoptedPid, 0);
        } catch {
          // PID died during adoption — clean up
          this.cleanup(taskId, false);
          continue;
        }
      }
      const session = this.sessions.get(taskId);
      if (!session || session.stalledEmitted) continue;
      if (this.snapshotStats(taskId).stalled) {
        session.stalledEmitted = true;
        this.emitStats(taskId);
      }
    }
  }

  private tryExtractSessionId(line: string, session: Session): void {
    if (session.sessionId) return;
    for (const re of SESSION_ID_PATTERNS) {
      const m = line.match(re);
      if (m?.[1]) {
        session.sessionId = m[1];
        return;
      }
    }
  }

  /**
   * Signal a running agent to stop: graceful SIGTERM first, SIGKILL after a
   * short grace period. Returns immediately; the registry clears on exit.
   */
  stop(taskId: string): StopResult {
    const entry = this.entries.get(taskId);
    if (!entry) return { stopped: false, reason: "task is not running" };
    for (const tailer of entry.tailers ?? []) {
      tailer.drain();
      tailer.flush();
      clearInterval(tailer.timer);
    }
    entry.tailers = undefined;
    if (entry.adoptedPid) {
      // For adopted entries (0214): kill by PID directly since proc is null.
      try {
        process.kill(entry.adoptedPid, "SIGTERM");
      } catch {
        /* already gone */
      }
      const adoptedPid = entry.adoptedPid;
      entry.killTimer = setTimeout(() => {
        try {
          process.kill(adoptedPid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }, 3000);
    } else if (!entry.killTimer) {
      try {
        entry.proc?.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      entry.killTimer = setTimeout(() => {
        try {
          entry.proc?.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 3000);
    }
    return { stopped: true };
  }

  /**
   * Interrupt a running AI chat response (PM, guide, debugger, …). Stops the
   * in-flight agent process via {@link stop} and appends a persistent marker to
   * the chat's transcript so the user sees the response was user-stopped rather
   * than completed normally. Idempotent — safe to call when nothing is running.
   *
   * The marker is emitted server-side (so it survives a client hydrate, not just
   * the live SSE stream) as a `sys` entry on the session. The agent's own exit
   * also triggers the generic `agent.exited` "stopped" notice client-side.
   */
  interrupt(taskId: string): StopResult {
    const wasRunning = this.entries.has(taskId);
    const result = this.stop(taskId);
    if (wasRunning && this.sessions.has(taskId)) {
      this.system(taskId, INTERRUPTED_MARKER);
    }
    return result;
  }

  /** Record a session to the database. Best-effort, never fails the server. */
  private recordSessionToDb(sessionId: string | undefined, session: Session, taskKey: string, exitedCleanly: boolean): void {
    if (!this.db || !session) return;
    try {
      // Determine session type from agent name for better aggregations
      let sessionType = "unknown";
      const agentName = session.agent?.toLowerCase() ?? "";
      if (agentName.includes("engineer") || agentName.includes("repoos")) sessionType = "engineer";
      else if (agentName.includes("review")) sessionType = "reviewer";
      else if (agentName.includes("pm")) sessionType = "pm";
      else if (agentName.includes("ross") || agentName.includes("guide")) sessionType = "guide";
      else if (agentName.includes("cto")) sessionType = "cto";
      else if (agentName.includes("tech")) sessionType = "tech-debt";
      else sessionType = taskKey ? "task" : "chat";

      // Attribute the session to the REAL task ID. The runner key (`taskKey`) is
      // the task id for engineer/review sessions, but chat-style sessions (PM)
      // are keyed by a synthetic id like `pm-task-v2:123`; stripping the prefix
      // restores the actual task so PM cost/tokens aggregate under the task
      // (0230). Non-task chats (guide) record no task id at all.
      const taskId = resolveSessionTaskId(taskKey);

      // Reuse existing session ID to accumulate multi-turn sessions into one record
      const finalSessionId = sessionId || `${taskKey}-${randomUUID()}`;
      const endedAt = new Date().toISOString();
      const elapsedMs = session.accumulatedMs;
      const agent = session.agent ?? "unknown";
      const model = session.model ?? "default";
      const codingAgent = session.engine;

      const inputTokens = session.inputTokens ?? undefined;
      const outputTokens = session.outputTokens ?? undefined;
      const totalTokens = session.tokens ?? undefined;
      let costUsd = session.costUsd ?? undefined;
      let costSource = "none";
      const isKiro = session.engine === "kiro";

      if (totalTokens && !costUsd) {
        costUsd = estimateCostUsd(totalTokens);
        costSource = "estimate";
      } else if (session.costUsd) {
        // Kiro reports credits in its billing unit, not US dollars — flag the
        // source so aggregation/UI never present it as USD (0230).
        costSource = isKiro ? "kiro-credits" : "extractUsage";
      }

      const status = exitedCleanly ? "finished" : "errored";

      // Use session creation time (first time this session started), not current time
      const startedAt = session.createdAt ?? endedAt;

      this.db.upsertSession({
        sessionId: finalSessionId,
        sessionType,
        taskId: taskId || undefined,
        agent,
        model,
        codingAgent,
        startedAt,
        endedAt,
        elapsedMs,
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
        costSource,
        status,
        lastActivityAt: session.lastOutputAt ?? endedAt,
      });
    } catch {
      // Database recording is best-effort and must never crash the server.
    }
  }

  /** Drop the registry entry for a task (idempotent) and announce it. */
  private cleanup(taskId: string, exitedCleanly: boolean): void {
    const entry = this.entries.get(taskId);
    if (!entry) return;
    // Capture before the entry is deleted below so the review-completion hook
    // can still be fired and its DB recording skipped (0288).
    const wasReview = entry.review === true;

    // Drain and flush durable-log pollers before removing the registry entry.
    // The final output may not carry a newline, so it lives in the tailer's
    // local pending buffer until this point.
    for (const tailer of entry.tailers ?? []) {
      tailer.drain();
      tailer.flush();
      clearInterval(tailer.timer);
    }
    entry.tailers = undefined;
    this.removeRegistryEntry(taskId);

    this.logger?.agent(
      taskId,
      exitedCleanly ? "info" : "error",
      `Agent exited ${exitedCleanly ? "cleanly" : "with error"}`,
      { runId: entry.runId },
    );

    const session = this.sessions.get(taskId);
    if (session && session.pending.trim()) {
      // Flush a trailing line with no final newline through the same parse
      // path: a complete JSON event becomes a structured entry, and a partial
      // one degrades to a plain line — either way nothing is lost or dropped.
      const line = session.pending.trimEnd();
      this.appendLine(taskId, "out", line);
      session.pending = "";
    }
    if (entry.killTimer) clearTimeout(entry.killTimer);
    // claude stream (0109): a tool_use whose result never arrived before the
    // turn ended still gets its card, so a call is never silently invisible.
    if ((session?.engine === "claude" || session?.engine === "qwen") && session.pendingTool) {
      this.recordEntry(taskId, session, "out", this.pendingToolEntry(session.pendingTool));
      session.pendingTool = undefined;
    }
    // Fold the finished turn's wall time into the running total (0080) — the
    // time-spent counter accumulates across turns rather than resetting each
    // time a follow-up message starts a fresh process.
    if (session?.turnStartedAt) {
      session.accumulatedMs += Date.now() - Date.parse(session.turnStartedAt);
      session.turnStartedAt = undefined;
    }
    if (session) session.stalledEmitted = false;
    this.entries.delete(taskId);
    this.drainQueue();
    // Kiro CLI does not print a session ID during the run. Capture it now by
    // querying the CLI's session list in the same cwd. Best-effort: if the
    // probe fails, sessionId stays undefined and the next turn falls back to
    // `-r` (most-recent resume). The lookup is synchronous-in-practice because
    // cleanup() is called from proc.on("close") — we fire-and-update so the
    // emit below is not delayed waiting for a CLI round-trip.
    if (session?.engine === "kiro" && !session.sessionId && entry.workdir) {
      void this.captureKiroSessionId(taskId, session, entry.workdir);
    }
    this.emit({ type: "agent.exited", id: taskId, at: now() });
    // A confirmed exit always clears any stall warning — silence is only
    // ambiguous while the process is still alive.
    if (session) this.emitStats(taskId);
    // Record session to database (best-effort). Review sessions are recorded by
    // ReviewManager's own completion handler instead, so they are skipped here
    // to avoid double-booking (0288).
    if (session && !wasReview) {
      this.recordSessionToDb(session.sessionId, session, taskId, exitedCleanly);
    }
    // Resolve task from index if not in entry (important for resume turns).
    const taskForHandoff = entry.task ?? (this.getTask ? this.getTask(taskId) : null);
    // Any non-clean exit that isn't a deliberate human pause means the task is
    // about to sit silently in its current status with nothing left running —
    // flag it the moment the process ends rather than waiting for
    // TaskWatchdog's staleness poll, which wouldn't even catch a fast
    // crash-on-exit (an expired CLI auth session, say): the process isn't
    // stalled, it's just done. Excludes `entry.handoffRequested`: that shape
    // already has its own recovery path below ("retained for recovery" on
    // next boot) and must not be double-flagged before that has a chance to
    // run.
    if (!exitedCleanly && !this.isPaused(taskId) && !entry.handoffRequested && taskForHandoff) {
      this.escalateFailedExit(taskId, taskForHandoff, session);
    }
    if (entry.handoffRequested && exitedCleanly && taskForHandoff && entry.branch && entry.workdir) {
      // Clean exit with handoff requested: clear the persisted request and fire finalization.
      this.clearPendingHandoff(taskId);
      const request: AgentHandoffRequest = {
        taskId,
        runId: entry.runId,
        branch: entry.branch,
        workdir: entry.workdir,
        ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
      };
      this.authorizedHandoffs.set(request.runId, request);
      this.handoffsInFlight.add(taskId);
      void Promise.resolve(this.onHandoff?.(request))
        .catch((err) => {
          this.appendLine(taskId, "sys", `✗ server-side handoff failed: ${(err as Error).message}`);
        })
        .finally(() => this.handoffsInFlight.delete(taskId));
    } else if (entry.handoffRequested && exitedCleanly && !taskForHandoff) {
      this.appendLine(taskId, "sys", "✗ handoff was not started because the task could not be resolved");
      this.clearPendingHandoff(taskId);
      this.persistHandoffFailure(taskId, undefined, "task could not be resolved");
    } else if (entry.handoffRequested && !exitedCleanly) {
      // Interrupted turn: the persisted request survives for recovery on next boot (#0235).
      this.appendLine(taskId, "sys", "⚠ handoff retained for recovery — the request will be finalized on the next server start");
      this.persistHandoffFailure(taskId, entry.task, "agent turn was interrupted · handoff retained for recovery");
    }
    // A preview request is honored only after a clean turn (#0121): the runner
    // mints a capability bound to that run's task/branch/worktree and hands the
    // request to the server, which owns preview process and network lifecycle.
    if (entry.previewRequested && exitedCleanly && taskForHandoff && entry.branch && entry.workdir) {
      const request: AgentPreviewRequest = {
        taskId,
        runId: entry.runId,
        branch: entry.branch,
        workdir: entry.workdir,
        ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
      };
      this.authorizedPreviews.set(request.runId, request);
      void Promise.resolve(this.onPreviewRequest?.(request)).catch((err) => {
        this.appendLine(taskId, "sys", `✗ managed preview failed: ${(err as Error).message}`);
      });
    } else if (entry.previewRequested && !exitedCleanly) {
      this.appendLine(taskId, "sys", "✗ managed preview was not started because the agent turn was interrupted");
    }
    // Defense-in-depth (0077): a turn that ended with the worktree copy at
    // `review`/`needs_input` while the main copy is still `active` means the
    // fail-safe checklist's main-copy sync silently failed (the #0068 shape).
    // Patch the main copy to match so the live board cannot drift silently.
    this.healBoardDivergence(taskId, entry, session);
    // Self-heal may have appended a final system line, so persist only after it.
    this.persist(taskId);
    if (this.pendingCompletion.delete(taskId)) this.finishCompletion(taskId);
    // A review turn completed. Fire the hook so the owning ReviewManager can
    // finalize (write the report, log "review completed", auto-bounce) from the
    // durable session — including for an entry re-attached after a reload whose
    // completion is only observed here (0288).
    if (wasReview) {
      try {
        this.onReviewDone?.(taskId, exitedCleanly, entry.reviewKind);
      } catch (err) {
        this.logger?.agent(taskId, "error", `Review completion handler failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Post-run session-id capture for Kiro CLI (#0148). Kiro does not print its
   * session id during the run; after the process exits we query the CLI's local
   * session list for the cwd and take the most-recently-updated entry — that is
   * the turn that just finished. Best-effort and fail-soft: any failure leaves
   * sessionId undefined so the next turn falls back to `-r` (most-recent resume).
   */
  private captureKiroSessionId(taskId: string, session: Session, cwd: string): Promise<void> {
    return new Promise((resolve) => {
      let proc: ChildProcess;
      try {
        proc = spawn("kiro-cli", ["chat", "--list-sessions", "--format", "json"], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch {
        resolve();
        return;
      }
      let out = "";
      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* already gone */ }
        resolve();
      }, 5000);
      proc.stdout?.on("data", (c: Buffer) => { out += c.toString("utf8"); });
      proc.on("error", () => { clearTimeout(timer); resolve(); });
      proc.on("close", () => {
        clearTimeout(timer);
        try {
          const rows = JSON.parse(out) as Array<{ cwd?: string; sessions?: Array<{ sessionId?: string }> }>;
          const sessionId = rows[0]?.sessions?.[0]?.sessionId;
          if (typeof sessionId === "string" && sessionId) {
            session.sessionId = sessionId;
            this.schedulePersist(taskId);
          }
        } catch { /* malformed JSON — leave sessionId undefined */ }
        resolve();
      });
    });
  }

  private emptySession(): Session {
    return { lines: [], pending: "", bytes: 0, engine: "plain", accumulatedMs: 0, createdAt: now(), stalledEmitted: false };
  }

  private sessionFile(taskId: string): string | null {
    // IDs can name both tasks and durable non-task conversations such as
    // `pm-task-v2:0209::alice@example.com` (per-user PM chat, 0248). Keep the
    // input strictly filename-safe, then escape the cross-platform-invalid
    // separators before constructing the path.
    if (!/^[A-Za-z0-9._:@-]+$/.test(taskId) || taskId === "." || taskId === "..") return null;
    return join(this.sessionsDir, `${taskId.replaceAll(":", "%3A").replaceAll("@", "%40")}.json`);
  }

  /** Read and validate one versioned file. Corruption/version drift fails soft. */
  private readPersisted(taskId: string): PersistedSession | null {
    const file = this.sessionFile(taskId);
    if (!file || !existsSync(file)) return null;
    try {
      const value = JSON.parse(readFileSync(file, "utf8")) as Partial<PersistedSession>;
      if (
        value.version !== SESSION_FILE_VERSION ||
        !Array.isArray(value.lines) ||
        !value.lines.every((line) => typeof line === "object" && line !== null) ||
        !["opencode", "claude", "copilot", "qwen", "codex", "kiro", "plain"].includes(value.engine as string) ||
        typeof value.updatedAt !== "string" ||
        (value.sessionId !== undefined && typeof value.sessionId !== "string") ||
        (value.workdir !== undefined && typeof value.workdir !== "string") ||
        (value.completedAt !== undefined && typeof value.completedAt !== "string") ||
        (value.agent !== undefined && typeof value.agent !== "string") ||
        (value.model !== undefined && typeof value.model !== "string")
      )
        return null;
      return value as PersistedSession;
    } catch {
      return null;
    }
  }

  private loadSession(taskId: string): Session | null {
    const saved = this.readPersisted(taskId);
    if (!saved) return null;
    const session: Session = {
      lines: [...saved.lines],
      pending: "",
      bytes: saved.lines.reduce((sum, line) => sum + entryBytes(line), 0),
      engine: saved.engine,
      sessionId: saved.sessionId,
      workdir: saved.workdir,
      createdAt: saved.createdAt,
      agent: saved.agent,
      model: saved.model,
      accumulatedMs: 0,
      stalledEmitted: false,
    };
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
    }
    return session;
  }

  /** Boot only hot lifecycle states; completed transcripts remain cold. */
  private loadHotSessions(): void {
    try {
      const hot = new Set(
        buildIndex(this.config)
          .tasks.filter((task) => task.status === "active" || task.status === "review")
          .map((task) => task.id),
      );
      for (const taskId of hot) {
        const session = this.loadSession(taskId);
        if (session) this.sessions.set(taskId, session);
      }
    } catch {
      // A bad task or unreadable cache must never prevent `repoos serve` boot.
    }
  }

  private schedulePersist(taskId: string): void {
    const existing = this.writeTimers.get(taskId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.persist(taskId), this.writeDelayMs);
    timer.unref?.();
    this.writeTimers.set(taskId, timer);
  }

  /** Atomic temp-file + rename write; persistence remains best-effort. */
  private persist(taskId: string, completedAt?: string): void {
    const timer = this.writeTimers.get(taskId);
    if (timer) clearTimeout(timer);
    this.writeTimers.delete(taskId);
    const session = this.sessions.get(taskId);
    const file = this.sessionFile(taskId);
    if (!session || !file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const payload: PersistedSession = {
        version: SESSION_FILE_VERSION,
        lines: session.lines,
        sessionId: session.sessionId,
        engine: session.engine,
        workdir: session.workdir,
        createdAt: session.createdAt,
        agent: session.agent,
        model: session.model,
        completedAt,
        updatedAt: this.clock().toISOString(),
      };
      const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify(payload, null, 2), "utf8");
        renameSync(temp, file);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
    } catch {
      // Session history is useful but must never take down the server/agent.
    }
  }

  private finishCompletion(taskId: string): void {
    const hot = this.sessions.get(taskId);
    const saved = hot ? null : this.readPersisted(taskId);
    const session = hot ?? (saved?.completedAt ? null : this.loadSession(taskId));
    if (session) {
      this.sessions.set(taskId, session);
      this.persist(taskId, this.clock().toISOString());
    }
    this.sessions.delete(taskId);
    this.pendingCompletion.delete(taskId);
    this.pruneSessions();
  }

  /** Remove completed files older than the age bound or beyond the count cap. */
  private pruneSessions(): void {
    let completed: { file: string; at: number }[] = [];
    try {
      completed = readdirSync(this.sessionsDir)
        .filter((name) => name.endsWith(".json"))
        .flatMap((name) => {
          const taskId = name.slice(0, -5);
          const saved = this.readPersisted(taskId);
          if (!saved?.completedAt) return [];
          const at = Date.parse(saved.completedAt);
          return Number.isFinite(at) ? [{ file: join(this.sessionsDir, name), at }] : [];
        })
        .sort((a, b) => b.at - a.at);
    } catch {
      return;
    }
    const cutoff = this.clock().getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
    for (let i = 0; i < completed.length; i++) {
      if (completed[i].at >= cutoff && i < this.retentionCount) continue;
      try {
        // Re-check it is still a regular file before deletion.
        if (statSync(completed[i].file).isFile()) unlinkSync(completed[i].file);
      } catch {
        /* pruning is best-effort */
      }
    }
  }

  /**
   * True when two absolute paths denote the same directory (realpath-normalized
   * when possible, so macOS /var vs /private/var aliases compare equal).
   */
  private samePath(a: string, b: string): boolean {
    try {
      return realpathSync(a) === realpathSync(b);
    } catch {
      return resolve(a) === resolve(b);
    }
  }

  /**
   * Persist a handoff failure reason to the task file's Activity log.
   * Called when a handoff signal is expected but not detected, the process
   * exits uncleanly before handoff can be finalized, or (from handoff.ts)
   * server-side finalization itself fails. This persists the reason so it
   * survives server reloads and lets the task watchdog classify the failure
   * correctly instead of falling back to its generic guess (unlike
   * in-memory transcript entries, which the watchdog cannot see).
   */
  persistHandoffFailure(taskId: string, task: Task | undefined, reason: string): void {
    if (!task) return;
    try {
      const current = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });
      recordChange(current, `handoff failed · ${reason}`);
      writeFileSync(task.absPath, serializeTask(current));
    } catch (err) {
      // Fail-soft: if we can't persist, just log — don't crash the runner
      console.error(`[repoos] failed to persist handoff failure for #${taskId}: ${(err as Error).message}`);
    }
  }

  /**
   * Best-effort one-line summary of why a turn failed. Prefers the last
   * non-empty stderr line (where CLI-level failures like an expired OAuth
   * session land), falling back to the last `sys`/error line RepoOS itself
   * parsed out of the CLI's own JSON stream, then a generic fallback.
   */
  private lastFailureLine(session: Session | undefined): string {
    if (session) {
      for (let i = session.lines.length - 1; i >= 0; i--) {
        const line = session.lines[i];
        if ("s" in line && line.s === "err" && line.d.trim()) return line.d.trim();
      }
      for (let i = session.lines.length - 1; i >= 0; i--) {
        const line = session.lines[i];
        const text =
          "type" in line && line.type === "sys" ? line.d : "s" in line && line.s === "sys" ? line.d : undefined;
        if (text?.trim()) return text.trim();
      }
    }
    return "the agent process exited with an error — open the task to see the full output";
  }

  /**
   * Flag a task for human attention the instant its agent turn ends non-
   * cleanly (and isn't a deliberate pause or an in-flight handoff recovery —
   * see the call site in cleanup()). Mirrors TaskWatchdog's own
   * `needsInput` escalation, just fired immediately instead of waiting for
   * the next staleness poll. Never overwrites an existing needsInput note.
   *
   * Also bumps `dev_error_count` — unlike the needsInput note, this always
   * increments, even on a repeat error before a human clears the flag,
   * because it counts real dev attempts, not distinct escalations (#0271
   * follow-up: confirmed live on #0291 — an engineer session that errors out
   * before ever reaching a review pass left `review_passes` at 0, so the
   * board's `D# · R#` badge showed nothing for a task that genuinely had one
   * failed dev round. TaskDrawer.vue's `taskRounds` folds this count into
   * `dev` so D can exceed R when a round errored without being reviewed.)
   */
  private escalateFailedExit(taskId: string, task: Task, session: Session | undefined): void {
    try {
      const current = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });
      const errCount = current.extra?.dev_error_count;
      current.extra = {
        ...current.extra,
        dev_error_count: (typeof errCount === "number" && Number.isFinite(errCount) ? errCount : 0) + 1,
      };
      if (current.needsInput) {
        writeFileSync(task.absPath, serializeTask(current));
        return;
      }
      current.needsInput = true;
      current.needsInputReason = "dev-error";
      const engine = session?.engine && session.engine !== "plain" ? ` (${session.engine})` : "";
      recordChange(current, `agent exited with an error${engine} · ${this.lastFailureLine(session)}`);
      writeFileSync(task.absPath, serializeTask(current));
    } catch (err) {
      console.error(`[repoos] failed to escalate failed exit for #${taskId}: ${(err as Error).message}`);
    }
  }

  /**
   * Self-heal the #0068 divergence. Narrowly scoped: ONLY the shape where the
   * main checkout's copy of the task is still `active` but the agent's
   * worktree copy shows `review` or `needs_input` backed by a real commit.
   * Any other state (task moved by a human, uncommitted worktree edit, no
   * separate worktree) is left untouched — this is not a general bidirectional
   * sync. The correction is surfaced (server log + a task.corrected event +
   * a transcript sys line) because it means the checklist itself failed.
   */
  private healBoardDivergence(taskId: string, entry: Entry, session?: Session): void {
    if (entry.skipBoardDivergence) return;
    const task = entry.task ?? (this.getTask ? this.getTask(taskId) : null);
    if (!task || !entry.workdir) return;
    const worktreeCopy = join(entry.workdir, task.path);
    if (this.samePath(task.absPath, worktreeCopy)) return; // same file — no divergence possible
    if (!existsSync(task.absPath) || !existsSync(worktreeCopy)) return;

    const parse = (absPath: string): Task | null => {
      try {
        return parseTask({
          content: readFileSync(absPath, "utf8"),
          absPath,
          root: this.config.root,
          defaultStatus: this.config.defaultStatus,
          defaultAssignee: this.config.defaultAssignee,
        });
      } catch {
        return null;
      }
    };

    const main = parse(task.absPath);
    const wt = parse(worktreeCopy);
    if (!main || !wt) return;
    // Only the active-but-worktree-shows-review/needs_input divergence.
    if (main.status !== "active") return;
    const wantsReview = wt.status === "review";
    const wantsInput = wt.needsInput;
    if (!wantsReview && !wantsInput) return;
    // The worktree state must be backed by a commit, not a stray mid-edit.
    if (!fileCommittedClean(entry.workdir, task.path)) return;

    const patch: TaskPatch = {};
    if (wantsReview) patch.status = "review";
    if (wantsInput) {
      patch.needsInput = true;
      patch.needsInputReason = wt.needsInputReason;
    }
    try {
      patchTaskFile(this.config, task.absPath, patch);
    } catch (err) {
      console.error(`[repoos] self-heal failed for #${taskId}: ${(err as Error).message}`);
      return;
    }
    const note =
      `agent turn ended with the main copy still ${main.status} while the worktree copy was ` +
      `committed to ${wantsReview ? "review" : "needs_input"} — main copy patched to match`;
    if (session) this.appendLine(taskId, "sys", `⚠ board self-healed: ${note}`);
    this.emit({ type: "task.corrected", id: taskId, path: task.path, note, at: now() });
    console.error(`[repoos] self-healed task #${taskId} — ${note}`);
  }
}
