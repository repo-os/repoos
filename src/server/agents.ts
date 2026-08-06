/**
 * The agent runner: launches the repo's default coding agent against a task on
 * its branch, tracks running processes, and supports graceful pause.
 *
 * Zero runtime deps — `node:child_process` only. Everything here is best-effort:
 * a missing CLI or a broken agent config must never crash the server or block
 * an HTTP response, so spawns are async-fired and failures surface as events.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { Agent, RepoOSConfig, Task } from "../core/types.js";
import { DEFAULT_AGENTS } from "../core/config.js";

/** The SSE events the runner emits. Subset of RepoEvent. */
export type AgentEvent =
  | { type: "agent.running"; id: string; at: string }
  | { type: "agent.exited"; id: string; at: string };

export interface StartResult {
  ok: boolean;
  pid?: number;
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

const now = (): string => new Date().toISOString();

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

/** Map an agent `cli` string to the binary + args that run it headless. */
function cliCommand(cli: string, mission: string): { cmd: string; args: string[] } {
  if (cli === "claude code") return { cmd: "claude", args: ["-p", mission] };
  // default: opencode's headless `run` mode
  return { cmd: "opencode", args: ["run", mission] };
}

/** The mission handed to the coding agent: instructions + task pointer. */
function missionFor(task: Task, branch: string, workdir: string, agent: Agent): string {
  return [
    agent.instructions?.trim() ? agent.instructions.trim() : "Implement this task.",
    "",
    `Task #${task.id}: ${task.title}`,
    `Task file: ${task.path}`,
    `Working directory: ${workdir} (a git worktree checked out on branch ${branch} — work here).`,
    "",
    "Follow the repo's AGENTS.md operating loop:",
    "1. Read the task file and implement what it describes.",
    "2. Run `repoos check` and confirm it passes (build, typecheck, tests, UI smoke test).",
    "3. Set the task status to `review` and leave the branch open — do NOT merge or delete the branch.",
    "",
    "If this working directory has no build artifacts yet, build before relying on the `repoos` CLI — it warns when its build is stale.",
  ].join("\n");
}

export class AgentRunner {
  private entries = new Map<string, Entry>();
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
    const { cmd, args } = cliCommand(agent.cli, missionFor(task, branch, cwd, agent));
    let proc: ChildProcess;
    try {
      proc = spawn(cmd, args, { cwd, stdio: "ignore" });
    } catch (err) {
      this.emit({ type: "agent.exited", id: task.id, at: now() });
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    }

    this.entries.set(task.id, {
      proc,
      startedAt: now(),
      workdir: opts.cwd,
    });
    // Either path means the run is over: natural exit, spawn error (e.g. the
    // CLI isn't installed), or our own SIGKILL after a graceful pause.
    proc.on("exit", () => this.cleanup(task.id));
    proc.on("error", () => this.cleanup(task.id));

    this.emit({ type: "agent.running", id: task.id, at: this.entries.get(task.id)?.startedAt ?? now() });
    return { ok: true, pid: proc.pid };
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
    if (entry.killTimer) clearTimeout(entry.killTimer);
    this.entries.delete(taskId);
    this.emit({ type: "agent.exited", id: taskId, at: now() });
  }
}
