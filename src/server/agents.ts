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
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Agent, AgentOutputEntry, AgentSessionStats, RepoOSConfig, Task } from "../core/types.js";
import { DEFAULT_AGENTS } from "../core/config.js";
import { fileCommittedClean } from "../core/git.js";
import { parseTask } from "../core/task.js";
import { patchTaskFile, type TaskPatch } from "./write.js";

/** The SSE events the runner emits. Subset of RepoEvent. */
export type AgentEvent =
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
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

/** A capability minted by the runner for one completed agent turn. */
export interface AgentHandoffRequest {
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
  proc: ChildProcess;
  startedAt: string;
  workdir?: string;
  killTimer?: ReturnType<typeof setTimeout>;
  /** The task being worked on (start turns only — resume turns have none). */
  task?: Task;
  branch: string;
  runId: string;
  handoffRequested: boolean;
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
  /** Whether the session runs a structured-event CLI (opencode `--format json`
   *  or claude code `--output-format stream-json`) or a plain-line CLI (qwen /
   *  codex). claude gets its own branch because its stream-json event shapes
   *  (nested under `message.content[]`) differ from opencode's `part` shapes. */
  engine: "opencode" | "claude" | "plain";
  /** Cumulative ms across completed turns — excludes any turn in flight (0080). */
  accumulatedMs: number;
  /** ISO timestamp the current turn started, or undefined when no turn is running. */
  turnStartedAt?: string;
  /** ISO timestamp of the most recent output line, or undefined until first output. */
  lastOutputAt?: string;
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

/**
 * Default silence window before a still-running turn is flagged as possibly
 * stalled (0080). Conservative on purpose: silence alone is never proof of a
 * hang (the agent could just be thinking through a slow step), so this only
 * fires a neutral "may be stalled" warning, never a definitive "it's dead."
 * `AgentRunner`'s constructor accepts an override for tests.
 */
export const DEFAULT_STALL_TIMEOUT_MS = 90_000;

/**
 * Best-effort usage/cost extraction from one raw output line. Tries a JSON
 * parse first (codex `--json` usage events, opencode payloads carrying usage)
 * and falls back to plain-text patterns (the kind of human-readable summary
 * claude/qwen print). Returns only the fields it actually found — this must
 * never fabricate a number for a CLI that reports nothing.
 */
export function extractUsage(raw: string): { tokens?: number; costUsd?: number } {
  const out: { tokens?: number; costUsd?: number } = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const tokens = tokensFromObject(obj);
      if (tokens !== undefined) out.tokens = tokens;
      const cost = costFromObject(obj);
      if (cost !== undefined) out.costUsd = cost;
    }
  } catch {
    /* not JSON — fall through to text patterns below */
  }
  if (out.tokens === undefined) {
    const m = raw.match(/\btotal[_ ]tokens\b["'\s:=]+([\d,]+)/i) ?? raw.match(/\b([\d,]+)\s+tokens\b/i);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) out.tokens = n;
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
  return out;
}

/**
 * Locate a `usage`-shaped block: top-level (codex/opencode events and claude's
 * terminal `result`) or nested at `message.usage` (claude per-`assistant`
 * events, 0109).
 */
function findUsage(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  if (obj.usage && typeof obj.usage === "object") return obj.usage as Record<string, unknown>;
  const msg = obj.message;
  if (msg && typeof msg === "object") {
    const m = msg as Record<string, unknown>;
    if (m.usage && typeof m.usage === "object") return m.usage as Record<string, unknown>;
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

/** Best-effort session-id extraction from agent output (opencode / claude). */
const SESSION_ID_PATTERNS: RegExp[] = [
  /"session_id"\s*:\s*"([^"]+)"/,
  /session[ \t]+id[:\s]*["']?([A-Za-z0-9][A-Za-z0-9_.-]{5,})/i,
];

/**
 * Which structured-event engine (if any) a session should use for a CLI. Both
 * structured engines parse newline-delimited JSON events; they differ only in
 * event shape (`part` vs `message.content[]`), so each gets its own parser
 * branch in `appendLine`. qwen/codex stay on the plain-line path — their
 * stream-json payloads have never been mapped onto `AgentOutputEntry` shapes.
 */
function engineForCli(cli: string): Session["engine"] {
  if (cli === "claude code") return "claude";
  if (cli === "qwen code" || cli === "codex") return "plain";
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
    default:
      return null;
  }
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

/** Resolve the enabled `engineer` agent, or null when none is configured. */
export function resolveEngineer(config: RepoOSConfig): Agent | null {
  const list = config.agents?.length ? config.agents : DEFAULT_AGENTS;
  return list.find((a) => a.enabled && a.name === "engineer") ?? null;
}

/** Resolve the enabled `pm` agent, or null when none is configured. */
export function resolvePmAgent(config: RepoOSConfig): Agent | null {
  const list = config.agents?.length ? config.agents : DEFAULT_AGENTS;
  return list.find((a) => a.enabled && a.name === "pm") ?? null;
}

/**
 * Resolve the enabled `reviewer` agent, or null when it is disabled/absent.
 *
 * This is the single source of truth for whether a task landing in `review`
 * gets an automatic agent review (0101): the Agents page writes the toggle
 * into `repoos.toml`, and null here means "no agent review runs".
 */
export function resolveReviewer(config: RepoOSConfig): Agent | null {
  const list = config.agents?.length ? config.agents : DEFAULT_AGENTS;
  return list.find((a) => a.enabled && a.name === "reviewer") ?? null;
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
export function resolveAgentForTask(
  config: RepoOSConfig,
  task: Task,
  role: string = "engineer",
): Agent | null {
  const list = config.agents?.length ? config.agents : DEFAULT_AGENTS;
  const hasOverride = task.agentOverride || task.cliOverride || task.modelOverride;
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
    ...(task.modelOverride ? { model: task.modelOverride } : {}),
  };
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
        "--verbose",
        "--dangerously-skip-permissions",
      ],
    };
  }
  if (cli === "qwen code") {
    return { cmd: "qwen", args: ["-p", mission, ...modelArgs(cli, model), "--output-format", "stream-json"] };
  }
  if (cli === "codex") {
    return { cmd: "codex", args: ["exec", mission, ...modelArgs(cli, model), "--json", "--sandbox", "workspace-write"] };
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
      ],
    };
  }
  if (cli === "codex") {
    return {
      cmd: "codex",
      args: [
        "exec",
        "resume",
        ...(sessionId ? [sessionId] : ["--last"]),
        text,
        ...modelArgs(cli, model),
        "--json",
        "--sandbox",
        "workspace-write",
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
    "2. Run `repoos check` and confirm it passes (build, typecheck, tests, UI smoke test). It MUST be green before requesting handoff.",
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
    "## UI previews are server-owned — never run `repoos serve` yourself",
    "",
    "RepoOS owns previews and the control-plane port (7171). Do NOT launch `repoos serve` directly, do not choose a port, and never run a long-lived serve process: that competes with the main server and other tasks, and direct serve attempts from agent processes are rejected. Preview ports and lifecycle are managed for you.",
    "",
    "To verify a UI change, request THIS task's managed preview (idempotent — repeat requests return the same URL):",
    "",
    `    curl -s -X POST "\${REPOOS_API_URL}/api/tasks/\${REPOOS_TASK_ID}/preview"`,
    "",
    "Parse the JSON response — {\"ok\": true, \"port\": <port>, \"url\": \"http://127.0.0.1:<port>\"} — and use the returned `url` to view or probe the worktree UI. The preview is reaped automatically when the task leaves active/review.",
    "",
    "If the request errors, stop and report the error. Do NOT fall back to launching your own server.",
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
 */
export function reviewCommand(
  agent: Agent,
  prompt: string,
  cwd: string,
): { cmd: string; args: string[] } {
  const extra = modelArgs(agent.cli, agent.model);
  if (agent.cli === "claude code") {
    return { cmd: "claude", args: ["-p", prompt, ...extra, "--dangerously-skip-permissions"] };
  }
  if (agent.cli === "qwen code") return { cmd: "qwen", args: ["-p", prompt, ...extra] };
  if (agent.cli === "codex") return { cmd: "codex", args: ["exec", prompt, ...extra] };
  return { cmd: "opencode", args: ["run", "--dir", cwd, ...extra, "--auto", prompt] };
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
    const forwardChunk = (c: Buffer): void => {
      out.push(c);
      if (!opts.onLine) return;
      pending += c.toString("utf8").replace(/\r/g, "\n");
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      for (const part of parts) {
        if (part.length === 0) continue;
        opts.onLine(part);
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
      // Flush a trailing line with no final newline so nothing is held back.
      if (opts.onLine && pending.trim()) opts.onLine(pending.trimEnd());
      pending = "";
      const output = Buffer.concat(out).toString("utf8").trim();
      const stderr = Buffer.concat(errOut).toString("utf8").trim();
      if (output) {
        resolve({ ok: true, output });
        return;
      }
      const reason = stderr
        ? stderr.split("\n").slice(-3).join(" ").trim()
        : "no output produced";
      resolve({ ok: false, error: `${cmd} exited without output: ${reason}` });
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
  private readonly emit: (e: AgentEvent) => void;
  /**
   * The main RepoOS server's own API URL, injected into every agent process so
   * the mission's managed-preview request resolves the ACTUAL control plane,
   * never a hardcoded port.
   */
  apiUrl?: string;
  private readonly stallTimeoutMs: number;
  private readonly stallTimer: ReturnType<typeof setInterval>;

  private readonly authorizedHandoffs = new Map<string, AgentHandoffRequest>();
  private readonly handoffsInFlight = new Set<string>();
  private readonly onHandoff?: (request: AgentHandoffRequest) => void | Promise<void>;

  /**
   * `opts.stallTimeoutMs` overrides the 90s default (tests use a small value
   * so stall detection doesn't need a real 90s wait); `opts.stallCheckIntervalMs`
   * overrides the poll cadence, which otherwise scales with the timeout.
   */
  constructor(
    config: RepoOSConfig,
    emit: (e: AgentEvent) => void,
    opts: { stallTimeoutMs?: number; stallCheckIntervalMs?: number; onHandoff?: (request: AgentHandoffRequest) => void | Promise<void> } = {},
  ) {
    this.config = config;
    this.emit = emit;
    this.onHandoff = opts.onHandoff;
    this.stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    const checkMs =
      opts.stallCheckIntervalMs ?? Math.max(20, Math.min(5000, Math.floor(this.stallTimeoutMs / 3)));
    this.stallTimer = setInterval(() => this.checkStalls(), checkMs);
    this.stallTimer.unref();
  }

  /** Stop the stall-check timer (server shutdown / test cleanup). Idempotent. */
  dispose(): void {
    clearInterval(this.stallTimer);
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

  isRunning(taskId: string): boolean {
    return this.entries.has(taskId);
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
        pid: e.proc.pid ?? -1,
        startedAt: e.startedAt,
        workdir: e.workdir,
      });
    }
    return out;
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
    if (this.entries.has(task.id) || this.handoffsInFlight.has(task.id)) {
      return { ok: false, reason: "task is already running or finalizing" };
    }
    const cwd = opts.cwd ?? this.config.root;
    const session =
      this.sessions.get(task.id) ??
      {
        lines: [],
        pending: "",
        bytes: 0,
        engine: "plain" as const,
        accumulatedMs: 0,
        stalledEmitted: false,
      };
    session.workdir = cwd;
    session.engine = engineForCli(agent.cli);
    session.task = task;
    session.branch = branch;
    this.sessions.set(task.id, session);
    const mission = missionFor(task, branch, cwd, agent, this.config, opts.contextPack, opts.resumePreamble);
    const { cmd, args } = cliCommand(agent, mission, cwd);
    return this.spawnTurn(task.id, cmd, args, cwd, task, branch);
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
    opts: { resumePreamble?: string } = {},
  ): StartResult {
    const session = this.sessions.get(taskId);
    if (!session) {
      return { ok: false, reason: "no session for this task — start work first" };
    }
    if (this.entries.has(taskId) || this.handoffsInFlight.has(taskId)) {
      return { ok: false, busy: true, reason: "agent is busy — wait for the current turn or handoff to finish" };
    }
    const entry: AgentOutputEntry = { type: "human", text };
    session.lines.push(entry);
    session.bytes += entryBytes(entry);
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
    }
    const fullText = opts.resumePreamble
      ? `${opts.resumePreamble}\n\n${text}`
      : text;
    const { cmd, args } = resumeCommand(agent, fullText, session.sessionId, session.workdir ?? this.config.root);
    return this.spawnTurn(
      taskId,
      cmd,
      args,
      session.workdir ?? this.config.root,
      session.task,
      session.branch,
    );
  }

  /** The retained transcript for a task, or null when no session exists. */
  output(taskId: string): Session | null {
    return this.sessions.get(taskId) ?? null;
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
  ): StartResult {
    const runId = randomUUID();
    let proc: ChildProcess;
    try {
      // REPOOS_AGENT=1 marks every managed agent process so the CLI's defense
      // in depth can reject an accidental direct `repoos serve` attempt, and
      // REPOOS_API_URL/REPOOS_TASK_ID give the agent the one task-scoped way to
      // request a managed preview (ADR-0005: agents express intent, RepoOS owns
      // privileged process/network lifecycle).
      proc = spawn(cmd, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          REPOOS_AGENT: "1",
          REPOOS_TASK_ID: taskId,
          REPOOS_RUN_ID: runId,
          ...(this.apiUrl ? { REPOOS_API_URL: this.apiUrl } : {}),
        },
      });
    } catch (err) {
      this.emit({ type: "agent.exited", id: taskId, at: now() });
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    }
    proc.stdout?.on("data", (chunk: Buffer) => this.onData(taskId, "out", chunk));
    proc.stderr?.on("data", (chunk: Buffer) => this.onData(taskId, "err", chunk));
    this.entries.set(taskId, {
      proc,
      startedAt: now(),
      workdir: cwd,
      task,
      branch: branch ?? task?.branch ?? "",
      runId,
      handoffRequested: false,
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
    // Either path means the run is over: natural exit, spawn error (e.g. the
    // CLI isn't installed), or our own SIGKILL after a graceful pause. `close`
    // (not `exit`) fires only after stdio has drained, so a trailing line with
    // no final newline is still in `pending` when cleanup flushes it.
    proc.on("close", (code) => this.cleanup(taskId, code === 0));
    proc.on("error", () => this.cleanup(taskId, false));

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
    if (stream === "out" && this.isHandoffSignal(raw, entry)) {
      const running = this.entries.get(taskId);
      if (running) running.handoffRequested = true;
      entry = { s: "sys", d: "✓ agent requested server-side handoff" };
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
    session.lines.push(entry);
    session.bytes += entryBytes(entry);
    this.emit({
      type: "agent.output",
      id: taskId,
      entry,
      stream: stream === "sys" ? "out" : stream,
      at: now(),
    });
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
    }
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
  private appendClaudeLine(taskId: string, session: Session, raw: string): void {
    const parsed = parseClaudeEvent(raw);
    if (!parsed) {
      this.recordEntry(taskId, session, "out", { s: "out", d: raw });
      this.tryExtractSessionId(raw, session);
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
      if (this.isHandoffSignal(raw, parsed.entry)) {
        const running = this.entries.get(taskId);
        if (running) running.handoffRequested = true;
        this.recordEntry(taskId, session, "out", { s: "sys", d: "✓ agent requested server-side handoff" });
      } else {
        this.recordEntry(taskId, session, "out", parsed.entry);
      }
    }
    // Otherwise the line was a recognized-but-voiceless claude event (init,
    // rate_limit, thinking-only assistant message, terminal `result`) — it is
    // swallowed rather than dumped into the transcript as raw JSON.
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

  /** Recognize the exact capability-request signal in plain or structured output. */
  private isHandoffSignal(raw: string, entry: AgentOutputEntry): boolean {
    if (raw.trim() === HANDOFF_READY_SIGNAL) return true;
    return "type" in entry && entry.type === "text" && entry.text.trim() === HANDOFF_READY_SIGNAL;
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
    if (found.tokens !== undefined) {
      const next = Math.max(session.tokens ?? 0, found.tokens);
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
   */
  private checkStalls(): void {
    for (const taskId of this.entries.keys()) {
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
    if (!entry.killTimer) {
      try {
        entry.proc.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      entry.killTimer = setTimeout(() => {
        try {
          entry.proc.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 3000);
    }
    return { stopped: true };
  }

  /** Drop the registry entry for a task (idempotent) and announce it. */
  private cleanup(taskId: string, exitedCleanly: boolean): void {
    const entry = this.entries.get(taskId);
    if (!entry) return;
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
    if (session?.engine === "claude" && session.pendingTool) {
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
    this.emit({ type: "agent.exited", id: taskId, at: now() });
    // A confirmed exit always clears any stall warning — silence is only
    // ambiguous while the process is still alive.
    if (session) this.emitStats(taskId);
    if (entry.handoffRequested && exitedCleanly && entry.task && entry.branch && entry.workdir) {
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
    } else if (entry.handoffRequested && !exitedCleanly) {
      this.appendLine(taskId, "sys", "✗ handoff was not started because the agent turn was interrupted");
    }
    // Defense-in-depth (0077): a turn that ended with the worktree copy at
    // `review`/`needs_input` while the main copy is still `active` means the
    // fail-safe checklist's main-copy sync silently failed (the #0068 shape).
    // Patch the main copy to match so the live board cannot drift silently.
    this.healBoardDivergence(taskId, entry, session);
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
   * Self-heal the #0068 divergence. Narrowly scoped: ONLY the shape where the
   * main checkout's copy of the task is still `active` but the agent's
   * worktree copy shows `review` or `needs_input` backed by a real commit.
   * Any other state (task moved by a human, uncommitted worktree edit, no
   * separate worktree) is left untouched — this is not a general bidirectional
   * sync. The correction is surfaced (server log + a task.corrected event +
   * a transcript sys line) because it means the checklist itself failed.
   */
  private healBoardDivergence(taskId: string, entry: Entry, session?: Session): void {
    const task = entry.task;
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
    if (wantsInput) patch.needsInput = true;
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
