/**
 * POSIX process-group helpers for subprocess trees (#0675).
 *
 * A child spawned with `detached: true` becomes its own session leader; its PID
 * is the process group ID. Signalling `-pid` reaches the whole tree the turn
 * started, without touching unrelated processes elsewhere on the machine.
 */
import { spawnSync } from "node:child_process";

/** Windows has no portable process-group signal API. */
export function processGroupKillSupported(): boolean {
  return process.platform !== "win32";
}

/**
 * Signal every process in the group led by `leaderPid` (the spawn pid when
 * `detached: true`). Falls back to signalling the leader alone when group
 * signalling is unavailable or the group is already gone.
 */
export function signalProcessGroup(leaderPid: number, signal: NodeJS.Signals): void {
  if (leaderPid <= 0) return;
  if (processGroupKillSupported()) {
    try {
      process.kill(-leaderPid, signal);
      return;
    } catch {
      /* group gone or leader exited — try the leader */
    }
  }
  try {
    process.kill(leaderPid, signal);
  } catch {
    /* already gone */
  }
}

/** PIDs still in the group, best-effort (empty when unsupported or the group is gone). */
export function listProcessGroupPids(leaderPid: number): number[] {
  if (leaderPid <= 0 || !processGroupKillSupported()) return [];
  const res = spawnSync("ps", ["-o", "pid=", "-g", String(leaderPid)], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * After an agent CLI exits, tear down anything still in its process group and
 * return PIDs that survived a SIGKILL (daemonized children, etc.).
 */
export function reapAgentTurnProcessGroup(leaderPid: number): number[] {
  if (leaderPid <= 0 || !processGroupKillSupported()) return [];
  signalProcessGroup(leaderPid, "SIGTERM");
  signalProcessGroup(leaderPid, "SIGKILL");
  return listProcessGroupPids(leaderPid);
}

/**
 * Human-readable warning when a shell command uses a machine-wide pattern kill.
 * Returns null when the command looks safe.
 */
export function patternKillWarning(command: string): string | null {
  const cmd = command.trim();
  if (!cmd) return null;
  if (/^\s*killall\b/i.test(cmd)) {
    return (
      "Refusing pattern kill: `killall` matches every process with that name on " +
      "the machine. Stop only the PID you started (`kill <pid>`), or rely on RepoOS " +
      "to reap your turn's process group when it ends."
    );
  }
  const pkill = cmd.match(/^\s*pkill\b/i);
  if (!pkill) return null;
  // `pkill -PID` / `pkill --pid 123` target one process — allowed.
  if (/\bpkill\b[^|\n]*\s(-\d+|--pid\s+\d+)/i.test(cmd)) return null;
  return (
    "Refusing pattern kill: `pkill` without an explicit `--pid` can terminate " +
    "unrelated servers on this machine. Stop only the PID you started, or let " +
    "RepoOS reap your turn's process group when it ends."
  );
}
