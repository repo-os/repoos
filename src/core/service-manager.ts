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
import { homedir } from "node:os";
import { basename, join, dirname, resolve } from "node:path";
import { realpathSync } from "node:fs";

// ── Types ────────────────────────────────────────────────────────────────────

export type ServicePlatform = "launchd" | "systemd";
export type ServiceStatus = "running" | "stopped" | "error" | "unknown";

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
  return join(homedir(), "Library", "Logs");
}

function repoosBinary(): string {
  // The service unit must point at a real, runnable `repoos` command. Try PATH
  // first — this covers global installs (`npm i -g`, `bun link`) and any
  // environment where the user can already run `repoos serve`.
  try {
    const result = execFileSync("which", ["repoos"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (result) return result;
  } catch {
    // repoos not on PATH
  }
  // If running from the source checkout (dist/ exists next to src/), use
  // process.execPath + the CLI entry directly. This covers the common dev
  // case where `repoos` is a bun link pointing at this repo's dist/.
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  if (existsSync(cliEntry)) {
    return process.execPath;
  }
  // Nothing found — caller should surface an error rather than generating
  // a unit that will fail to start.
  throw new Error(
    "Cannot find the `repoos` binary. Ensure it is installed and on PATH, " +
      "or run this command from a RepoOS source checkout with a built dist/.",
  );
}

function generatePlist(entry: ServiceEntry): string {
  const bin = repoosBinary();
  const isInterpreter =
    bin.includes("node") || bin.endsWith("node") || bin.includes("bun") || bin.endsWith("bun");
  // When the binary is an interpreter (node/bun), we need the CLI entry point
  // script. Derive it from this module's location (src/core/service-manager.ts
  // → ../../dist/cli/index.js) rather than guessing from the binary path.
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  const programArgs = isInterpreter
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
  const bin = repoosBinary();
  const isInterpreter =
    bin.includes("node") || bin.endsWith("node") || bin.includes("bun") || bin.endsWith("bun");
  const srcDir = dirname(dirname(new URL(import.meta.url).pathname));
  const cliEntry = join(srcDir, "dist", "cli", "index.js");
  const execStart = isInterpreter
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

function queryLaunchdStatus(label: string): ServiceStatus {
  const result = launchctl("list", label);
  if (!result.ok) return "stopped";
  // Check if the process is actually running (has a PID entry > 0)
  const pidMatch = result.stdout.match(/^\S+\s+(\d+)/m);
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
    const uid = execFileSync("id", ["-u"], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const lingerDir = join(homedir(), ".config", "systemd", "user", "linger", `${uid}.d`);
    return existsSync(lingerDir);
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
    // The plist/unit was removed outside RepoOS — mark as stopped with a
    // clear error so the UI surfaces it as "Needs attention".
    if (entry.status !== "stopped" || entry.healthError !== "Service file removed externally") {
      entry.status = "stopped";
      entry.healthError = "Service file removed externally — reinstall to restore";
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

  // Update status if changed
  if (entry.status !== liveStatus || entry.healthError !== null) {
    entry.status = liveStatus;
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
    const plist = generatePlist(entry);
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

    // Reload systemd
    systemctl("daemon-reload");
    // Enable/disable controls auto-start; always reload the unit first
    if (entry.autoStart) {
      systemctl("enable", `${label}.service`);
    }
  }

  entries.push(entry);
  writeRegistry(entries);

  // Start the service immediately after install
  const startResult = await startService(root);

  return { ok: true, entry };
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
 */
export async function startService(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  if (entry.platform === "launchd") {
    const result = launchctl("start", entry.label);
    if (!result.ok) return { ok: false, error: `launchctl start failed: ${result.stderr}` };
  } else {
    const result = systemctl("start", `${entry.label}.service`);
    if (!result.ok) return { ok: false, error: `systemctl start failed: ${result.stderr}` };
  }

  // Update status
  const liveStatus =
    entry.platform === "launchd"
      ? queryLaunchdStatus(entry.label)
      : querySystemdStatus(entry.label);
  entry.status = liveStatus;
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: true };
}

/**
 * Stop a background service.
 */
export async function stopService(root: string): Promise<{ ok: boolean; error?: string }> {
  const entries = readRegistry();
  const entry = findEntry(entries, root);
  if (!entry) return { ok: false, error: "No service found for this repository" };

  let stopError: string | undefined;
  if (entry.platform === "launchd") {
    const result = launchctl("stop", entry.label);
    if (!result.ok) stopError = `launchctl stop failed: ${result.stderr}`;
  } else {
    const result = systemctl("stop", `${entry.label}.service`);
    if (!result.ok) stopError = `systemctl stop failed: ${result.stderr}`;
  }

  // Always update status — even on failure, the service is no longer
  // managed as "running" from RepoOS's perspective. The OS may have
  // already stopped it, or the stop may have failed because it was
  // already stopped.
  entry.status = "stopped";
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
    // Rewrite the plist with RunAtLoad=true
    const plist = generatePlist({ ...entry, autoStart: true });
    writeFileSync(plistPath(entry.label), plist, "utf8");
    // Reload to pick up changes
    launchctl("unload", plistPath(entry.label));
    launchctl("load", plistPath(entry.label));
  } else {
    systemctl("enable", `${entry.label}.service`);
  }

  entry.autoStart = true;
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
    const plist = generatePlist({ ...entry, autoStart: false });
    writeFileSync(plistPath(entry.label), plist, "utf8");
    launchctl("unload", plistPath(entry.label));
    launchctl("load", plistPath(entry.label));
  } else {
    systemctl("disable", `${entry.label}.service`);
  }

  entry.autoStart = false;
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

  if (liveStatus !== "running") {
    entry.status = liveStatus;
    entry.lastHealthCheck = new Date().toISOString();
    entry.healthError = "Service is not running";
    entry.updatedAt = new Date().toISOString();
    writeRegistry(entries);
    return { ok: false, status: liveStatus, error: "Service is not running" };
  }

  // Probe the health endpoint
  const health = await probeHealth(entry.port);
  entry.status = liveStatus;
  entry.lastHealthCheck = new Date().toISOString();
  entry.healthError = health.error ?? null;
  entry.updatedAt = new Date().toISOString();
  writeRegistry(entries);

  return { ok: health.ok, status: liveStatus, error: health.error };
}
