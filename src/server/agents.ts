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
import type { Agent, RepoOSConfig, Task } from "../core/types.js";
import { DEFAULT_AGENTS } from "../core/config.js";

/** The SSE events the runner emits. Subset of RepoEvent. */
export type AgentEvent =
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string }
  | {
      type: "agent.output";
      id: string;
      data: string;
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

/** One rendered line of an agent session transcript. */
export interface AgentOutputLine {
  s: "out" | "err" | "sys";
  d: string;
}

interface Entry {
  proc: ChildProcess;
  startedAt: string;
  workdir?: string;
  killTimer?: ReturnType<typeof setTimeout>;
}

/** Line-buffered transcript for one task, retained across turns and pause. */
interface Session {
  lines: AgentOutputLine[];
  pending: string;
  bytes: number;
  workdir?: string;
  sessionId?: string;
}

const now = (): string => new Date().toISOString();

/** Hard cap on a session transcript (drop oldest lines beyond this). */
const OUTPUT_CAP_BYTES = 256 * 1024;

/** Best-effort session-id extraction from agent output (opencode / claude). */
const SESSION_ID_PATTERNS: RegExp[] = [
  /"session_id"\s*:\s*"([^"]+)"/,
  /session[ \t]+id[:\s]*["']?([A-Za-z0-9][A-Za-z0-9_.-]{5,})/i,
];

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

/**
 * Map an agent `cli` string to the binary + args that run it headless.
 *
 * opencode re-resolves its project directory from `--git-common-dir`, which
 * for a linked worktree points at the main repo's `.git` — so every worktree
 * path would be treated as `external_directory` and auto-rejected. `--dir`
 * forces the worktree path explicitly. claude code uses the spawn `cwd` and
 * needs no flag.
 */
function cliCommand(cli: string, mission: string, cwd: string): { cmd: string; args: string[] } {
  if (cli === "claude code") return { cmd: "claude", args: ["-p", mission] };
  // default: opencode's headless `run` mode
  return { cmd: "opencode", args: ["run", "--dir", cwd, mission] };
}

/**
 * Map a follow-up turn to a resume invocation that continues the SAME session.
 * claude: `-p --resume <id>` (falls back to `-c --continue` when the id is
 * unknown). opencode: `run --session <id>`. Both degrade to a fresh run with
 * the user's text if resume metadata is unavailable — the turn still happens.
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
      args: ["-p", ...(sessionId ? ["--resume", sessionId] : ["-c", "--continue"]), text],
    };
  }
  return {
    cmd: "opencode",
    args: [
      "run",
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
    const session = this.sessions.get(task.id) ?? { lines: [], pending: "", bytes: 0 };
    session.workdir = cwd;
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
    // CLI isn't installed), or our own SIGKILL after a graceful pause.
    proc.on("exit", () => this.cleanup(taskId));
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
      session.lines.push({ s: stream, d: raw });
      session.bytes += raw.length + 1;
      this.tryExtractSessionId(raw, session);
      this.emit({ type: "agent.output", id: taskId, data: raw, stream, at: now() });
    }
    while (session.bytes > OUTPUT_CAP_BYTES) {
      const dropped = session.lines.shift();
      if (!dropped) break;
      session.bytes -= dropped.d.length + 1;
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
      const line = session.pending.trimEnd();
      session.lines.push({ s: "out", d: line });
      session.bytes += line.length + 1;
      this.emit({ type: "agent.output", id: taskId, data: line, stream: "out", at: now() });
      session.pending = "";
    }
    if (entry.killTimer) clearTimeout(entry.killTimer);
    this.entries.delete(taskId);
    this.emit({ type: "agent.exited", id: taskId, at: now() });
  }
}
