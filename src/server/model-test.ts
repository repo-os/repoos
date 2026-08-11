import { spawn, type ChildProcess } from "node:child_process";
import type { Agent } from "../core/types.js";
import type { ModelSourceResult } from "../core/models.js";
import { promptCommand } from "./agents.js";

export const MODEL_TEST_SENTINEL = "REPOOS_MODEL_OK";
export const MODEL_TEST_TIMEOUT_MS = 8_000;
const OUTPUT_LIMIT = 4 * 1024;

export type ModelTestStatus = "passed" | "failed" | "timed_out" | "not_testable";

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
      try { proc.kill("SIGKILL"); } catch { /* already exited */ }
      done(finish("timed_out", `Timed out after ${opts.timeoutMs ?? MODEL_TEST_TIMEOUT_MS}ms`));
    }, opts.timeoutMs ?? MODEL_TEST_TIMEOUT_MS);
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => done(finish("failed", `Could not launch ${cmd}: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0 && sanitizeDiagnostic(stdout).includes(MODEL_TEST_SENTINEL)) {
        done(finish("passed"));
      } else {
        const detail = stderr || stdout || `${cmd} exited with code ${code ?? "unknown"}`;
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
      for (const model of models) results.push({ cli, model, status: "not_testable", durationMs: 0 });
      continue;
    }
    for (const model of models) queued.push({ cli, model });
  }
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, opts.concurrency ?? 2), queued.length) }, async () => {
    while (next < queued.length) {
      const item = queued[next++];
      results.push(await testModelCombination(item.cli, item.model, opts));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.cli.localeCompare(b.cli) || a.model.localeCompare(b.model));
}
