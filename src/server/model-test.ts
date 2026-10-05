import { spawn, type ChildProcess } from "node:child_process";
import type { Agent } from "../core/types.js";
import type { ModelSourceResult } from "../core/models.js";
import { oneShotFailureDetail, promptCommand } from "./agents.js";

export const MODEL_TEST_SENTINEL = "REPOOS_MODEL_OK";
/** Fallback probe ceiling when a CLI has no calibrated value below (#0677). */
export const MODEL_TEST_TIMEOUT_MS = 8_000;
/** Bound on the stored/displayed diagnostic (#0677). */
const OUTPUT_LIMIT = 4 * 1024;
/**
 * Bound on the raw stream kept for diagnosis (#0677). This must be generous: a
 * structured CLI can print a large JSON blob before the failing line, and the
 * old 4 KB cap dropped the cause on the floor (`Error: Model unavailable: …`
 * sat after a big event dump and never got read). We keep far more here, then
 * reduce to `OUTPUT_LIMIT` for display.
 */
const CAPTURE_LIMIT = 256 * 1024;
/**
 * Per-CLI probe ceilings (#0677). The single 8 s default was too short for
 * drivers that cold-start or resolve a model before their first token: the
 * field report saw `pi`+OpenRouter and `cursor` reported as "timed out" though
 * both worked in real runs. Give the slow drivers room, keep fast one-shots
 * tight. Explicit `timeoutMs` on the call still wins.
 */
export const MODEL_TEST_TIMEOUTS: Record<string, number> = {
  "claude code": 20_000,
  "qwen code": 20_000,
  codex: 25_000, // app-server cold start is heavier than a one-shot command
  "github copilot": 20_000,
  kiro: 20_000,
  cursor: 30_000,
  antigravity: 20_000,
  crush: 15_000,
  pi: 30_000,
  opencode: 15_000,
};

/** The probe ceiling for a CLI: its calibrated value, or the 8 s fallback. */
export function modelTestTimeoutMs(cli: string): number {
  return MODEL_TEST_TIMEOUTS[cli] ?? MODEL_TEST_TIMEOUT_MS;
}

/** Output this short on a timeout is a cold start, not a slow model (#0677). */
const COLD_START_OUTPUT_CHARS = 200;

export type ModelTestStatus = "passed" | "failed" | "timed_out" | "cold_start" | "not_testable";

export interface ModelTestResult {
  cli: string;
  model: string;
  status: ModelTestStatus;
  durationMs: number;
  error?: string;
}

export interface ModelTestOptions {
  cwd: string;
  timeoutMs?: number;
  concurrency?: number;
}

export function sanitizeDiagnostic(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, OUTPUT_LIMIT);
}

export function testModelCombination(
  cli: string,
  model: string,
  opts: ModelTestOptions,
): Promise<ModelTestResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? modelTestTimeoutMs(cli);
  const finish = (status: ModelTestStatus, error?: string): ModelTestResult => ({
    cli,
    model,
    status,
    durationMs: Date.now() - started,
    ...(error ? { error: sanitizeDiagnostic(error) } : {}),
  });
  const agent: Agent = { name: "model-test", cli, model, enabled: true };
  const { cmd, args } = promptCommand(
    agent,
    `Reply with exactly ${MODEL_TEST_SENTINEL}. Do not use tools or modify files.`,
  );
  // Compatibility probes may run from a configured repo root that Codex has
  // not marked trusted yet. The prompt cannot modify files, so bypass only the
  // repository trust preflight for this disposable probe.
  if (cli === "codex") args.splice(1, 0, "--skip-git-repo-check");
  return new Promise((resolve) => {
    let proc: ChildProcess;
    try {
      proc = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve(finish("failed", err instanceof Error ? err.message : String(err)));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (result: ModelTestResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      // Nothing on stdout means the model never produced a token: a cold start
      // (or an unavailable model), not a model that was simply slow. Naming the
      // distinction stops a working CLI being read as a hard failure (#0677).
      const produced = stdout.trim().length;
      if (produced < COLD_START_OUTPUT_CHARS) {
        done(
          finish(
            "cold_start",
            `No output within ${Math.round(timeoutMs / 1000)}s — cold start, or the model never responded. Retry once.`,
          ),
        );
      } else {
        const detail = oneShotFailureDetail(stderr, stdout) || `${cmd} produced no final answer`;
        done(finish("timed_out", `Timed out after ${Math.round(timeoutMs / 1000)}s: ${detail}`));
      }
    }, timeoutMs);
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < CAPTURE_LIMIT) stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < CAPTURE_LIMIT) stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => done(finish("failed", `Could not launch ${cmd}: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0 && sanitizeDiagnostic(stdout).includes(MODEL_TEST_SENTINEL)) {
        done(finish("passed"));
      } else {
        // Surface the actual failing line from the stream, not its 4 KB head —
        // the old behaviour dumped a JSON event blob and said nothing useful
        // (#0677). Fall back to a bounded diagnostic only when no line matches.
        const detail =
          oneShotFailureDetail(stderr, stdout) ||
          `${cmd} exited with code ${code ?? "unknown"} without ${MODEL_TEST_SENTINEL}`;
        done(finish("failed", detail));
      }
    });
  });
}

/** Test supported per-CLI model sources with a bounded worker pool. */
export async function testModelCombinations(
  byCli: Record<string, ModelSourceResult>,
  opts: ModelTestOptions,
): Promise<ModelTestResult[]> {
  const queued: Array<{ cli: string; model: string }> = [];
  const results: ModelTestResult[] = [];
  for (const [cli, source] of Object.entries(byCli)) {
    const models = [...new Set(source.models.length ? source.models : ["default"])];
    if (!source.supported) {
      for (const model of models)
        results.push({ cli, model, status: "not_testable", durationMs: 0 });
      continue;
    }
    for (const model of models) queued.push({ cli, model });
  }
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, opts.concurrency ?? 2), queued.length) },
    async () => {
      while (next < queued.length) {
        const item = queued[next++];
        results.push(await testModelCombination(item.cli, item.model, opts));
      }
    },
  );
  await Promise.all(workers);
  return results.sort((a, b) => a.cli.localeCompare(b.cli) || a.model.localeCompare(b.model));
}
