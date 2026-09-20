/**
 * A durable record of the most recent `repoos check` run (#0447).
 *
 * The engine's step results already exist in memory during a run, but a Checks
 * surface in the UI has to show "last result, duration, command output" long
 * after the process that produced them exited — and a server restart clears
 * anything session-scoped. So the CLI writes the run here, next to the task
 * index cache, and the server reads it back. Nothing here executes a check or
 * judges the plan: it is a store for what the engine already reported.
 *
 * The file is deliberately small and gitignored (it lives under `cacheDir`):
 * per-step output is capped, and the whole record is rewritten atomically so a
 * reader never sees a half-written file.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PlanSource } from "./check-plan.js";
import type { StepStatus } from "./check-runner.js";

/** Directory (under `cacheDir`) holding the last-run record. */
const RESULTS_DIR = "check-results";
const RESULTS_FILE = "latest.json";

/** Max captured output per step in the stored record (256 KiB). */
const MAX_OUTPUT = 256 * 1024;

/** One step's outcome, as persisted. Mirrors `StepRunResult` minus bulk. */
export interface StoredStepResult {
  name: string;
  status: StepStatus;
  command?: string;
  cwd?: string;
  durationMs: number;
  output?: string;
  detail?: string;
  required: boolean;
}

/** The last completed `repoos check` run. */
export interface CheckRunRecord {
  /** Profile the run selected. */
  profile: string;
  /** Where the resolved plan came from at run time. */
  source: PlanSource;
  /** Git ref when the run was a changed-path pass. */
  changedRef?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** True when every required step passed or was explicitly skipped. */
  passed: boolean;
  results: StoredStepResult[];
}

/** Absolute path to the last-run record. */
export function checkResultsPath(root: string, cacheDir = ".repoos"): string {
  return join(root, cacheDir, RESULTS_DIR, RESULTS_FILE);
}

function clipOutput(output: string | undefined): string | undefined {
  if (!output || !output.trim()) return undefined;
  return output.length > MAX_OUTPUT ? output.slice(0, MAX_OUTPUT) : output;
}

/**
 * Persist a completed run. Fail-soft by design: a read-only checkout or a
 * vanished cache dir must never fail an otherwise-green `repoos check` — the
 * record is for visibility, not for the gate.
 */
export function writeCheckRun(root: string, record: CheckRunRecord, cacheDir = ".repoos"): void {
  const path = checkResultsPath(root, cacheDir);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  } catch {
    /* visibility only — never fail the gate on a store write */
  }
}

/** Read the last completed run, or null when there is none / it is unreadable. */
export function readCheckRun(root: string, cacheDir = ".repoos"): CheckRunRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(checkResultsPath(root, cacheDir), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as CheckRunRecord;
    if (!Array.isArray(rec.results) || typeof rec.profile !== "string") return null;
    rec.results = rec.results.map((r) => ({
      name: String(r.name ?? ""),
      status: r.status,
      command: r.command,
      cwd: r.cwd,
      durationMs: Number(r.durationMs) || 0,
      output: clipOutput(r.output),
      detail: r.detail,
      required: r.required !== false,
    }));
    return rec;
  } catch {
    return null;
  }
}
