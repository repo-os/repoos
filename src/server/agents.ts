/**
 * The agent runner: launches the repo's default coding agent against a task on
 * its branch, tracks running processes, and supports graceful pause.
 *
 * Zero runtime deps — `node:child_process` only. Everything here is best-effort:
 * a missing CLI or a broken agent config must never crash the server or block
 * an HTTP response, so spawns are async-fired and failures surface as events.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join, relative } from "node:path";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../core/types.js";
import { DEFAULT_AGENTS } from "../core/config.js";

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
    };

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
}

/** Line-buffered transcript for one task, retained across turns and pause. */
interface Session {
  lines: AgentOutputEntry[];
  pending: string;
  bytes: number;
  workdir?: string;
  sessionId?: string;
  /** Whether the session runs the opencode CLI (structured JSON events). */
  engine: "opencode" | "plain";
}

const now = (): string => new Date().toISOString();

/** Hard cap on a session transcript (drop oldest lines beyond this). */
const OUTPUT_CAP_BYTES = 256 * 1024;

/** Best-effort session-id extraction from agent output (opencode / claude). */
const SESSION_ID_PATTERNS: RegExp[] = [
  /"session_id"\s*:\s*"([^"]+)"/,
  /session[ \t]+id[:\s]*["']?([A-Za-z0-9][A-Za-z0-9_.-]{5,})/i,
];

/** True when the agent's CLI is opencode (emits structured JSON events). */
function isOpenCode(cli: string): boolean {
  return cli !== "claude code" && cli !== "qwen code" && cli !== "codex";
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
      return { entry: { type: "step", kind: "start" }, sessionID };
    case "step_finish":
      return {
        entry: {
          type: "step",
          kind: "finish",
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
 * Map an agent `cli` string to the binary + args that run it headless.
 *
 * opencode re-resolves its project directory from `--git-common-dir`, which
 * for a linked worktree points at the main repo's `.git` — so every worktree
 * path would be treated as `external_directory` and auto-rejected. `--dir`
 * forces the worktree path explicitly. claude code and qwen code use the spawn
 * `cwd` and need no flag.
 *
 * Verified flags (0042/0043):
 * - claude code: `claude -p <prompt> --dangerously-skip-permissions` (print
 *   mode). The permission flag is REQUIRED here, not optional: the agent is
 *   spawned with stdin ignored, so no approval prompt can ever reach a human.
 *   Without it every non-read-only command (`bun`, `repoos check`, writes) is
 *   denied instantly, the agent stalls explaining it needs approval, and the
 *   task is left stuck in `active` with no changes. Same intent as codex's
 *   `--sandbox workspace-write` below; the blast radius is the task's own
 *   git worktree.
 * - qwen code: `qwen -p <prompt> --output-format stream-json` — stream-json
 *   emits one JSON event per line, which streams live and carries a
 *   `session_id` RepoOS can resume.
 * - codex: `codex exec <prompt> --json --sandbox workspace-write` — `--json`
 *   streams newline-delimited events; `--sandbox workspace-write` lets the
 *   agent edit files inside the worktree (the default is read-only).
 */
function cliCommand(cli: string, mission: string, cwd: string): { cmd: string; args: string[] } {
  if (cli === "claude code") {
    return { cmd: "claude", args: ["-p", mission, "--dangerously-skip-permissions"] };
  }
  if (cli === "qwen code") {
    return { cmd: "qwen", args: ["-p", mission, "--output-format", "stream-json"] };
  }
  if (cli === "codex") {
    return { cmd: "codex", args: ["exec", mission, "--json", "--sandbox", "workspace-write"] };
  }
  // default: opencode's headless `run` mode. `--format json` streams one JSON
  // event per line (step_start / text / tool_use / step_finish / error) that
  // the runner parses into structured transcript entries. `--dir` (0044) keeps
  // the worktree path explicit so linked-worktree paths are never auto-rejected.
  return {
    cmd: "opencode",
    args: ["run", "--format", "json", "--dir", cwd, mission],
  };
}

/**
 * Map a follow-up turn to a resume invocation that continues the SAME session.
 * claude: `-p --resume <id>` (falls back to `-c --continue` when the id is
 * unknown). opencode: `run --format json --session <id>`. qwen: `--resume <id>`
 * / `--continue` with `-p` + stream-json. codex: `exec resume <id>` / `exec
 * resume --last`.
 * All degrade to a fresh run with the user's text if resume metadata is
 * unavailable — the turn still happens.
 */
function resumeCommand(
  cli: string,
  text: string,
  sessionId?: string,
  cwd?: string,
): { cmd: string; args: string[] } {
  if (cli === "claude code") {
    return {
      cmd: "claude",
      args: [
        "-p",
        ...(sessionId ? ["--resume", sessionId] : ["-c", "--continue"]),
        text,
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
): string {
  // The same task file exists in the worktree (checked out on `branch`) and in
  // the main checkout. The live board reads the MAIN copy; the branch carries
  // the worktree copy. Status edits must reach BOTH so the user sees review
  // immediately without serving a per-task port.
  const worktreeTask = join(workdir, relative(config.root, task.path));
  return [
    agent.instructions?.trim() ? agent.instructions.trim() : "Implement this task.",
    "",
    `Task #${task.id}: ${task.title}`,
    `Working directory: ${workdir} (a git worktree checked out on branch ${branch} — work here).`,
    `Task file (this worktree — edit + commit on the branch): ${worktreeTask}`,
    `Task file (main checkout — the live board reads this copy): ${task.path}`,
    "",
    "Follow the repo's AGENTS.md operating loop:",
    "1. Read the task file and implement what it describes.",
    "2. Run `repoos check` and confirm it passes (build, typecheck, tests, UI smoke test).",
    "3. Set the task status to `review` in BOTH copies of the task file: update the `status` field in the worktree copy above and commit that change on the branch, AND update the main-checkout copy (the second path above) the same way WITHOUT committing there — the board on the main server reads the main copy, so editing it is how the user sees your update. Leave the branch open — do NOT merge or delete the branch.",
    "",
    "Work in turns: finish the requested work, then stop and report. The session can be continued later with follow-up instructions from the user.",
    "",
    "If this working directory has no build artifacts yet, build before relying on the `repoos` CLI — it warns when its build is stale.",
  ].join("\n");
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
 * `exec`. Mirrors `cliCommand` (the streaming runner) exactly — the configured
 * model is a RepoOS-side label, not a model id either CLI accepts, so it is
 * deliberately not forwarded.
 */
function promptCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  if (agent.cli === "claude code") return { cmd: "claude", args: ["-p", prompt] };
  if (agent.cli === "qwen code") return { cmd: "qwen", args: ["-p", prompt] };
  if (agent.cli === "codex") return { cmd: "codex", args: ["exec", prompt] };
  return { cmd: "opencode", args: ["run", prompt] };
}

/**
 * Run a coding agent once, non-interactively, and capture its full stdout.
 * Unlike the streaming runner this is synchronous — callers wait for the whole
 * answer (e.g. freeform task creation). Never throws: failures and timeouts
 * resolve as `{ ok: false, error }` so an HTTP handler can respond cleanly.
 */
export function runPrompt(
  agent: Agent,
  prompt: string,
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<PromptResult> {
  const cwd = opts.cwd ?? process.cwd();
  const timeoutMs = opts.timeoutMs ?? PROMPT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const { cmd, args } = promptCommand(agent, prompt);
    let proc: ChildProcess;
    try {
      proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      resolve({ ok: false, error: `could not launch ${cmd}: ${reason}` });
      return;
    }

    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    proc.stdout?.on("data", (c: Buffer) => out.push(c));
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
    proc.on("exit", () => done());
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

  constructor(config: RepoOSConfig, emit: (e: AgentEvent) => void) {
    this.config = config;
    this.emit = emit;
  }

  isRunning(taskId: string): boolean {
    return this.entries.has(taskId);
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
  start(task: Task, branch: string, agent: Agent, opts: { cwd?: string } = {}): StartResult {
    if (this.entries.has(task.id)) {
      return { ok: false, reason: "task is already running" };
    }
    const cwd = opts.cwd ?? this.config.root;
    const session = this.sessions.get(task.id) ?? { lines: [], pending: "", bytes: 0, engine: "plain" as const };
    session.workdir = cwd;
    session.engine = isOpenCode(agent.cli) ? "opencode" : "plain";
    this.sessions.set(task.id, session);
    const { cmd, args } = cliCommand(agent.cli, missionFor(task, branch, cwd, agent, this.config), cwd);
    return this.spawnTurn(task.id, cmd, args, cwd);
  }

  /**
   * Send a follow-up message to a task's session, resuming the same
   * conversation as a new turn. Rejected when the task has no session yet
   * (`ok: false`) or when a turn is already running (`ok: false, busy: true`).
   */
  send(taskId: string, text: string, agent: Agent): StartResult {
    const session = this.sessions.get(taskId);
    if (!session) {
      return { ok: false, reason: "no session for this task — start work first" };
    }
    if (this.entries.has(taskId)) {
      return { ok: false, busy: true, reason: "agent is busy — wait for the current turn to finish" };
    }
    const { cmd, args } = resumeCommand(agent.cli, text, session.sessionId, session.workdir ?? this.config.root);
    return this.spawnTurn(taskId, cmd, args, session.workdir ?? this.config.root);
  }

  /** The retained transcript for a task, or null when no session exists. */
  output(taskId: string): Session | null {
    return this.sessions.get(taskId) ?? null;
  }

  /**
   * Spawn one turn and attach streaming. Everything after the spawn is async;
   * failures surface as agent.exited via cleanup.
   */
  private spawnTurn(taskId: string, cmd: string, args: string[], cwd: string): StartResult {
    let proc: ChildProcess;
    try {
      proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
    });
    // Either path means the run is over: natural exit, spawn error (e.g. the
    // CLI isn't installed), or our own SIGKILL after a graceful pause. `close`
    // (not `exit`) fires only after stdio has drained, so a trailing line with
    // no final newline is still in `pending` when cleanup flushes it.
    proc.on("close", () => this.cleanup(taskId));
    proc.on("error", () => this.cleanup(taskId));

    this.emit({ type: "agent.running", id: taskId, at: this.entries.get(taskId)?.startedAt ?? now() });
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
  private appendLine(taskId: string, stream: "out" | "err", raw: string): void {
    const session = this.sessions.get(taskId);
    if (!session) return;
    const parsed =
      session.engine === "opencode" && stream === "out"
        ? parseJsonEvent(raw)
        : null;
    let entry: AgentOutputEntry;
    if (parsed) {
      if (parsed.sessionID && !session.sessionId) session.sessionId = parsed.sessionID;
      entry = parsed.entry;
    } else {
      // Plain line: claude / qwen / codex output, malformed JSON, or anything
      // on stderr. Keep the legacy `{s,d}` shape and the regex session-id
      // extraction.
      entry = { s: stream, d: raw };
      this.tryExtractSessionId(raw, session);
    }
    session.lines.push(entry);
    session.bytes += entryBytes(entry);
    this.emit({ type: "agent.output", id: taskId, entry, stream, at: now() });
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= entryBytes(dropped);
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
  private cleanup(taskId: string): void {
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
    this.entries.delete(taskId);
    this.emit({ type: "agent.exited", id: taskId, at: now() });
  }
}
