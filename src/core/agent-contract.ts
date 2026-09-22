/**
 * Adapter contract suite for coding harnesses (#0466).
 *
 * A contract is a set of probes for the seams RepoOS actually depends on when
 * it drives a harness, not a full product test matrix: binary/version
 * detection, help/flag shape, model discovery, a controlled headless one-shot,
 * structured event parsing, permission/auto mode, session continuation, and
 * cancellation. Every probe runs against the installed (or a fake, in tests)
 * binary inside an isolated temporary directory.
 *
 * Modes:
 *   - fixture — every seam runs against a fake binary (deterministic, used by
 *     the test suite; no credentials or tokens involved).
 *   - live    — the same seams run against the real installed binary. The
 *     one-shot and resume probes may consume provider tokens, so callers MUST
 *     warn the user and gate on explicit opt-in (`repoos doctor --probe`
 *     does both); a probe never reads a project's task files or config.
 *
 * Start with OpenCode v2 (the only harness whose invocation shapes have been
 * verified against the adapter in `src/server/agents.ts`). Adding a harness is
 * a command-template entry plus fixture evidence, then certification — see
 * `docs/agent-compatibility.md`.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAgentVersion,
  type AgentCompatibilityContract,
  AGENT_COMPATIBILITY_MANIFEST,
} from "./agent-compatibility.js";
import { KNOWN_AGENTS, resolveBinary } from "./detect.js";

export type ContractCapabilityId =
  | "version"
  | "help"
  | "model-discovery"
  | "headless-one-shot"
  | "structured-events"
  | "auto-permissions"
  | "session-continuation"
  | "cancellation";

export interface ContractProbeResult {
  id: ContractCapabilityId;
  /** Human-readable seam name, aligned with the manifest's requiredCapabilities. */
  label: string;
  ok: boolean;
  detail: string;
}

export interface AdapterContractResult {
  cli: string;
  /** Binary the probe ran (resolved from PATH, or the fixture binary). */
  binary: string;
  mode: "fixture" | "live";
  passed: boolean;
  capabilities: ContractProbeResult[];
  durationMs: number;
  startedAt: string;
  /** Suggested manifest evidence when every seam passed. */
  evidence: string | null;
  /** Parsed semver triple from the version seam, or null when unparseable. */
  detectedVersion: [number, number, number] | null;
}

export interface AdapterContractOptions {
  cli: string;
  /** Explicit binary path (a fake binary in tests, or a real install). */
  bin?: string;
  /** live (default) runs real binary seams; fixture runs a fake binary. */
  mode?: "fixture" | "live";
  /** One-shot cwd; defaults to a fresh temp dir removed when done. */
  workDir?: string;
  /** Per-invocation ceiling; live one-shots can be slow. */
  timeoutMs?: number;
}

interface RunParseResult {
  sessionId: string | null;
  hasAnswer: boolean;
  recognized: number;
  total: number;
  detail: string;
}

interface ContractCommandTemplates {
  version: () => string[];
  help: () => string[];
  /** Returns args for model listing, or null when the CLI has no model-listing command. */
  models: () => string[] | null;
  run: (dir: string, prompt: string) => string[];
  resume: (dir: string, sessionId: string, prompt: string) => string[];
  /** Parse run stdout to extract session id and confirm the harness answered. Defaults to opencode parser. */
  parseRun?: (stdout: string) => RunParseResult;
  /**
   * Seams to auto-pass with a note rather than probe. Use for a CLI that
   * genuinely cannot satisfy a seam (e.g. kiro outputs no session ID during a
   * run, so session-continuation is captured post-run via the sessions list).
   */
  skipSeams?: Partial<Record<ContractCapabilityId, string>>;
}

/**
 * One-shot prompt safe for a contract probe: no task content, no project
 * reads, a single-word answer that proves the CLI round-trips. In live mode
 * this is the only thing that even touches a provider.
 */
const PROBE_PROMPT = "Reply with the single word OK.";

// ── per-harness run-output parsers ───────────────────────────────────────────

/**
 * Claude Code / Qwen Code / Cursor stream-json format.
 * System/init event carries `session_id`; result event carries text in `result`.
 */
function parseClaudeStyleRun(stdout: string): RunParseResult {
  const KNOWN = new Set(["system", "assistant", "user", "result", "tool_use", "tool_result"]);
  let sessionId: string | null = null;
  let hasAnswer = false;
  let recognized = 0;
  let total = 0;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as Record<string, unknown>;
      total++;
      if (typeof ev.session_id === "string" && ev.session_id) sessionId = ev.session_id;
      if (typeof ev.sessionId === "string" && ev.sessionId) sessionId = ev.sessionId;
      const type = typeof ev.type === "string" ? ev.type : "";
      if (KNOWN.has(type)) recognized++;
      if (type === "result" && typeof ev.result === "string" && /OK/i.test(ev.result)) {
        hasAnswer = true;
      }
      if (type === "assistant") {
        const msg = ev.message as Record<string, unknown> | undefined;
        const blocks = Array.isArray(msg?.content) ? (msg.content as unknown[]) : [];
        for (const b of blocks) {
          const block = b as Record<string, unknown>;
          if (block.type === "text" && typeof block.text === "string" && /OK/i.test(block.text)) {
            hasAnswer = true;
          }
        }
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return {
    sessionId,
    hasAnswer,
    recognized,
    total,
    detail:
      total === 0
        ? "no JSON lines in output"
        : `${recognized}/${total} recognized events; answer found: ${hasAnswer}`,
  };
}

/**
 * Codex stream-json format (codex exec --json).
 * `thread.started` carries `thread_id`; `item.completed` carries `item.text`.
 */
function parseCodexRun(stdout: string): RunParseResult {
  let sessionId: string | null = null;
  let hasAnswer = false;
  let recognized = 0;
  let total = 0;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as Record<string, unknown>;
      total++;
      const type = typeof ev.type === "string" ? ev.type : "";
      if (typeof ev.thread_id === "string" && ev.thread_id) sessionId = ev.thread_id;
      if (typeof ev.session_id === "string" && ev.session_id) sessionId = ev.session_id;
      if (
        type === "thread.started" ||
        type === "item.updated" ||
        type === "item.completed" ||
        type === "turn.started" ||
        type === "turn.completed" ||
        type === "turn.failed" ||
        type === "error"
      ) {
        recognized++;
      }
      // `item.completed` is the primary answer event in codex exec --json.
      if (type === "item.completed" || type === "item.updated") {
        const item = ev.item as Record<string, unknown> | undefined;
        const text =
          typeof item?.text === "string" ? item.text : typeof ev.delta === "string" ? ev.delta : "";
        if (/OK/i.test(text)) hasAnswer = true;
      }
    } catch {
      /* skip */
    }
  }
  return {
    sessionId,
    hasAnswer,
    recognized,
    total,
    detail:
      total === 0
        ? "no JSON lines in output"
        : `${recognized}/${total} recognized events; answer found: ${hasAnswer}`,
  };
}

/**
 * Antigravity (agy) stream-json format.
 * `event: "init"` carries `init.conversation_id`; `event: "result"` carries `result.response`.
 */
function parseAgyRun(stdout: string): RunParseResult {
  let sessionId: string | null = null;
  let hasAnswer = false;
  let recognized = 0;
  let total = 0;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as Record<string, unknown>;
      total++;
      if (typeof ev.conversation_id === "string" && ev.conversation_id)
        sessionId = ev.conversation_id;
      const event = typeof ev.event === "string" ? ev.event : "";
      if (event === "init") {
        recognized++;
        const init = ev.init as Record<string, unknown> | undefined;
        if (typeof init?.conversation_id === "string" && init.conversation_id)
          sessionId = init.conversation_id;
      }
      if (event === "result") {
        recognized++;
        const res = ev.result as Record<string, unknown> | undefined;
        if (typeof res?.conversation_id === "string" && res.conversation_id)
          sessionId = res.conversation_id;
        if (
          res?.status === "SUCCESS" &&
          typeof res.response === "string" &&
          /OK/i.test(res.response)
        ) {
          hasAnswer = true;
        }
      }
      // One-shot --output-format json (envelope directly in root)
      if (ev.status === "SUCCESS" && typeof ev.response === "string" && /OK/i.test(ev.response)) {
        hasAnswer = true;
        recognized++;
      }
    } catch {
      /* skip */
    }
  }
  return {
    sessionId,
    hasAnswer,
    recognized,
    total,
    detail:
      total === 0
        ? "no JSON lines in output"
        : `${recognized}/${total} recognized events; answer found: ${hasAnswer}`,
  };
}

/**
 * Kiro raw-text mode (chat --no-interactive --trust-all-tools).
 * Kiro prints the answer as plain text, not JSON events.
 * Session ID is not available during the run; captured separately afterwards.
 */
function parseKiroRun(stdout: string): RunParseResult {
  const trimmed = stdout.trim();
  const hasAnswer = /OK/i.test(trimmed);
  return {
    sessionId: null,
    hasAnswer,
    recognized: trimmed ? 1 : 0,
    total: 1,
    detail: trimmed
      ? `kiro printed plain text (${trimmed.length} chars); answer found: ${hasAnswer}`
      : "kiro produced no output",
  };
}

/**
 * opencode v1 (1.x) — legacy flag shapes.
 * --dir <path> sets the working directory; --print <prompt> is the message.
 */
const OPENCODE_V1_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => ["models"],
  run: (dir, prompt) => ["run", "--format", "json", "--dir", dir, "--auto", prompt],
  resume: (dir, sessionId, prompt) => [
    "run",
    "--format",
    "json",
    "--session",
    sessionId,
    "--dir",
    dir,
    "--auto",
    prompt,
  ],
};

/**
 * opencode v2 (2.x) — redesigned CLI. `run` is a subcommand, --dir is gone
 * (cwd is used instead), and --standalone spins a private server so no
 * background daemon is required during a probe.
 */
const OPENCODE_V2_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  // models starts a transient server on its own; --standalone suppresses output.
  models: () => ["models"],
  run: (_dir, prompt) => ["run", "--format", "json", "--standalone", "--auto", prompt],
  resume: (_dir, sessionId, prompt) => [
    "run",
    "--format",
    "json",
    "--standalone",
    "--session",
    sessionId,
    "--auto",
    prompt,
  ],
};

/**
 * Select opencode contract templates based on the installed major version.
 * Falls back to v2 for unknown/unparseable versions (newer is the safer guess).
 */
function opencodeContract(binary: string): ContractCommandTemplates {
  try {
    const result = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5000 });
    const ver = parseAgentVersion(result.stdout ?? "");
    if (ver && ver[0] < 2) return OPENCODE_V1_CONTRACT;
  } catch {
    /* fall through */
  }
  return OPENCODE_V2_CONTRACT;
}

/** Claude Code (2.x) — `-p` print mode, stream-json events, `--dangerously-skip-permissions`. */
const CLAUDE_CODE_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  // No standalone `models` subcommand — model listing is via the UI/config.
  models: () => null,
  run: (_dir, prompt) => [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ],
  resume: (_dir, sessionId, prompt) => [
    "-p",
    prompt,
    "--resume",
    sessionId,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ],
  parseRun: parseClaudeStyleRun,
};

/**
 * Qwen Code — Claude-compatible interface.
 * `--yolo` is required in headless mode (same blast radius as --dangerously-skip-permissions).
 */
const QWEN_CODE_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => null,
  run: (_dir, prompt) => ["-p", prompt, "--output-format", "stream-json", "--yolo"],
  resume: (_dir, sessionId, prompt) => [
    "--resume",
    sessionId,
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--yolo",
  ],
  parseRun: parseClaudeStyleRun,
};

/** Codex (OpenAI) — `exec` subcommand with `--json` structured output. */
const CODEX_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => null,
  run: (_dir, prompt) => ["exec", prompt, "--json", "--approve-for-me"],
  // --approve-for-me must come before the `resume` subcommand (exec-level flag).
  resume: (_dir, sessionId, prompt) => [
    "exec",
    "--approve-for-me",
    "resume",
    sessionId,
    prompt,
    "--json",
  ],
  parseRun: parseCodexRun,
};

/** Cursor Agent — same claude-style stream-json, `--force` bypasses approval prompts. */
const CURSOR_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => ["models"],
  run: (_dir, prompt) => ["-p", prompt, "--output-format", "stream-json", "-f"],
  resume: (_dir, sessionId, prompt) => [
    "-p",
    prompt,
    "--resume",
    sessionId,
    "--output-format",
    "stream-json",
    "-f",
  ],
  parseRun: parseClaudeStyleRun,
};

/**
 * Kiro CLI — headless via `chat --no-interactive --trust-all-tools`.
 * Outputs plain text (no JSON events); session ID captured post-run via session list —
 * not available during the run, so session-continuation is skipped in the probe.
 */
const KIRO_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["chat", "--help"],
  models: () => ["chat", "--list-models"],
  run: (_dir, prompt) => ["chat", "--no-interactive", "--trust-all-tools", prompt],
  resume: (_dir, sessionId, prompt) => [
    "chat",
    "--no-interactive",
    "--trust-all-tools",
    "--resume-id",
    sessionId,
    prompt,
  ],
  parseRun: parseKiroRun,
  skipSeams: {
    "session-continuation":
      "kiro does not emit a session id during a run; it is retrieved post-run via `kiro-cli chat --list-sessions --format json`",
    "structured-events":
      "kiro outputs plain text (not JSON events) in its default headless mode; ACP stream-json is available but not used by the RepoOS driver",
  },
};

/** Antigravity (agy) — Gemini-backed CLI, stream-json event format. */
const ANTIGRAVITY_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => ["models"],
  run: (_dir, prompt) => [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ],
  resume: (_dir, sessionId, prompt) => [
    "--conversation",
    sessionId,
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ],
  parseRun: parseAgyRun,
};

/** Templates keyed by canonical cli id; `--format json` parsers live here too. */
const CONTRACT_TEMPLATES: Record<string, (binary: string) => ContractCommandTemplates> = {
  opencode: opencodeContract,
  "claude code": () => CLAUDE_CODE_CONTRACT,
  "qwen code": () => QWEN_CODE_CONTRACT,
  codex: () => CODEX_CONTRACT,
  cursor: () => CURSOR_CONTRACT,
  kiro: () => KIRO_CONTRACT,
  antigravity: () => ANTIGRAVITY_CONTRACT,
};

const DEFAULT_TIMEOUT_MS: Record<"fixture" | "live", number> = {
  fixture: 15_000,
  live: 120_000,
};

/** Event `type`s opencode emits in `--format json` mode (see `agents.ts`). */
const KNOWN_EVENT_TYPES = new Set([
  "step_start",
  "text",
  "tool_use",
  "step_finish",
  "error",
  "session.id",
  "session_id",
]);

// ── process helpers ─────────────────────────────────────────────────────────

interface Capture {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function spawnCapture(
  binary: string,
  args: string[],
  opts: { timeoutMs: number; cwd: string },
): Promise<Capture> {
  return new Promise((resolve) => {
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary);
    let proc;
    try {
      proc = spawn(binary, args, {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: needsShell,
      });
    } catch (e) {
      resolve({
        code: null,
        signal: null,
        stdout: "",
        stderr: String(e),
        timedOut: false,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (v: Capture): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      done({ code: null, signal: null, stdout, stderr, timedOut: true });
    }, opts.timeoutMs);
    proc.on("error", (e: Error) => {
      clearTimeout(timer);
      done({ code: null, signal: null, stdout, stderr: stderr || e.message, timedOut: false });
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr, timedOut: false });
    });
  });
}

function waitForExit(proc: ReturnType<typeof spawn>, timeoutMs: number): Promise<Capture> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (v: Capture): void => {
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
      done({ code: null, signal: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    proc.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", (e: Error) => {
      clearTimeout(timer);
      done({ code: null, signal: null, stdout, stderr: stderr || e.message, timedOut: false });
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr, timedOut: false });
    });
    // A process that already exited (e.g. it errored out on its own before
    // SIGTERM was delivered) will never emit another `close`. The listeners are
    // attached above first, so resolving from the recorded state here cannot
    // race a not-yet-delivered event; without this, the probe would stall for
    // the full timeout on every run that exits early.
    if (proc.exitCode !== null || proc.signalCode !== null) {
      clearTimeout(timer);
      done({
        code: proc.exitCode,
        signal: proc.signalCode,
        stdout,
        stderr,
        timedOut: false,
      });
    }
  });
}

// ── opencode event-stream helpers ───────────────────────────────────────────

interface ParsedEvent {
  type?: string;
  sessionID?: string;
  sessionId?: string;
  part?: { text?: string };
}

/** Parse opencode `--format json` lines into plain objects (never throws). */
function parseEventStream(stdout: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ParsedEvent;
      events.push(parsed);
    } catch {
      /* non-JSON lines are treated as malformed for contract purposes */
    }
  }
  return events;
}

/** Validate a `--format json` stream: JSON lines, known event type / session id. */
function validateEventStream(stdout: string): { ok: boolean; count: number; detail: string } {
  const events = parseEventStream(stdout);
  if (events.length === 0) {
    return { ok: false, count: 0, detail: "no JSON events parsed from the stream" };
  }
  const recognized = events.filter(
    (e) => (e.type && KNOWN_EVENT_TYPES.has(e.type)) || !!e.sessionID || !!e.sessionId,
  );
  if (recognized.length === 0) {
    return {
      ok: false,
      count: events.length,
      detail: `${events.length} JSON line(s) but none with a known event type or session id`,
    };
  }
  return {
    ok: true,
    count: recognized.length,
    detail: `${recognized.length}/${events.length} events were recognized opencode shapes`,
  };
}

/** First session id seen in a `--format json` stream. */
function extractSessionId(stdout: string): string | null {
  for (const event of parseEventStream(stdout)) {
    const sessionId = event.sessionID ?? event.sessionId;
    if (typeof sessionId === "string" && sessionId) return sessionId;
  }
  return null;
}

// ── contract runner ─────────────────────────────────────────────────────────

function binaryForCli(cli: string): string | null {
  return KNOWN_AGENTS.find((agent) => agent.cli === cli)?.binary ?? null;
}

function contractFrom(db: { contracts: AgentCompatibilityContract[] }, cli: string) {
  return db.contracts.find((entry) => entry.cli === cli) ?? null;
}

export async function runAdapterContract(
  opts: AdapterContractOptions,
): Promise<AdapterContractResult> {
  const cli = opts.cli;
  const mode = opts.mode ?? "live";
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[mode];

  const fail = (reason: string): AdapterContractResult => ({
    cli,
    binary: opts.bin ?? "",
    mode,
    passed: false,
    capabilities: [{ id: "version", label: "Adapter availability", ok: false, detail: reason }],
    durationMs: Date.now() - t0,
    startedAt,
    evidence: null,
    detectedVersion: null,
  });

  const templateFactory = CONTRACT_TEMPLATES[cli];
  if (!templateFactory) {
    return fail(
      `No contract command templates are registered for cli "${cli}" yet; the framework is opencode-first (#0466).`,
    );
  }
  const binary = opts.bin ?? (binaryForCli(cli) ? resolveBinary(binaryForCli(cli)!) : null);
  if (!binary || !existsSync(binary)) {
    return fail(
      `Binary for "${cli}" was not found on PATH (looked for ${binaryForCli(cli) ?? "the configured binary"}). Install the harness first.`,
    );
  }

  // Resolve templates now that the binary path is known (factory may probe --version).
  const templates = templateFactory(binary);

  let workDir = opts.workDir;
  let ownDir = false;
  if (!workDir) {
    workDir = mkdtempSync(join(tmpdir(), "repoos-contract-"));
    ownDir = true;
  }
  if (mode === "live") {
    // An isolated git repo makes the one-shot behave like a real (but tiny and
    // throwaway) worktree. Exists already → leave it; never init inside the
    // caller's project.
    try {
      await spawnCapture("git", ["init", "-q"], { timeoutMs, cwd: workDir });
    } catch {
      /* a git-less temp dir is still an acceptable isolated fixture */
    }
  }

  const capabilities: ContractProbeResult[] = [];
  let parsedVersion: [number, number, number] | null = null;
  try {
    const probe = (id: ContractCapabilityId, label: string, ok: boolean, detail: string): void => {
      capabilities.push({ id, label, ok, detail });
    };

    // ── version ─────────────────────────────────────────────────────────
    const versionCap = await spawnCapture(binary, templates.version(), {
      timeoutMs,
      cwd: workDir,
    });
    parsedVersion = parseAgentVersion(versionCap.stdout);
    probe(
      "version",
      "Version detection",
      !!parsedVersion,
      parsedVersion
        ? `parsed ${parsedVersion.join(".")} (${versionCap.stdout.trim().split("\n")[0]})`
        : `unparseable --version output: ${versionCap.stdout.trim().slice(0, 120) || versionCap.stderr.trim().slice(0, 120) || "no output"}`,
    );

    // ── help ────────────────────────────────────────────────────────────
    const helpCap = await spawnCapture(binary, templates.help(), { timeoutMs, cwd: workDir });
    // Some CLIs (agy) write help to stderr rather than stdout.
    const helpOut = helpCap.stdout.trim() || helpCap.stderr.trim();
    const helpOk =
      (helpCap.code === 0 || helpCap.code === 2) &&
      helpOut.length > 0 &&
      /\b(run|usage|options|command)\b/i.test(helpOut);
    probe(
      "help",
      "Help / flag shape",
      helpOk,
      helpOk
        ? `--help printed ${helpOut.split("\n").length} line(s)`
        : `--help didn't produce expected usage text${helpOut ? `: ${helpOut.split("\n")[0]}` : ""}`,
    );

    // ── model discovery ─────────────────────────────────────────────────
    const modelsArgs = templates.models();
    if (modelsArgs === null) {
      probe(
        "model-discovery",
        "Model discovery",
        true,
        "harness has no standalone model-listing command; model selection is via config/UI",
      );
    } else {
      const modelsCap = await spawnCapture(binary, modelsArgs, { timeoutMs, cwd: workDir });
      const modelLines = modelsCap.stdout.split("\n").filter((l) => l.trim());
      // Exit 0 with no output is acceptable (opencode v2 without a live server).
      const modelsOk = modelsCap.code === 0;
      probe(
        "model-discovery",
        "Model discovery",
        modelsOk,
        modelsOk
          ? modelLines.length > 0
            ? `model listing returned ${modelLines.length} entr${modelLines.length === 1 ? "y" : "ies"}`
            : "model listing subcommand succeeded (no server running in probe dir)"
          : `model listing failed${modelsCap.stderr.trim() ? `: ${modelsCap.stderr.trim().split("\n")[0]}` : " (non-zero exit)"}`,
      );
    }

    // ── headless one-shot (shared with structured-events + auto) ───────
    const runArgs = templates.run(workDir, PROBE_PROMPT);
    const oneShot = await spawnCapture(binary, runArgs, { timeoutMs, cwd: workDir });

    // Use per-harness parser if provided, else fall back to opencode parser.
    const parsedRun = templates.parseRun
      ? templates.parseRun(oneShot.stdout)
      : (() => {
          const ev = validateEventStream(oneShot.stdout);
          const hasAnswer = parseEventStream(oneShot.stdout).some(
            (e) => e.part?.text && /OK/i.test(e.part.text),
          );
          return {
            sessionId: extractSessionId(oneShot.stdout),
            hasAnswer,
            recognized: ev.count,
            total: ev.count,
            detail: ev.detail,
          };
        })();

    const oneShotOk = oneShot.code === 0 && parsedRun.recognized > 0 && parsedRun.hasAnswer;
    probe(
      "headless-one-shot",
      "Headless one-shot",
      oneShotOk,
      oneShotOk
        ? "a trivial run completed with a text answer in the output"
        : `one-shot run failed: ${oneShot.code === null ? (oneShot.timedOut ? "timed out" : "did not start") : `exit ${oneShot.code}`}; ${parsedRun.detail}${oneShot.stderr.trim() ? ` (${oneShot.stderr.trim().split("\n")[0]})` : ""}`,
    );

    // ── structured events ──────────────────────────────────────────────
    const structuredSkip = templates.skipSeams?.["structured-events"];
    if (structuredSkip) {
      probe("structured-events", "Structured event parsing", true, `skipped: ${structuredSkip}`);
    } else {
      const structuredOk = parsedRun.recognized > 0;
      probe("structured-events", "Structured event parsing", structuredOk, parsedRun.detail);
    }

    // ── auto / permission mode ──────────────────────────────────────────
    const autoFlags = [
      "--auto",
      "--approve-for-me",
      "--dangerously-skip-permissions",
      "--dangerously-bypass-approvals-and-sandbox",
      "--trust-all-tools",
      "--yolo",
      "-f",
      "--force",
    ];
    const autoUsed = runArgs.some((a) => autoFlags.includes(a));
    const autoOk = oneShotOk && autoUsed;
    probe(
      "auto-permissions",
      "Permission / auto mode",
      autoOk,
      autoOk
        ? `the run used ${runArgs.find((a) => autoFlags.includes(a))} and completed without an interactive permission prompt`
        : autoUsed
          ? "the run used an auto/permission flag but did not complete cleanly"
          : "the adapter's one-shot did not pass a permission/auto flag",
    );

    // ── session continuation ────────────────────────────────────────────
    const sessionContinuationSkip = templates.skipSeams?.["session-continuation"];
    const sessionId = parsedRun.sessionId;
    if (sessionContinuationSkip) {
      probe(
        "session-continuation",
        "Session continuation",
        true,
        `skipped: ${sessionContinuationSkip}`,
      );
    } else if (!sessionId) {
      probe(
        "session-continuation",
        "Session continuation",
        false,
        "no session id found in the one-shot output, so a follow-up could not be started",
      );
    } else {
      const resumeArgs = templates.resume(workDir, sessionId, PROBE_PROMPT);
      const resume = await spawnCapture(binary, resumeArgs, { timeoutMs, cwd: workDir });
      const resumeParsed = templates.parseRun
        ? templates.parseRun(resume.stdout)
        : (() => {
            const ev = validateEventStream(resume.stdout);
            return {
              sessionId: null,
              hasAnswer: false,
              recognized: ev.count,
              total: ev.count,
              detail: ev.detail,
            };
          })();
      const resumeOk = resume.code === 0 && resumeParsed.recognized > 0;
      probe(
        "session-continuation",
        "Session continuation",
        resumeOk,
        resumeOk
          ? `resumed session ${sessionId} and a follow-up completed`
          : `resume of session ${sessionId} failed (exit ${resume.code ?? (resume.timedOut ? "timeout" : "no exit")})`,
      );
    }

    // ── cancellation / clean shutdown ───────────────────────────────────
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary);
    let cancelOk = false;
    let cancelDetail = "";
    try {
      const cancelProc = spawn(binary, runArgs, {
        cwd: workDir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: needsShell,
      });
      // Give the harness a moment to actually start, then ask it to stop.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (cancelProc.exitCode !== null || cancelProc.signalCode !== null) {
        // The run ended before we could signal it: cancellation was never
        // exercised, so do not credit the seam. (Common for a harness that
        // fails immediately — e.g. the broken-stream fixture.)
        cancelOk = false;
        cancelDetail = `the run exited on its own (code ${cancelProc.exitCode ?? "signal " + cancelProc.signalCode}) before SIGTERM could be delivered; cancellation was not exercised`;
      } else {
        try {
          cancelProc.kill("SIGTERM");
        } catch {
          /* process already gone */
        }
        const cancelExit = await waitForExit(cancelProc, 10_000);
        cancelOk = cancelExit.code !== null || cancelExit.signal !== null;
        cancelDetail = cancelOk
          ? `SIGTERM stopped the run (exit ${cancelExit.code ?? "signal " + cancelExit.signal})`
          : cancelExit.timedOut
            ? "the run ignored SIGTERM and had to be SIGKILLed after 10s"
            : "the run exited without a code/signal";
      }
    } catch (e) {
      cancelDetail = String(e);
    }
    probe("cancellation", "Cancellation / clean shutdown", cancelOk, cancelDetail);

    const passed = capabilities.every((c) => c.ok);
    const contract = contractFrom(AGENT_COMPATIBILITY_MANIFEST, cli);
    const evidence = passed
      ? `${contract?.name ?? cli} adapter contract suite passed ${capabilities.length}/${capabilities.length} seams (${mode} probe, ${startedAt}, binary ${binary}). Record this run against ${contract?.newestCertifiedVersion ?? "the certified release"} in src/core/agent-compatibility.json — set verifiedAt and verificationSource together.`
      : null;

    return {
      cli,
      binary,
      mode,
      passed,
      capabilities,
      durationMs: Date.now() - t0,
      startedAt,
      evidence,
      detectedVersion: parsedVersion ?? null,
    };
  } finally {
    if (ownDir) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup of the isolated fixture */
      }
    }
  }
}
