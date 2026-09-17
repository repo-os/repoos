/**
 * Per-repo background service management (0185).
 *
 * Manages a user-level OS service (macOS LaunchAgent / Linux systemd unit)
 * for a single RepoOS repository. The service runs `repoos serve` in the
 * foreground so the existing reload handoff (src/server/reload.ts) works
 * unchanged.
 *
 * Central registry lives at `~/.repoos/services.json` — one file for ALL
 * managed RepoOS services on this machine, keyed by a collision-safe
 * repository identifier derived from the canonical root path.
 *
 * Platform notes:
 *   - macOS: LaunchAgent plist with AbandonProcessGroup=true so the reload
 *     handoff (spawn replacement + exit old) works. The reference plist on
 *     this machine (~/Library/LaunchAgents/com.repoos.serve.plist) was the
 *     starting point; per-repo units extend it with collision-safe labels.
 *   - Linux: systemd user unit with WantedBy=default.target (always —
 *     multi-user.target is a system target and ignored for --user units).
 *     For the service to survive logout, the user must explicitly enable
 *     lingering via `loginctl enable-linger <user>`. We never do this
 *     automatically — it is surfaced in the UI and CLI as guidance.
 *
 * Zero runtime deps: node:fs / node:path / node:crypto / node:child_process.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir } from "node:os";
import { basename, join, dirname, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { loadConfig } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ServicePlatform = "launchd" | "systemd";
export type ServiceStatus = "running" | "stopped" | "error" | "unknown" | "disabled";

export interface ServiceEntry {
  /** Collision-safe id: `<repo-name>-<8-char-hash>` */
  id: string;
  /** Absolute path to the repo root (canonicalized). */
  root: string;
  /** Port the serve process binds to. */
  port: number;
  /** OS platform service type. */
  platform: ServicePlatform;
  /** OS-level service label (e.g. `com.repoos.serve.myproject-a1b2c3d4`). */
  label: string;
  /** Whether to start at login (RunAtLoad / WantedBy). */
  autoStart: boolean;
  /** Latest observed status. */
  status: ServiceStatus;
  /** ISO timestamp of the last health check. */
  lastHealthCheck: string | null;
  /** Error message when unhealthy. */
  healthError: string | null;
  /** ISO timestamp when the service was installed. */
  createdAt: string;
  /** ISO timestamp of the last status update. */
  updatedAt: string;
}

export interface ServiceListEntry {
  id: string;
  root: string;
  port: number;
  platform: ServicePlatform;
  label: string;
  autoStart: boolean;
  status: ServiceStatus;
  lastHealthCheck: string | null;
  healthError: string | null;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SERVICES_DIR = join(homedir(), ".repoos");
const SERVICES_FILE = join(SERVICES_DIR, "services.json");

// ── Registry helpers ─────────────────────────────────────────────────────────

/**
 * Generate a collision-safe service id from a repo root path.
 * Format: `<basename>-<8-char-sha256-prefix>`.
 */
export function serviceId(root: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(root);
  } catch {
    canonical = resolve(root);
  }
  const name = basename(canonical) || "repoos";
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);
  return `${name}-${hash}`;
}

/** The OS-level service label for a given service id. */
export function serviceLabel(id: string): string {
  return `com.repoos.serve.${id}`;
}

function readRegistry(): ServiceEntry[] {
  try {
    const raw = readFileSync(SERVICES_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ServiceEntry[];
  } catch {
    return [];
  }
}

function writeRegistry(entries: ServiceEntry[]): void {
  if (!existsSync(SERVICES_DIR)) {
    mkdirSync(SERVICES_DIR, { recursive: true });
  }
  writeFileSync(SERVICES_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

function findEntry(entries: ServiceEntry[], root: string): ServiceEntry | undefined {
  let canonical: string;
  try {
    canonical = realpathSync(root);
  } catch {
    canonical = resolve(root);
  }
  return entries.find((e) => {
    try {
      return realpathSync(e.root) === canonical;
    } catch {
      return resolve(e.root) === canonical;
    }
  });
}

// ── Platform detection ───────────────────────────────────────────────────────

export function detectPlatform(): ServicePlatform {
  return process.platform === "darwin" ? "launchd" : "systemd";
}

// ── macOS LaunchAgent ────────────────────────────────────────────────────────

function plistPath(label: string): string {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

function logDir(): string {
  return join(SERVICES_DIR, "logs");
}

/**
 * Resolve the command to launch `repoos serve` under. `which repoos` finds a
 * real `repoos` — ALWAYS a shebang script (`#!/usr/bin/env node`, whether
 * from an npm/bun-link install or `bun link` to this repo's own CLI entry),
 * never an interpreter binary itself — so it is always directly runnable
 * with no separate entry-point argument, regardless of what its own path
 * happens to contain (a bun-managed install path like
 * `/Users/x/.bun/bin/repoos` contains the substring "bun" despite being a
 * plain script — a prior version of this function used exactly that
 * substring match to decide whether to also pass a cliEntry argument, which
 * broke every `which`-resolved install: `repoos <cliEntry> serve` is not a
 * valid invocation, "cliEntry" is not a known subcommand).
 *
 * `needsCliEntry` is true ONLY for the no-PATH-install fallback below, which
 * returns the raw node/bun interpreter itself (`process.execPath`) and
 * therefore genuinely does need the compiled entry point as a separate arg.
 */
export function repoosBinary(): { bin: string; needsCliEntry: boolean } {
  // Try PATH first — this covers global installs (`npm i -g`, `bun link`)
  // and any environment where the user can already run `repoos serve`.
  try {
    const result = execFileSync("which", ["repoos"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    }).trim();
    if (result) return { bin: result, needsCliEntry: false };
  } catch {
    // repoos not on PATH
  }
  // If running from the source checkout (dist/ exists next to src/), use
  // process.execPath + the CLI entry directly. This covers the common dev
  // case where `repoos` is a bun link pointing at this repo's dist/.
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  if (existsSync(cliEntry)) {
    return { bin: process.execPath, needsCliEntry: true };
  }
  // Nothing found — caller should surface an error rather than generating
  // a unit that will fail to start.
  throw new Error(
    "Cannot find the `repoos` binary. Ensure it is installed and on PATH, " +
      "or run this command from a RepoOS source checkout with a built dist/.",
  );
}

function generatePlist(entry: ServiceEntry): string {
  const { bin, needsCliEntry } = repoosBinary();
  // Derive the compiled entry point from this module's location
  // (src/core/service-manager.ts → ../../dist/cli/index.js) rather than
  // guessing from the binary path.
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  const programArgs = needsCliEntry
    ? [
        `<string>${xmlEscape(bin)}</string>`,
        `<string>${xmlEscape(existsSync(cliEntry) ? cliEntry : join(srcDir, "cli", "index.js"))}</string>`,
        `<string>serve</string>`,
        `<string>--port</string>`,
        `<string>${String(entry.port)}</string>`,
        `<string>--host</string>`,
        `<string>127.0.0.1</string>`,
        `<string>--quiet</string>`,
      ]
    : [
        `<string>${xmlEscape(bin)}</string>`,
        `<string>serve</string>`,
        `<string>--port</string>`,
        `<string>${String(entry.port)}</string>`,
        `<string>--host</string>`,
        `<string>127.0.0.1</string>`,
        `<string>--quiet</string>`,
      ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${xmlEscape(entry.label)}</string>

	<key>ProgramArguments</key>
	<array>
		${programArgs.join("\n\t\t")}
	</array>

	<key>WorkingDirectory</key>
	<string>${xmlEscape(entry.root)}</string>

	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>${xmlEscape(process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin")}</string>
		<key>HOME</key>
		<string>${xmlEscape(homedir())}</string>
	</dict>

	<key>RunAtLoad</key>
	<${entry.autoStart ? "true" : "false"}/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
		<key>Crashed</key>
		<true/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>10</integer>

	<key>StandardOutPath</key>
	<string>${xmlEscape(join(logDir(), `${entry.label}.log`))}</string>
	<key>StandardErrorPath</key>
	<string>${xmlEscape(join(logDir(), `${entry.label}.log`))}</string>

	<key>ProcessType</key>
	<string>Background</string>

	<!--
	  repoos's own auto-reload (src/server/reload.ts) hands off to a new
	  process and exits the old one on a successful build handover — without
	  this, launchd's default behavior kills the whole process group
	  (including the just-spawned replacement) the instant the old PID exits,
	  which would kill the reload replacement mid-handoff every time.
	-->
	<key>AbandonProcessGroup</key>
	<true/>
</dict>
</plist>`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Linux systemd ────────────────────────────────────────────────────────────

function systemdUnitPath(label: string): string {
  return join(homedir(), ".config", "systemd", "user", `${label}.service`);
}

function generateUnit(entry: ServiceEntry): string {
  const { bin, needsCliEntry } = repoosBinary();
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  const execStart = needsCliEntry
    ? `${bin} ${existsSync(cliEntry) ? cliEntry : join(srcDir, "cli", "index.js")} serve --port ${String(entry.port)} --host 127.0.0.1 --quiet`
    : `${bin} serve --port ${String(entry.port)} --host 127.0.0.1 --quiet`;

  // Always default.target for user units — multi-user.target is a system
  // target and silently ignored for --user services. Auto-start is controlled
  // by systemctl enable/disable, not by the target.
  return `[Unit]
Description=RepoOS serve — ${basename(entry.root)}
After=network.target

[Service]
Type=simple
WorkingDirectory=${entry.root}
ExecStart=${execStart}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}

// ── OS interaction ───────────────────────────────────────────────────────────

function launchctl(
  verb: "load" | "unload" | "start" | "stop" | "list",
  ...args: string[]
): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("launchctl", [verb, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? `exit ${e.status ?? "?"}`,
    };
  }
}

function systemctl(
  verb: string,
  ...args: string[]
): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("systemctl", ["--user", verb, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? `exit ${e.status ?? "?"}`,
    };
  }
}

export function queryLaunchdStatus(label: string): ServiceStatus {
  const result = launchctl("list", label);
  if (!result.ok) return "stopped"; // unloaded / not found
  // `launchctl list <label>` prints a property-list dict, not the tabular
  // `PID  Status  Label` form `launchctl list` (no args, listing ALL jobs)
  // prints — e.g. `{\n\t"PID" = 89613;\n\t"LimitLoadToSessionType" = ...\n}`.
  // A PID key present (and > 0) means it's actually running; absent means
  // loaded-but-stopped.
  const pidMatch = result.stdout.match(/"PID"\s*=\s*(\d+)/);
  if (pidMatch && Number(pidMatch[1]) > 0) return "running";
  return "stopped";
}

function querySystemdStatus(label: string): ServiceStatus {
  const result = systemctl("is-active", `${label}.service`);
  return result.stdout.trim() === "active" ? "running" : "stopped";
}

// ── Health check ─────────────────────────────────────────────────────────────

/**
 * Check if systemd user lingering is enabled for the current user. When
 * disabled, user services stop on logout — the service won't survive a
 * terminal close or reboot. We never enable this automatically; it requires
 * explicit user confirmation per the task spec.
 */
export function isLingerEnabled(): boolean | null {
  if (process.platform === "darwin") return null; // not applicable on macOS
  try {
    // The authoritative state is `loginctl show-user -p Linger`. It reads
    // /var/lib/systemd/linger/<user> (root-owned, not readable by us), so
    // the only reliable check is asking systemd-logind via loginctl rather
    // than guessing at a filesystem path.
    const out = execFileSync(
      "loginctl",
      ["show-user", String(process.getuid?.() ?? ""), "-p", "Linger", "--value"],
      {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      },
    ).trim();
    return out === "yes";
  } catch {
    return null;
  }
}

function probeHealth(port: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/api/health`,
      (res: import("node:http").IncomingMessage) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          data += c;
        });
        res.on("end", () => {
          try {
            const body = JSON.parse(data) as { ok?: boolean };
            resolve({ ok: body.ok === true });
          } catch {
            resolve({ ok: false, error: "invalid health response" });
          }
        });
      },
    );
    req.on("error", (err: Error) => {
      resolve({ ok: false, error: err.message });
    });
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false, error: "health probe timeout" });
    });
  });
}

/**
 * Check whether something is already bound to `port` on localhost. Used to
 * refuse installing/starting a managed service against a port a foreground
 * `repoos serve` (or anything else) is already holding — without this, the
 * new LaunchAgent/systemd unit fails to bind (EADDRINUSE) and KeepAlive /
 * Restart=on-failure crash-loops it every few seconds.
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const srv = net.createServer();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      resolvePromise(err.code === "EADDRINUSE");
    });
    srv.once("listening", () => {
      srv.close(() => resolvePromise(false));
    });
    srv.listen(port, "127.0.0.1");
  });
}

/**
 * Map the OS-reported running/stopped state plus autoStart to the spec's
 * four visible states: a service that isn't running is "Stopped" if it will
 * still start at login (autoStart), or "Disabled" if it won't — otherwise an
 * installed-but-off service and a genuinely stopped one were indistinguishable
 * in the UI.
 */
export function deriveStatus(liveStatus: "running" | "stopped", autoStart: boolean): ServiceStatus {
  if (liveStatus === "running") return "running";
  return autoStart ? "stopped" : "disabled";
}

// ── Reload-orphan detection ─────────────────────────────────────────────────
//
// server/reload.ts hands off by spawning a detached replacement process and
// exiting the old one. AbandonProcessGroup=true (launchd) keeps that
// replacement alive instead of being killed with the old process's group,
// but neither launchd nor systemd ever learns the replacement's PID — their
// job tracking still points at the original, now-exited process. So
// `launchctl list` / `systemctl is-active` can report "stopped" while a
// real server is still bound to the port: an orphan invisible to the OS
// service manager. Stop/Restart/Remove would otherwise silently no-op
// against it.
//
// The fix doesn't touch reload.ts (deliberately out of scope — see the task
// notes). Instead it uses the one thing every generation of `repoos serve`
// already does on bind regardless of how it was started: register its PID
// in `.repoos/serve-<port>.lock` (server/serve-reaper.ts). That lockfile is
// the actual source of truth for "who is serving this port right now."

/** Read the real PID currently registered as serving `port` for `root`, or
 * null if there's no lockfile, it's stale, or it names a dead process. */
export function readServeLockPid(root: string, port: number): number | null {
  const cacheDir = loadConfig(root).cacheDir;
  const lockPath = join(root, cacheDir, `serve-${port}.lock`);
  try {
    const info = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: unknown; port?: unknown };
    if (typeof info.pid !== "number" || info.port !== port) return null;
    process.kill(info.pid, 0); // throws (ESRCH) if not alive; sends no signal
    return info.pid;
  } catch {
    return null;
  }
}

/** Best-effort SIGTERM-then-SIGKILL of a bare PID (no ChildProcess handle). */
async function killPid(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return; // already gone
  }
  await new Promise((r) => setTimeout(r, 500));
  try {
    process.kill(pid, 0); // still alive?
    process.kill(pid, "SIGKILL");
  } catch {
    // exited on SIGTERM, or already gone
  }
}

/**
 * Reap a reload replacement that launchd/systemd lost track of. Called after
 * the OS-level stop, which only ever touches the (possibly long-exited) job
 * PID it knows about.
 */
export async function reapOrphan(root: string, port: number): Promise<void> {
  const pid = readServeLockPid(root, port);
  if (pid !== null) await killPid(pid);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * List all registered managed RepoOS services, plus Linux linger status
 * when applicable.
 */
export function listServices(): {
  services: ServiceListEntry[];
  lingerEnabled: boolean | null;
} {
  const entries = readRegistry();
  const lingerEnabled = isLingerEnabled();
  return {
    services: entries.map(
      ({
        id,
        root,
        port,
        platform,
        label,
        autoStart,
        status,
        lastHealthCheck,
        healthError,
        createdAt,
      }) => ({
        id,
        root,
        port,
        platform,
        label,
        autoStart,
        status,
        lastHealthCheck,
        healthError,
        createdAt,
      }),
    ),
    lingerEnabled,
  };
}

/**
 * Get the service status for a specific repo, querying the OS live.
 * Detects external drift (plist/unit removed outside RepoOS).
 */
export async function getServiceStatus(root: string): Promise<ServiceEntry | null> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return null;

  // Detect external drift: check if the OS service file still exists
  const artifactExists =
    entry.platform === "launchd"
      ? existsSync(plistPath(entry.label))
      : existsSync(systemdUnitPath(entry.label));

  if (!artifactExists) {
    // The plist/unit was removed outside RepoOS — mark as "error" (Needs
    // attention) so the UI surfaces the drift clearly. installService()
    // refuses while a registry entry for this repo still exists, so the
    // recovery path is Remove (clears the stale entry) then reinstall —
    // "reinstall" alone is a dead end.
    const driftMsg = "Service file removed externally — remove, then reinstall, to restore";
    if (entry.status !== "error" || entry.healthError !== driftMsg) {
      entry.status = "error";
      entry.healthError = driftMsg;
      entry.updatedAt = new Date().toISOString();
      writeRegistry(entries);
    }
    return entry;
  }

  // Query live OS status
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);
  const status = deriveStatus(liveStatus as "running" | "stopped", entry.autoStart);

  // launchd/systemd reporting "not running" doesn't mean the port is free —
  // a reload replacement can still be bound to it, invisible to their job
  // tracking (see the "Reload-orphan detection" section above), and this is
  // the ordinary state of a healthy service after ANY reload (which fires on
  // every build) — not an exceptional one. Probe its health directly rather
  // than blanket-reporting "Needs attention": a healthy orphan is exactly
  // what "running" should mean here, and only a genuinely stuck/dead one is
  // actually Needs-attention-worthy.
  if (status !== "running" && readServeLockPid(root, entry.port) !== null) {
    const health = await probeHealth(entry.port);
    if (health.ok) {
      if (entry.status !== "running" || entry.healthError !== null) {
        entry.status = "running";
        entry.healthError = null;
        entry.updatedAt = new Date().toISOString();
        writeRegistry(entries);
      }
      return entry;
    }
    const orphanMsg =
      "An unmanaged, unhealthy process is still running on this port (a reload " +
      "replacement launchd/systemd lost track of) — Stop or Remove will clean it up.";
    if (entry.status !== "error" || entry.healthError !== orphanMsg) {
      entry.status = "error";
      entry.healthError = orphanMsg;
      entry.updatedAt = new Date().toISOString();
      writeRegistry(entries);
    }
    return entry;
  }

  // Update status if changed
  if (entry.status !== status || entry.healthError !== null) {
    entry.status = status;
    entry.healthError = null;
    entry.updatedAt = new Date().toISOString();
    writeRegistry(entries);
  }

  return entry;
}

/**
 * Install a background service for the current repo and start it immediately.
 * The service is created in a stopped state, then started — matching the
 * acceptance criterion "creates and starts exactly one service".
 */
export async function installService(
  root: string,
  port: number,
  opts: { autoStart?: boolean } = {},
): Promise<{ ok: boolean; entry?: ServiceEntry; error?: string }> {
  const entries = readRegistry();
  const existing = findEntry(entries, root);
  if (existing) {
    return { ok: false, error: `Service already installed (id: ${existing.id}). Remove it first.` };
  }

  // Refuse to install against a port something is already bound to — most
  // commonly the foreground `repoos serve` the user is looking at right now
  // when they click "Install service". Without this the new managed unit
  // fails to bind (EADDRINUSE) and KeepAlive/Restart=on-failure crash-loops
  // it every few seconds.
  if (await isPortInUse(port)) {
    return {
      ok: false,
      error: `Port ${port} is already in use — stop the running \`repoos serve\` on this port (or whatever else is bound to it) before installing a background service.`,
    };
  }

  const platform = detectPlatform();
  const id = serviceId(root);
  const label = serviceLabel(id);
  const entry: ServiceEntry = {
    id,
    root: resolve(root),
    port,
    platform,
    label,
    autoStart: opts.autoStart ?? false,
    status: "stopped",
    lastHealthCheck: null,
    healthError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Write OS service files
  if (platform === "launchd") {
    let plist: string;
    try {
      // generatePlist() calls repoosBinary(), which throws when it can't
      // find a runnable `repoos` — surface that as a normal {ok:false}
      // result instead of an uncaught exception (a 500 from the route).
      plist = generatePlist(entry);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const dest = plistPath(label);
    if (!existsSync(dirname(dest))) {
      mkdirSync(dirname(dest), { recursive: true });
    }
    writeFileSync(dest, plist, "utf8");

    // Load the service
    const result = launchctl("load", dest);
    if (!result.ok) {
      rmSync(dest, { force: true });
      return { ok: false, error: `Failed to load LaunchAgent: ${result.stderr}` };
    }
  } else {
    const unit = generateUnit(entry);
    const dest = systemdUnitPath(label);
    if (!existsSync(dirname(dest))) {
      mkdirSync(dirname(dest), { recursive: true });
    }
    writeFileSync(dest, unit, "utf8");

    // Reload systemd — if this fails, clean up the unit file
    const reloadResult = systemctl("daemon-reload");
    if (!reloadResult.ok) {
      rmSync(dest, { force: true });
      return { ok: false, error: `systemd daemon-reload failed: ${reloadResult.stderr}` };
    }
    // Enable/disable controls auto-start
    if (entry.autoStart) {
      const enableResult = systemctl("enable", `${label}.service`);
      if (!enableResult.ok) {
        rmSync(dest, { force: true });
        systemctl("daemon-reload");
        return { ok: false, error: `systemctl enable failed: ${enableResult.stderr}` };
      }
    }
  }

  entries.push(entry);
  writeRegistry(entries);

  // Start the service immediately after install, on both platforms — the
  // acceptance criterion is "creates AND starts exactly one service". On
  // launchd, `load` above only starts it for free when RunAtLoad=true (i.e.
  // autoStart was requested); for the common default (autoStart:false) the
  // job is loaded-but-stopped until startService()'s `launchctl start`
  // actually runs it. startService() tolerates the job already being loaded,
  // so this is not a double-load error on either path.
  await startService(root);

  // Re-read so the returned entry reflects the post-start status startService
  // just wrote, rather than the pre-start "stopped" snapshot from above.
  const freshEntry = findEntry(readRegistry(), root) ?? entry;
  return { ok: true, entry: freshEntry };
}

/**
 * Remove a background service: stops it and deletes all OS artifacts.
 */
export async function removeService(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const idx = entries.findIndex((e) => {
    try {
      return realpathSync(e.root) === realpathSync(root);
    } catch {
      return resolve(e.root) === resolve(root);
    }
  });
  if (idx === -1) return { ok: false, error: "No service found for this repository" };

  const entry = entries[idx];

  // Stop the service
  await stopService(root);

  // Remove OS service files
  if (entry.platform === "launchd") {
    const dest = plistPath(entry.label);
    launchctl("unload", dest);
    rmSync(dest, { force: true });
    // Clean up log file
    const logFile = join(logDir(), `${entry.label}.log`);
    rmSync(logFile, { force: true });
  } else {
    systemctl("disable", `${entry.label}.service`);
    rmSync(systemdUnitPath(entry.label), { force: true });
    systemctl("daemon-reload");
  }

  // Remove from registry
  entries.splice(idx, 1);
  writeRegistry(entries);

  return { ok: true };
}

/**
 * Start a background service.
 * macOS: `launchctl load` only registers the job with launchd — it starts it
 * immediately ONLY when RunAtLoad=true. A loaded-but-stopped job (the default,
 * RunAtLoad=false, or one that previously exited) needs an explicit
 * `launchctl start <label>` to actually run; `load` alone is a no-op for it.
 * `load` on an already-loaded job fails with "already loaded", which is not
 * a real error — the job is exactly where we want it, so that case is
 * tolerated rather than surfaced.
 * Linux: `systemctl start` works for both loaded and enabled units.
 */
export async function startService(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  // Only refuse when the service isn't already the thing holding the port —
  // otherwise a normal "already running" start (e.g. right after install)
  // would false-positive against itself.
  const alreadyRunning =
    (entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label)) === "running";
  if (!alreadyRunning && (await isPortInUse(entry.port))) {
    return {
      ok: false,
      error: `Port ${entry.port} is already in use by something else — stop it before starting this service, or the service will crash-loop trying to bind it.`,
    };
  }

  if (entry.platform === "launchd") {
    const dest = plistPath(entry.label);
    if (!existsSync(dest)) {
      return { ok: false, error: "LaunchAgent plist missing — reinstall the service" };
    }
    const loadResult = launchctl("load", dest);
    if (!loadResult.ok && !/already loaded/i.test(loadResult.stderr)) {
      return { ok: false, error: `launchctl load failed: ${loadResult.stderr}` };
    }
    // Actually run the job — `load` alone does not for RunAtLoad=false.
    const startResult = launchctl("start", entry.label);
    if (!startResult.ok)
      return { ok: false, error: `launchctl start failed: ${startResult.stderr}` };
  } else {
    const result = systemctl("start", `${entry.label}.service`);
    if (!result.ok) return { ok: false, error: `systemctl start failed: ${result.stderr}` };
  }

  // Update status
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);
  // deriveStatus, not the raw liveStatus — otherwise a start that fails to
  // actually bring the process up (still "stopped" per launchd/systemd)
  // would be recorded as plain "stopped" even when autoStart is off, an
  // inconsistency with how getServiceStatus/checkHealth report that same
  // not-running+autoStart-off case as "disabled".
  entry.status = deriveStatus(liveStatus as "running" | "stopped", entry.autoStart);
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: true };
}

/**
 * Stop a background service.
 * macOS: `launchctl unload` removes the job from launchd's management, so
 * KeepAlive won't respawn it. `launchctl stop` alone is overridden by
 * KeepAlive.Crashed=true and the process restarts immediately.
 * Linux: `systemctl stop` is sufficient — no respawn loop.
 */
export async function stopService(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  let stopError: string | undefined;
  if (entry.platform === "launchd") {
    const dest = plistPath(entry.label);
    if (existsSync(dest)) {
      const result = launchctl("unload", dest);
      if (!result.ok) stopError = `launchctl unload failed: ${result.stderr}`;
    }
  } else {
    const result = systemctl("stop", `${entry.label}.service`);
    if (!result.ok) stopError = `systemctl stop failed: ${result.stderr}`;
  }

  // The OS-level stop above only touches the job launchd/systemd is
  // tracking. A reload replacement that took over after that job's original
  // process exited (server/reload.ts) is invisible to that tracking — reap
  // it directly via the port's serve lockfile so Stop actually frees the
  // port instead of leaving an orphan running. See the "Reload-orphan
  // detection" section above for why this can't be solved through
  // launchctl/systemctl alone.
  await reapOrphan(root, entry.port);

  // Always update status — even on failure, the service is no longer
  // managed as "running" from RepoOS's perspective.
  entry.status = deriveStatus("stopped", entry.autoStart);
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return stopError ? { ok: false, error: stopError } : { ok: true };
}

/**
 * Restart a background service.
 */
export async function restartService(root: string): Promise<{ ok: boolean; error?: string }> {
  const stop = await stopService(root);
  if (!stop.ok) return stop;
  // Brief delay to let the port release
  await new Promise((r) => setTimeout(r, 500));
  return startService(root);
}

/**
 * Enable auto-start at login.
 */
export async function enableAutoStart(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  if (entry.platform === "launchd") {
    // Flipping RunAtLoad requires an unload+load round-trip, and `load` with
    // RunAtLoad=true starts the job immediately regardless of whether it was
    // already running. Toggling "Start at login" must only change what
    // happens at the NEXT login, not the service's current running state —
    // so if it wasn't running before, stop the immediate start `load` caused.
    const wasRunning = queryLaunchdStatus(entry.label) === "running";
    const plist = generatePlist({ ...entry, autoStart: true });
    writeFileSync(plistPath(entry.label), plist, "utf8");
    launchctl("unload", plistPath(entry.label));
    launchctl("load", plistPath(entry.label));
    if (!wasRunning) launchctl("stop", entry.label);
  } else {
    // systemd's enable/disable never touch the running unit — no equivalent
    // side effect to correct for.
    systemctl("enable", `${entry.label}.service`);
  }

  entry.autoStart = true;
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);
  entry.status = deriveStatus(liveStatus as "running" | "stopped", true);
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: true };
}

/**
 * Disable auto-start at login.
 */
export async function disableAutoStart(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  if (entry.platform === "launchd") {
    // Same unload+load round-trip as enableAutoStart, but the opposite
    // failure mode: RunAtLoad=false means the `load` above does NOT restart
    // it, so a service that was running before this toggle would otherwise
    // be silently stopped by "Disable at login" — bring it back explicitly.
    const wasRunning = queryLaunchdStatus(entry.label) === "running";
    const plist = generatePlist({ ...entry, autoStart: false });
    writeFileSync(plistPath(entry.label), plist, "utf8");
    launchctl("unload", plistPath(entry.label));
    launchctl("load", plistPath(entry.label));
    if (wasRunning) launchctl("start", entry.label);
  } else {
    systemctl("disable", `${entry.label}.service`);
  }

  entry.autoStart = false;
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);
  entry.status = deriveStatus(liveStatus as "running" | "stopped", false);
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: true };
}

/**
 * Run a health check on the service's HTTP endpoint.
 */
export async function checkHealth(
  root: string,
): Promise<{ ok: boolean; status: ServiceStatus; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, status: "unknown", error: "No service found" };

  // First check OS-level status
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);

  // launchd/systemd reporting "not running" doesn't rule out a live reload
  // replacement still bound to the port (see the "Reload-orphan detection"
  // section) — that's the ordinary state after any reload, not a failure.
  // Only report "not running" outright when there's no orphan to probe
  // either.
  if (liveStatus !== "running" && readServeLockPid(root, entry.port) === null) {
    const status = deriveStatus(liveStatus as "running" | "stopped", entry.autoStart);
    entry.status = status;
    entry.lastHealthCheck = new Date().toISOString();
    entry.healthError = "Service is not running";
    entry.updatedAt = new Date().toISOString();
    writeRegistry(entries);
    return { ok: false, status, error: "Service is not running" };
  }

  // Probe the health endpoint — either the OS reports it running, or an
  // orphan replacement is alive on the port. Alive-but-failing-to-respond is
  // exactly the "Needs attention" case (spec's 4th state) — surface it as
  // "error" rather than "running", or the UI has no way to distinguish it
  // from healthy.
  const health = await probeHealth(entry.port);
  const status: ServiceStatus = health.ok ? "running" : "error";
  entry.status = status;
  entry.lastHealthCheck = new Date().toISOString();
  entry.healthError = health.error ?? null;
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: health.ok, status, error: health.error };
}
