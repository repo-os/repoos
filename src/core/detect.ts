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

/** A coding agent RepoOS knows about, regardless of whether it is installed. */
export interface KnownAgent {
  /** Stable id, e.g. "opencode", "qwen-code". */
  id: string;
  /** Display name, e.g. "claude code". */
  name: string;
  /** The binary searched on PATH. */
  binary: string;
  /** True when RepoOS has a driver for this CLI (can start headless runs). */
  drivable: boolean;
  /** Copyable install hint shown when the CLI is missing. */
  installHint: string;
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
    binary: "opencode",
    drivable: true,
    installHint: "npm i -g opencode-ai",
  },
  {
    id: "claude-code",
    name: "claude code",
    binary: "claude",
    drivable: true,
    installHint: "npm i -g @anthropic-ai/claude-code",
  },
  {
    id: "qwen-code",
    name: "qwen code",
    binary: "qwen",
    drivable: true,
    installHint: "npm i -g @qwen-code/qwen-code",
  },
  {
    id: "codex",
    name: "codex",
    binary: "codex",
    drivable: true,
    installHint: "npm i -g @openai/codex",
  },
  {
    id: "gemini",
    name: "gemini",
    binary: "gemini",
    drivable: false,
    installHint: "npm i -g @google/gemini-cli",
  },
  {
    id: "copilot",
    name: "github copilot",
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
    binary: "agy",
    drivable: false,
    installHint: "npm i -g @google/antigravity",
  },
  {
    id: "kiro",
    name: "kiro",
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

  const rows = await Promise.all(
    list.map(async (agent) => {
      const resolved = resolveBinary(agent.binary, pathEnv);
      if (!resolved) {
        return { ...agent, installed: false, path: null, version: null, headless: null };
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
      return {
        ...agent,
        installed: true,
        path: resolved,
        version,
        headless: !desktopOnly,
      };
    }),
  );
  return rows;
}
