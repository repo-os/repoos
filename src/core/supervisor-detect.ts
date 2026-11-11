/**
 * Detect whether a pid is supervised by launchd or systemd (macOS / Linux), so
 * `repoos restart` can stop it and let the supervisor respawn it instead of
 * starting a second `repoos serve` beside the one the supervisor will restart.
 *
 * Classification is deliberately conservative. Every ambiguous outcome
 * ("we could not tell what manages this pid") is `uncertain`, which the caller
 * refuses on rather than signalling — a wrong `none` would SIGTERM a supervised
 * server and race the supervisor's respawn (#1091 review pass 2).
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
  /** A RepoOS-installed service unit (`com.repoos.serve.*`): restart via the service manager, never by signalling. */
  | { kind: "managed"; job: string }
  | { kind: "uncertain"; reason: string };

/**
 * The label RepoOS's own `repoos service install` writes
 * (`serviceLabel()` in service-manager.ts). A job with this shape is a managed
 * service, which the caller restarts through the service manager — it must NOT
 * be treated as an external supervisor. An externally written plist (the Kamrai
 * `org.repoos.serve.kamrai`) does not match this shape and so is external.
 */
const MANAGED_LABEL_RE = /^com\.repoos\.serve\.[^.]/;

/**
 * Tabular `launchctl list` output → label for a running job pid, or null.
 *
 * Verified against real macOS output: rows are `PID<TAB>Status<TAB>Label`, a
 * `PID` is `-` for a job that is loaded but not running, and the label is the
 * last whitespace-separated field. Exported for tests.
 */
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

/**
 * `creator = launchctl[…]` or `creator = zsh[…]` from `launchctl print pid/N`.
 *
 * Kept only as a weak corroborating signal — real output for a plain pid has a
 * `creator` line, but a job whose label we already failed to find via
 * `launchctl list` is not confidently attributable, so callers do not upgrade
 * `none` to `external` on this alone. Exported for tests.
 */
export function parseLaunchctlPrintCreator(output: string): string | null {
  const m = output.match(/\bcreator\s*=\s*([^\s\[]+)/);
  return m?.[1] ?? null;
}

/**
 * The domain a launchd job lives in, derived from the owning uid. User agents
 * live in `gui/<uid>/<label>`; a process owned by root and started at boot
 * lives in the `system` domain. Exported for tests.
 */
export function launchdDomainForUid(uid: number | null): string {
  if (uid === null || uid === 0) return "system";
  return `gui/${uid}`;
}

/** Best-effort owning uid of a pid via `ps`, or null. */
export function readPidUid(
  pid: number,
  execFile: typeof execFileSync = execFileSync,
): number | null {
  try {
    const out = execFile("ps", ["-o", "uid=", "-p", String(pid)], {
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

/**
 * The exact command a human would run to restart this launchd job. Derived from
 * the real domain (`gui/<uid>` for a user job, `system` for a root job) rather
 * than assuming `gui`, because `launchctl kickstart -k gui/<label>` (no uid) is
 * not a valid target.
 */
export function launchctlRestartCommand(
  label: string,
  uid: number | null,
  execFile: typeof execFileSync = execFileSync,
): string {
  const domain = launchdDomainForUid(uid);
  // Prefer the domain the job actually answers in when it is a user job.
  if (domain !== "system") {
    try {
      execFile("launchctl", ["print", `${domain}/${label}`], {
        encoding: "utf8",
        timeout: 1500,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return `launchctl kickstart -k ${domain}/${label}`;
    } catch {
      /* fall through to system domain */
    }
  }
  return `launchctl kickstart -k system/${label}`;
}

/** @deprecated kept for callers/tests; prefer `launchctlRestartCommand`. */
export function launchctlKickstartCommand(
  label: string,
  execFile: typeof execFileSync = execFileSync,
): string {
  return launchctlRestartCommand(label, null, execFile);
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

/**
 * Real-world `systemctl status <pid>` (excerpt). Rejects the per-user manager
 * unit `user@<uid>.service` — restarting that restarts the whole user manager —
 * and slice/scope units, which are not services. Exported for tests.
 */
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

  let listed = parseLaunchctlListForPid(listOut, pid);
  if (!listed) {
    // A non-root `launchctl list` only shows the caller's own domain, so a
    // LaunchDaemon in the `system` domain (the Kamrai case) never appears.
    // `launchctl print <domain>` lists a domain's services, with pids, and runs
    // without sudo.
    const uid = readPidUid(pid, execFile);
    const domains = ["system", ...(uid !== null && uid !== 0 ? [`gui/${uid}`] : [])];
    for (const domain of domains) {
      try {
        const out = execFile("launchctl", ["print", domain], {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "ignore"],
        });
        listed = parseLaunchctlListForPid(out, pid);
        if (listed) break;
      } catch {
        /* domain not printable by this user — try the next one */
      }
    }
  }
  if (listed && MANAGED_LABEL_RE.test(listed)) {
    return { kind: "managed", job: listed };
  }
  if (listed) {
    const uid = readPidUid(pid, execFile);
    return {
      kind: "external",
      info: {
        platform: "launchd",
        job: listed,
        manualCommand: launchctlRestartCommand(listed, uid, execFile),
      },
    };
  }

  // No running job row maps this pid. Fall back to parentage only: a bare
  // `repoos serve` started from a shell has a live shell parent, while a
  // launchd-spawned process is re-parented to pid 1. `launchctl print pid/N`
  // cannot be used to distinguish these — it exits 0 for any pid, even a
  // nonexistent one, so a "print succeeded" check proves nothing.
  const ppid = readPpid(pid, execFile);
  if (ppid === 1) {
    // A launchd-owned process we could not label. We can stop it, but naming a
    // kickstart target would be a guess, so say so plainly.
    return {
      kind: "uncertain",
      reason:
        `pid ${pid} has no row in \`launchctl list\` but is parented by pid 1 — ` +
        `it may be an externally supervised server, but its launchd label could not be determined`,
    };
  }
  if (ppid !== null && ppid > 1) {
    const parent = parentCommand(ppid, execFile);
    if (parent && /\blaunchd\b/.test(parent)) {
      return {
        kind: "uncertain",
        reason:
          `pid ${pid} is parented by launchd but has no \`launchctl list\` row — ` +
          `its launchd label could not be determined`,
      };
    }
  }
  // A pid we could not read the parent of is NOT confidently hand-run: `ps`
  // could have failed for any reason (permissions, timing). Refuse rather than
  // SIGTERM a process whose manager we cannot rule out (#1091 review pass 4).
  if (ppid === null) {
    return {
      kind: "uncertain",
      reason: `pid ${pid} has no \`launchctl list\` row and its parent could not be read — refusing to guess how it is supervised`,
    };
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
    if (info && MANAGED_LABEL_RE.test(info.job)) return { kind: "managed", job: info.job };
    if (info) return { kind: "external", info };
    if (/\b\.service\b/.test(out) || /Main PID:/.test(out)) {
      return {
        kind: "uncertain",
        reason: `systemctl described pid ${pid} but the unit name could not be parsed — restart the unit manually`,
      };
    }
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
