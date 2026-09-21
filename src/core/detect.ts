/**
 * Coding-agent detection — tells the Agents page what is actually installed,
 * headless-drivable, and missing on the machine.
 *
 * Zero runtime deps: `node:fs` / `node:path` for PATH resolution (no `which`),
 * `node:child_process` for a best-effort `--version` probe. Everything here is
 * fail-soft: a missing binary, a broken PATH entry, or a hung version probe
 * must never throw — callers (the HTTP endpoint, the UI) always get a row.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { AGENT_CLIS } from "./config.js";
import { compatibilityForAgent, type AgentCompatibility } from "./agent-compatibility.js";

/** A coding agent RepoOS knows about, regardless of whether it is installed. */
export interface KnownAgent {
  /** Stable id, e.g. "opencode", "qwen-code". */
  id: string;
  /** Display name, e.g. "claude code". */
  name: string;
  /**
   * The `AGENT_CLIS` identifier this agent corresponds to when `drivable`,
   * e.g. "claude code" for the `id: "claude-code"` entry, or "cursor" for
   * `id: "cursor"` (whose display `name` is "cursor agent"). `id` and this
   * value diverge for exactly the multi-word/hyphenated agents, which used to
   * make any code that favorited or filtered by `id` silently fail to match
   * `AGENT_CLIS`-keyed data (#0404 follow-up: favoriting "claude code" in the
   * detected-agents list didn't make it through the agent+model selector's
   * favorites filter, because that filter matches against `AGENT_CLIS`
   * strings while the favorite was stored under `id`). `undefined` when
   * `drivable` is false — there is no `AGENT_CLIS` entry to map to.
   */
  cli?: (typeof AGENT_CLIS)[number];
  /** The binary searched on PATH. */
  binary: string;
  /** True when RepoOS has a driver for this CLI (can start headless runs). */
  drivable: boolean;
  /** Copyable install hint shown when the CLI is missing. */
  installHint: string;
  /** Copyable sign-in hint shown when the binary is installed but not logged in. */
  authHint?: string;
  /**
   * Arguments (after the binary) whose JSON stdout reports authentication
   * state. Only set for CLIs that expose a reliable machine-readable status
   * probe; the parser is {@link parseAuthState}. Probed only when the binary
   * is installed and headless.
   */
  authCheckArgs?: string[];
  /** One-line capability note shown in the Agents UI. */
  capability?: string;
  /** Legacy tooling that remains visible but must not be offered for new assignments. */
  deprecated?: boolean;
  /** Official migration/install documentation for a deprecated tool. */
  migrationUrl?: string;
  /** Short caveat shown alongside deprecated tooling. */
  migrationNote?: string;
}

/** One row of the detection result. */
export interface DetectedAgent extends KnownAgent {
  /** Whether the binary resolves on PATH. */
  installed: boolean;
  /** Absolute path of the resolved binary, or null when not found. */
  path: string | null;
  /** First line of `--version` output, or null when the probe failed. */
  version: string | null;
  /**
   * Whether the installed binary is headless-drivable:
   * - `false` — a desktop-only install (e.g. a macOS `.app` bundle shadows PATH)
   * - `true` — headless-capable
   * - `null` — not installed (headless is unknown)
   */
  headless: boolean | null;
  /**
   * Authentication state reported by the CLI's own status probe:
   * - `true` — logged in
   * - `false` — installed but not authenticated
   * - `null` — no probe available, or it timed out / returned unparseable output
   */
  auth: boolean | null;
  /** Version-contract result; this is advisory and does not replace capability checks. */
  compatibility?: AgentCompatibility;
}

/** Default ceiling on the `--version` probe, ms. A hung binary is SIGKILLed. */
export const VERSION_TIMEOUT_MS = 1500;
/** Cap on the version string kept for display. */
const VERSION_MAX_LEN = 200;

/** The known agent list. `drivable` mirrors the drivers in src/server/agents.ts. */
export const KNOWN_AGENTS: KnownAgent[] = [
  {
    id: "opencode",
    name: "opencode",
    cli: "opencode",
    binary: "opencode",
    drivable: true,
    installHint: "npm i -g opencode-ai",
  },
  {
    id: "claude-code",
    name: "claude code",
    cli: "claude code",
    binary: "claude",
    drivable: true,
    installHint: "npm i -g @anthropic-ai/claude-code",
  },
  {
    id: "qwen-code",
    name: "qwen code",
    cli: "qwen code",
    binary: "qwen",
    drivable: true,
    installHint: "npm i -g @qwen-code/qwen-code",
  },
  {
    id: "codex",
    name: "codex",
    cli: "codex",
    binary: "codex",
    drivable: true,
    installHint: "npm i -g @openai/codex",
  },
  {
    id: "gemini",
    name: "gemini",
    binary: "gemini",
    drivable: false,
    installHint: "Use Antigravity CLI (agy) instead.",
    deprecated: true,
    migrationUrl: "https://antigravity.google/docs/cli/gcli-migration/",
    migrationNote: "Enterprise and paid API-key Gemini CLI users may still have access.",
  },
  {
    id: "copilot",
    name: "github copilot",
    cli: "github copilot",
    binary: "copilot",
    drivable: true,
    installHint: "npm i -g @github/copilot",
  },
  {
    id: "aider",
    name: "aider",
    binary: "aider",
    drivable: false,
    installHint: "pipx install aider-chat",
  },
  {
    id: "goose",
    name: "goose",
    binary: "goose",
    drivable: false,
    installHint:
      "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
  },
  {
    id: "antigravity",
    name: "antigravity",
    cli: "antigravity",
    binary: "agy",
    drivable: true,
    installHint: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    authHint:
      "Run `agy` once to sign in (local keyring or SSH browser code), or configure GEMINI_API_KEY with modelProvider=gemini.",
    authCheckArgs: ["-p", "/model", "--output-format", "json"],
    capability: "Headless stream-JSON, verified model discovery, and conversation resume",
  },
  {
    id: "kiro",
    name: "kiro",
    cli: "kiro",
    binary: "kiro-cli",
    drivable: true,
    installHint: "npm i -g kiro-cli",
  },
  {
    id: "pi",
    name: "pi",
    binary: "pi",
    drivable: false,
    installHint: "npm i -g @earendil-works/pi-coding-agent",
  },
  {
    id: "cursor",
    name: "cursor agent",
    cli: "cursor",
    binary: "cursor-agent",
    drivable: true,
    installHint: "curl https://cursor.com/install -fsS | bash",
    authHint: "cursor-agent login   (or export CURSOR_API_KEY=<key>)",
    authCheckArgs: ["status", "--format", "json"],
    capability: "Print mode with stream-JSON, session resume, and model selection",
  },
];

const WIN32_SCRIPT_RE = /\.(cmd|bat)$/i;
/** A binary inside a macOS `.app` bundle: `Foo.app/Contents/MacOS/<bin>`. */
const APP_BUNDLE_RE = /\.app[\/\\]Contents[\/\\]MacOS[\/\\]/i;
/**
 * `--version` output signatures of a desktop app that re-opens its GUI instead
 * of answering on stdout. Deliberately narrow and opencode-only to avoid false
 * positives from headless CLIs that embed Electron.
 */
const DESKTOP_OUTPUT_SIGNATURES: RegExp[] = [
  /relaunch/i,
  /desktop application/i,
  /launching the desktop/i,
  /this app is a desktop/i,
];

/** True when `p` exists and is executable (X_OK; F_OK on Windows). */
export function isExecutable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Candidate filenames for a binary name (Windows adds `.cmd` / `.exe` / `.bat`). */
export function binaryCandidates(binary: string): string[] {
  const out = [binary];
  if (process.platform === "win32") {
    out.push(`${binary}.cmd`, `${binary}.exe`, `${binary}.bat`);
  }
  return out;
}

/**
 * Resolve a binary name against a PATH string. Returns the first existing,
 * executable candidate, or null. PATH search order is preserved; empty entries
 * are skipped.
 */
export function resolveBinary(
  binary: string,
  pathEnv: string = process.env.PATH ?? "",
): string | null {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of binaryCandidates(binary)) {
      const full = join(dir, name);
      if (isExecutable(full)) return full;
    }
  }
  return null;
}

/** True when a resolved binary path lives inside a macOS `.app` bundle. */
export function isAppBundleBinary(p: string): boolean {
  return APP_BUNDLE_RE.test(p.replace(/\\/g, "/"));
}

/** True when `--version` output carries a desktop-app relaunch signature. */
export function isDesktopOutputSignature(version: string | null): boolean {
  if (!version) return false;
  return DESKTOP_OUTPUT_SIGNATURES.some((re) => re.test(version));
}

/**
 * Capture the first line of `<binaryPath> --version` output. Never throws and
 * never hangs: a spawn failure, error event, or the timeout all resolve null.
 */
export function captureVersion(binaryPath: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const needsShell = process.platform === "win32" && WIN32_SCRIPT_RE.test(binaryPath);
    let proc: ChildProcess;
    try {
      proc = spawn(binaryPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: needsShell,
      });
    } catch {
      resolve(null);
      return;
    }

    let out = "";
    let errOut = "";
    let settled = false;
    const done = (v: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      done(null);
    }, timeoutMs);

    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    proc.stderr?.on("data", (c: Buffer) => {
      errOut += c.toString("utf8");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    proc.on("exit", () => {
      clearTimeout(timer);
      const text = `${out}${errOut ? ` ${errOut.trim()}` : ""}`.trim();
      if (!text) {
        done(null);
        return;
      }
      const first = text.split(/\r?\n/)[0].trim();
      done(first.length > VERSION_MAX_LEN ? first.slice(0, VERSION_MAX_LEN) : first);
    });
  });
}

export interface DetectOptions {
  /** PATH string to search. Defaults to `process.env.PATH`. */
  pathEnv?: string;
  /** `--version` probe timeout in ms. Defaults to VERSION_TIMEOUT_MS. */
  versionTimeoutMs?: number;
  /** Agent list to probe (tests inject a narrowed list). */
  agents?: readonly KnownAgent[];
  /** Whether to run the CLI auth probe too. Default: true. */
  probeAuth?: boolean;
}

/**
 * Parse a CLI's auth-status JSON. Deliberately tolerant of the handful of
 * boolean-ish shapes a status command might use; anything unrecognized is
 * `null` (unknown), never a fabricated false.
 */
export function parseAuthState(text: string): boolean | null {
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.isAuthenticated === "boolean") return obj.isAuthenticated;
  if (typeof obj.authenticated === "boolean") return obj.authenticated;
  if (typeof obj.status === "string") {
    const status = obj.status.trim().toLowerCase();
    if (status === "authenticated" || status === "success") return true;
    if (status === "unauthenticated" || status === "not_authenticated") return false;
    if (status === "error") {
      const error = obj.error;
      const message =
        typeof error === "string"
          ? error
          : error &&
              typeof error === "object" &&
              typeof (error as Record<string, unknown>).message === "string"
            ? ((error as Record<string, unknown>).message as string)
            : "";
      if (/auth|sign[ -]?in|credential|api key|login/i.test(message)) return false;
    }
  }
  return null;
}

/**
 * Run a CLI's auth-status command and parse its JSON stdout. Never throws and
 * never hangs: a spawn failure, error, non-zero exit, timeout, or unparseable
 * output all resolve `null`.
 */
export function captureAuthState(
  binaryPath: string,
  args: string[],
  timeoutMs: number,
): Promise<boolean | null> {
  return new Promise((resolve) => {
    const needsShell = process.platform === "win32" && WIN32_SCRIPT_RE.test(binaryPath);
    let proc: ChildProcess;
    try {
      proc = spawn(binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: needsShell,
      });
    } catch {
      resolve(null);
      return;
    }

    let out = "";
    let settled = false;
    const done = (v: boolean | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      done(null);
    }, timeoutMs);

    proc.stdout?.on("data", (c: Buffer) => {
      if (out.length < VERSION_MAX_LEN * 8) out += c.toString("utf8");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    proc.on("exit", () => {
      clearTimeout(timer);
      done(parseAuthState(out));
    });
  });
}

/**
 * Probe every known coding agent: resolve its binary on PATH and, when found,
 * capture a version. Rows for missing binaries carry `installed: false`.
 *
 * A binary inside a macOS `.app` bundle is not probed for a version — spawning
 * it could relaunch the desktop app on the user's screen — and is reported as
 * desktop-only (`headless: false`).
 */
export async function detectAgents(opts: DetectOptions = {}): Promise<DetectedAgent[]> {
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? "";
  const timeoutMs = opts.versionTimeoutMs ?? VERSION_TIMEOUT_MS;
  const list = opts.agents ?? KNOWN_AGENTS;
  const probeAuth = opts.probeAuth ?? true;

  const rows = await Promise.all(
    list.map(async (agent) => {
      const resolved = resolveBinary(agent.binary, pathEnv);
      if (!resolved) {
        return {
          ...agent,
          installed: false,
          path: null,
          version: null,
          headless: null,
          auth: null,
          compatibility: compatibilityForAgent({
            cli: agent.cli,
            version: null,
            drivable: agent.drivable,
          }),
        };
      }
      const appBundle = isAppBundleBinary(resolved);
      let version: string | null = null;
      if (!appBundle) {
        try {
          version = await captureVersion(resolved, timeoutMs);
        } catch {
          version = null;
        }
      }
      const desktopOnly =
        appBundle || (agent.id === "opencode" && isDesktopOutputSignature(version));
      let auth: boolean | null = null;
      if (probeAuth && !desktopOnly && agent.authCheckArgs?.length) {
        try {
          auth = await captureAuthState(resolved, agent.authCheckArgs, timeoutMs);
        } catch {
          auth = null;
        }
      }
      return {
        ...agent,
        installed: true,
        path: resolved,
        version,
        headless: !desktopOnly,
        auth,
        compatibility: compatibilityForAgent({ cli: agent.cli, version, drivable: agent.drivable }),
      };
    }),
  );
  return rows;
}
