/**
 * Detect whether a pid is supervised by launchd or systemd (macOS / Linux).
 */
import { execFileSync } from "node:child_process";
export interface SupervisorInfo {
  platform: "launchd" | "systemd";
  job: string;
  manualCommand: string;
}

export type SupervisorDetectResult =
  | { kind: "external"; info: SupervisorInfo }
  | { kind: "none" }
  | { kind: "uncertain"; reason: string };

/** Tabular `launchctl list` → label for a running job pid, or null. */
export function parseLaunchctlListForPid(output: string, pid: number): string | null {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("PID")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    const rowPid = Number(parts[0]);
    if (!Number.isFinite(rowPid) || rowPid !== pid) continue;
    const label = parts[parts.length - 1]!;
    if (!label || label === "-") return null;
    return label;
  }
  return null;
}

/** `creator = launchctl[…]` or `creator = zsh[…]` from `launchctl print pid/N`. */
export function parseLaunchctlPrintCreator(output: string): string | null {
  const m = output.match(/\bcreator\s*=\s*([^\s\[]+)/);
  return m?.[1] ?? null;
}

export function launchctlKickstartCommand(
  label: string,
  execFile: typeof execFileSync = execFileSync,
): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : 501;
  const guiTarget = `gui/${uid}/${label}`;
  try {
    execFile("launchctl", ["print", guiTarget], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return `launchctl kickstart -k ${guiTarget}`;
  } catch {
    return `launchctl kickstart -k system/${label}`;
  }
}

function readPpid(pid: number, execFile: typeof execFileSync): number | null {
  try {
    const out = execFile("ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function parentCommand(ppid: number, execFile: typeof execFileSync): string | null {
  try {
    return (
      execFile("ps", ["-p", String(ppid), "-o", "command="], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** Real-world `systemctl status <pid>` (excerpt from Debian bookworm). */
export function parseSystemdPidStatus(output: string): SupervisorInfo | null {
  const unit = output.match(/●\s+(\S+\.service)/);
  if (!unit) return null;
  const full = unit[1]!;
  const name = full.replace(/\.service$/, "");
  if (name.startsWith("user@") || name.endsWith(".slice") || name.endsWith(".scope")) {
    return null;
  }
  if (!/^[\w@.-]+$/.test(name)) return null;
  const userScope =
    /\/run\/user\//.test(output) ||
    /\bLoaded: loaded \([^)]*\.config\/systemd\/user\//.test(output);
  const ctl = userScope ? "systemctl --user" : "systemctl";
  return {
    platform: "systemd",
    job: name,
    manualCommand: `${ctl} restart ${name}.service`,
  };
}

export function detectSupervisor(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): SupervisorDetectResult {
  if (process.platform === "darwin") return detectDarwinSupervisor(pid, execFile);
  if (process.platform === "linux") return detectLinuxSupervisor(pid, execFile);
  return { kind: "none" };
}

function detectDarwinSupervisor(
  pid: number,
  execFile: typeof execFileSync,
): SupervisorDetectResult {
  let listOut: string;
  try {
    listOut = execFile("launchctl", ["list"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return {
      kind: "uncertain",
      reason:
        `launchctl list failed for pid ${pid}` +
        (err instanceof Error && err.message ? ` (${err.message})` : ""),
    };
  }

  const listed = parseLaunchctlListForPid(listOut, pid);
  if (listed) {
    if (listed.startsWith("com.repoos.serve.")) return { kind: "none" };
    return {
      kind: "external",
      info: {
        platform: "launchd",
        job: listed,
        manualCommand: launchctlKickstartCommand(listed, execFile),
      },
    };
  }

  let printOut = "";
  try {
    printOut = execFile("launchctl", ["print", `pid/${pid}`], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return {
      kind: "uncertain",
      reason:
        `launchctl print pid/${pid} failed` +
        (err instanceof Error && err.message ? ` (${err.message})` : ""),
    };
  }

  const creator = parseLaunchctlPrintCreator(printOut);
  if (creator === "launchctl") {
    return {
      kind: "uncertain",
      reason: `pid ${pid} was started by launchctl but has no label in launchctl list — kill it and let the supervisor respawn, or restart the launchd job by label`,
    };
  }

  const ppid = readPpid(pid, execFile);
  if (ppid !== null && ppid > 1) {
    const parent = parentCommand(ppid, execFile);
    if (parent && /\b(repoos|bun|node)\b.*\bserve\b/.test(parent) && !/launchctl/.test(parent)) {
      return { kind: "none" };
    }
  }

  return { kind: "none" };
}

function detectLinuxSupervisor(pid: number, execFile: typeof execFileSync): SupervisorDetectResult {
  try {
    const out = execFile("systemctl", ["status", String(pid)], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const info = parseSystemdPidStatus(out);
    if (info?.job.startsWith("com.repoos.serve.")) return { kind: "none" };
    if (info) return { kind: "external", info };
    return { kind: "none" };
  } catch {
    const ppid = readPpid(pid, execFile);
    if (ppid !== null) {
      const parent = parentCommand(ppid, execFile);
      if (parent && /\bsystemd\b/.test(parent)) {
        return {
          kind: "uncertain",
          reason: `systemctl could not describe pid ${pid} but parent looks systemd-managed`,
        };
      }
    }
    return { kind: "none" };
  }
}
