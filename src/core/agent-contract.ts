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
import { spawn } from "node:child_process";
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

interface ContractCommandTemplates {
  version: () => string[];
  help: () => string[];
  models: () => string[];
  run: (dir: string, prompt: string) => string[];
  resume: (dir: string, sessionId: string, prompt: string) => string[];
}

/**
 * One-shot prompt safe for a contract probe: no task content, no project
 * reads, a single-word answer that proves the CLI round-trips. In live mode
 * this is the only thing that even touches a provider.
 */
const PROBE_PROMPT = "Reply with the single word OK.";

/** opencode v2 — the worked example. Shapes verified against `agents.ts`. */
const OPENCODE_CONTRACT: ContractCommandTemplates = {
  version: () => ["--version"],
  help: () => ["--help"],
  models: () => ["models"],
  // --format json streams one event object per line (agents.ts consumes
  // step_start/text/tool_use/step_finish/error). --dir pins the isolated
  // fixture (0044) and --auto stops permission prompts from hanging the probe.
  run: (dir, prompt) => ["run", "--format", "json", "--dir", dir, "--auto", prompt],
  // Mirrors agents.ts resumeCommand's opencode branch: --session <id> resumes
  // the same session, --auto is unconditional there too.
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

/** Templates keyed by canonical cli id; `--format json` parsers live here too. */
const CONTRACT_TEMPLATES: Record<string, ContractCommandTemplates> = {
  opencode: OPENCODE_CONTRACT,
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
  });

  const templates = CONTRACT_TEMPLATES[cli];
  if (!templates) {
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
  try {
    const probe = (id: ContractCapabilityId, label: string, ok: boolean, detail: string): void => {
      capabilities.push({ id, label, ok, detail });
    };

    // ── version ─────────────────────────────────────────────────────────
    const versionCap = await spawnCapture(binary, templates.version(), {
      timeoutMs,
      cwd: workDir,
    });
    const parsedVersion = parseAgentVersion(versionCap.stdout);
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
    const helpOut = helpCap.stdout.trim();
    const helpOk =
      helpCap.code === 0 && helpOut.length > 0 && /\b(run|usage|options|command)\b/i.test(helpOut);
    probe(
      "help",
      "Help / flag shape",
      helpOk,
      helpOk
        ? `--help printed ${helpOut.split("\n").length} line(s)`
        : `--help didn't produce expected usage text${helpOut ? `: ${helpOut.split("\n")[0]}` : ""}`,
    );

    // ── model discovery ─────────────────────────────────────────────────
    const modelsCap = await spawnCapture(binary, templates.models(), {
      timeoutMs,
      cwd: workDir,
    });
    const modelLines = modelsCap.stdout.split("\n").filter((l) => l.trim());
    const modelsOk = modelsCap.code === 0 && modelLines.length > 0;
    probe(
      "model-discovery",
      "Model discovery",
      modelsOk,
      modelsOk
        ? `model listing returned ${modelLines.length} entr${modelLines.length === 1 ? "y" : "ies"}`
        : `model listing failed${modelsCap.stderr.trim() ? `: ${modelsCap.stderr.trim().split("\n")[0]}` : " (no output)"}`,
    );

    // ── headless one-shot (shared with structured-events + auto) ───────
    const runArgs = templates.run(workDir, PROBE_PROMPT);
    const oneShot = await spawnCapture(binary, runArgs, { timeoutMs, cwd: workDir });
    const events = validateEventStream(oneShot.stdout);
    const hasTextEvent = parseEventStream(oneShot.stdout).some(
      (e) => e.part?.text && /OK/i.test(e.part.text),
    );
    const oneShotOk = oneShot.code === 0 && events.ok && hasTextEvent;
    probe(
      "headless-one-shot",
      "Headless one-shot",
      oneShotOk,
      oneShotOk
        ? "a trivial run completed with a text answer in the event stream"
        : `one-shot run failed: ${oneShot.code === null ? (oneShot.timedOut ? "timed out" : "did not start") : `exit ${oneShot.code}`}; events: ${events.detail}${oneShot.stderr.trim() ? ` (${oneShot.stderr.trim().split("\n")[0]})` : ""}`,
    );

    // ── structured events ──────────────────────────────────────────────
    probe("structured-events", "Structured event parsing", events.ok, events.detail);

    // ── auto / permission mode ──────────────────────────────────────────
    const autoUsed = runArgs.includes("--auto");
    const autoOk = oneShotOk && autoUsed;
    probe(
      "auto-permissions",
      "Permission / auto mode",
      autoOk,
      autoOk
        ? "the run accepted --auto and completed without an interactive permission prompt"
        : autoUsed
          ? "the run used --auto but did not complete cleanly"
          : "the adapter's one-shot did not pass a permission/auto flag",
    );

    // ── session continuation ────────────────────────────────────────────
    const sessionId = extractSessionId(oneShot.stdout);
    if (!sessionId) {
      probe(
        "session-continuation",
        "Session continuation",
        false,
        "no session id appeared in the one-shot event stream, so a follow-up could not be started",
      );
    } else {
      const resumeArgs = templates.resume(workDir, sessionId, PROBE_PROMPT);
      const resume = await spawnCapture(binary, resumeArgs, { timeoutMs, cwd: workDir });
      const resumeEvents = validateEventStream(resume.stdout);
      const resumeOk = resume.code === 0 && resumeEvents.ok;
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
