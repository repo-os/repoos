/**
 * Reconcile engineer harness processes that survived a server reload (#0837).
 * Only PIDs recorded in the durable agent registry or ownership file are
 * considered — never scan or signal by process name.
 */
import { execFile } from "node:child_process";
import { readlink, realpathSync } from "node:fs";
import { listProcessGroupPids } from "../core/process-group.js";
import { signalProcessGroup } from "../core/process-group.js";
import type { OwnershipRecord } from "./system.js";

/** Basenames of CLIs RepoOS may spawn as managed engineers (not reviewers). */
export const MANAGED_HARNESS_EXECUTABLES = [
  "cursor-agent",
  "opencode",
  "claude",
  "codex",
  "copilot",
  "crush",
  "pi",
  "agy",
  "kiro-cli",
  "qwen",
] as const;

export interface RecordedEngineerPid {
  taskId: string;
  pid: number;
  /** Process group leader recorded at spawn (defaults to `pid`). */
  processGroupLeader: number;
  workdir: string;
  branch: string;
  runId: string;
  logStem?: string;
  source: "registry" | "ownership";
}

export interface DurableRegistryEntryLike {
  taskId: string;
  pid: number;
  workdir: string;
  branch: string;
  runId: string;
  logStem?: string;
  kind?: "engineer" | "review";
  processGroupLeader?: number;
}

export function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True when `command` is a RepoOS-managed agent harness invocation. */
export function isManagedHarnessCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  for (const name of MANAGED_HARNESS_EXECUTABLES) {
    if (new RegExp(`(?:^|[\\s/])${name}(?:\\s|$)`).test(trimmed)) return true;
  }
  return false;
}

function safeExec(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 5000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

/** Best-effort command line for a live PID. */
export function processCommandLine(pid: number): Promise<string | null> {
  return safeExec("ps", ["-p", String(pid), "-o", "command="]);
}

/** Best-effort cwd for a live PID. */
export async function processCwd(pid: number): Promise<string | null> {
  if (process.platform === "linux") {
    try {
      const raw = await new Promise<string>((resolve, reject) =>
        readlink(`/proc/${pid}/cwd`, (error, path) => (error ? reject(error) : resolve(path))),
      );
      return raw.replace(/ \(deleted\)$/, "") || null;
    } catch {
      return null;
    }
  }
  const out = await safeExec("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  if (!out) return null;
  const line = out.split("\n").find((entry) => entry.startsWith("n"));
  const cwd = line?.slice(1) ?? null;
  return cwd ? cwd.replace(/ \(deleted\)$/, "") : null;
}

export function sameWorkdirPath(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * Positive identification: PID is alive, cwd matches the recorded worktree,
 * and the command line looks like a managed harness — not an unrelated process.
 */
export async function verifyRecordedHarnessPid(
  pid: number,
  expectedWorkdir: string,
): Promise<boolean> {
  if (!pidAlive(pid)) return false;
  const cmd = await processCommandLine(pid);
  if (!cmd || !isManagedHarnessCommand(cmd)) return false;
  const cwd = await processCwd(pid);
  if (!cwd) return false;
  return sameWorkdirPath(cwd, expectedWorkdir);
}

/** Live PIDs in the recorded process group (leader may already be dead). */
export function livePidsInRecordedGroup(leaderPid: number): number[] {
  const candidates = new Set<number>([leaderPid, ...listProcessGroupPids(leaderPid)]);
  return [...candidates].filter((p) => pidAlive(p));
}

/**
 * Collect engineer candidates from durable records for active tasks only.
 * Review turns are handled by `adoptRunningAgents()`; engineers only here.
 */
export function collectRecordedEngineerPids(
  registryEntries: DurableRegistryEntryLike[],
  ownership: OwnershipRecord[],
  activeTaskIds: Set<string>,
): RecordedEngineerPid[] {
  const byTask = new Map<string, RecordedEngineerPid>();

  for (const rec of registryEntries) {
    if (rec.kind === "review") continue;
    if (!activeTaskIds.has(rec.taskId)) continue;
    const leader = rec.processGroupLeader ?? rec.pid;
    const live = livePidsInRecordedGroup(leader);
    const pid = live.includes(rec.pid) ? rec.pid : live[0];
    if (!pid) continue;
    byTask.set(rec.taskId, {
      taskId: rec.taskId,
      pid,
      processGroupLeader: leader,
      workdir: rec.workdir,
      branch: rec.branch,
      runId: rec.runId,
      logStem: rec.logStem,
      source: "registry",
    });
  }

  for (const own of ownership) {
    if (!activeTaskIds.has(own.taskId)) continue;
    if (byTask.has(own.taskId)) continue;
    if (!own.workdir || !pidAlive(own.pid)) continue;
    byTask.set(own.taskId, {
      taskId: own.taskId,
      pid: own.pid,
      processGroupLeader: own.pid,
      workdir: own.workdir,
      branch: "",
      runId: `ownership-${own.pid}`,
      source: "ownership",
    });
  }

  return [...byTask.values()];
}

/** Stop a recorded orphan using its process group leader when known (#0675). */
export function stopRecordedEngineerPid(pid: number, processGroupLeader?: number): void {
  const leader = processGroupLeader && processGroupLeader > 0 ? processGroupLeader : pid;
  signalProcessGroup(leader, "SIGTERM");
  const t = setTimeout(() => {
    signalProcessGroup(leader, "SIGKILL");
    if (leader !== pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
  }, 3000);
  t.unref?.();
}

export function adoptedActivityNote(pid: number): string {
  return `adopted orphaned engineer pid ${pid}`;
}

export function stoppedActivityNote(pid: number): string {
  return `stopped orphaned engineer pid ${pid}`;
}
