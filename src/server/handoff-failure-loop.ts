/**
 * Break the watchdog → handoff validation → fail → active loop (#0693).
 *
 * When the same check failure repeats on an unchanged branch tip, re-running
 * `repoos check` cannot help until an engineer changes the tree. This module
 * fingerprints failures, caps identical repeats, skips redundant validation,
 * and offers one bounded engineer restart with the failure text.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { RepoOSConfig, Task } from "../core/types.js";
import { commitTaskFile, worktreePathForBranch } from "../core/git.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import { parseTask, recordChange, serializeTask } from "../core/task.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";

/** Default cap on identical consecutive handoff validation failures. */
export const MAX_IDENTICAL_HANDOFF_VALIDATION_FAILURES = 3;

const HANDOFF_FAILED_ACTIVITY = /handoff failed · /;

/** Activity marker: engineer restarted once for an identical check failure. */
export const ENGINEER_RESTARTED_AFTER_CHECK_FAILURE =
  /watchdog: restarted engineer after identical check failure/;

/** needsInputReason written when the cap is reached. */
export const IDENTICAL_HANDOFF_FAILURES_REASON = "identical-handoff-failures";

export interface HandoffFailureRecord {
  /** Normalized `step|detail` fingerprint. */
  fingerprint: string;
  step: string;
  detail: string;
  rawReason: string;
}

/** Collapse whitespace so cosmetic differences do not break matching. */
export function normalizeHandoffFailureDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim();
}

export function handoffFailureFingerprint(step: string, detail: string): string {
  return `${step}|${normalizeHandoffFailureDetail(detail)}`;
}

/**
 * Parse the structured part of a persisted `handoff failed · …` activity reason.
 * Accepts both server finalization (`… handoff failed at check · detail`) and
 * legacy shapes that only carry free text.
 */
export function parseHandoffFailureReason(reason: string): HandoffFailureRecord | null {
  const atStep = reason.match(/handoff failed at (\w+) · (.+)$/i);
  if (atStep) {
    const step = atStep[1].toLowerCase();
    const detail = atStep[2].trim();
    return {
      step,
      detail,
      rawReason: reason,
      fingerprint: handoffFailureFingerprint(step, detail),
    };
  }
  if (/repoos check failed/i.test(reason) || /^check failed/i.test(reason)) {
    const detail = reason.trim();
    return {
      step: "check",
      detail,
      rawReason: reason,
      fingerprint: handoffFailureFingerprint("check", detail),
    };
  }
  return null;
}

/** Most recent handoff-failure record in the Activity log, if any. */
export function lastHandoffFailureFromBody(body: string): HandoffFailureRecord | null {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return null;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i];
    const match = line.match(/^- \d{4}-\d{2}-\d{2}T\S+ · handoff failed · (.+)$/);
    if (!match) continue;
    return parseHandoffFailureReason(match[1].trim());
  }
  return null;
}

/**
 * Count how many of the most recent consecutive `handoff failed` entries share
 * the same fingerprint (same failing step and error text).
 */
export function countTrailingIdenticalHandoffFailures(body: string): number {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return 0;
  let expected: string | null = null;
  let count = 0;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i];
    const match = line.match(/^- \d{4}-\d{2}-\d{2}T\S+ · handoff failed · (.+)$/);
    if (!match) {
      if (count > 0) break;
      continue;
    }
    const parsed = parseHandoffFailureReason(match[1].trim());
    if (!parsed) break;
    if (expected === null) expected = parsed.fingerprint;
    if (parsed.fingerprint !== expected) break;
    count++;
  }
  return count;
}

export function readTaskBranchHead(config: RepoOSConfig, task: Task): string | null {
  if (!task.branch) return null;
  const workdir = worktreePathForBranch(config.root, task.branch);
  if (!workdir) return null;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workdir,
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

export function storedHandoffFailureSha(task: Task): string | null {
  const sha = task.extra?.last_handoff_failure_sha;
  return typeof sha === "string" && sha.trim() ? sha.trim() : null;
}

export function branchUnchangedSinceLastHandoffFailure(task: Task, head: string | null): boolean {
  if (!head) return false;
  const stored = storedHandoffFailureSha(task);
  return stored !== null && stored === head;
}

export interface HandoffFailureLoopState {
  lastFailure: HandoffFailureRecord | null;
  identicalCount: number;
  branchUnchanged: boolean;
  atCap: boolean;
  lastFailureIsCheck: boolean;
}

export function assessHandoffFailureLoop(
  task: Task,
  head: string | null,
): HandoffFailureLoopState {
  const lastFailure = lastHandoffFailureFromBody(task.body);
  const identicalCount = countTrailingIdenticalHandoffFailures(task.body);
  const branchUnchanged = branchUnchangedSinceLastHandoffFailure(task, head);
  const atCap = identicalCount >= MAX_IDENTICAL_HANDOFF_VALIDATION_FAILURES;
  const lastFailureIsCheck = lastFailure?.step === "check";
  return {
    lastFailure,
    identicalCount,
    branchUnchanged,
    atCap,
    lastFailureIsCheck,
  };
}

/** True when another expensive handoff validation run would only repeat a known failure. */
export function shouldSkipHandoffValidationForUnchangedTree(
  task: Task,
  head: string | null,
): boolean {
  const state = assessHandoffFailureLoop(task, head);
  if (!state.lastFailureIsCheck || !state.branchUnchanged) return false;
  return state.identicalCount >= 1;
}

export function shouldParkForIdenticalHandoffFailures(
  task: Task,
  head: string | null,
): boolean {
  const state = assessHandoffFailureLoop(task, head);
  return state.atCap && state.branchUnchanged && state.lastFailureIsCheck;
}

/** Scoped to the current `status →active` episode (same pattern as `alreadySurfaced`). */
export function alreadyRestartedEngineerForCheckFailure(body: string): boolean {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return false;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i];
    if (ENGINEER_RESTARTED_AFTER_CHECK_FAILURE.test(line)) return true;
    if (/^- \d{4}-\d{2}-\d{2}T\S+ · status [a-z_]+→active\b/.test(line)) return false;
  }
  return false;
}

export function persistHandoffFailureLoopMetadata(
  config: RepoOSConfig,
  task: Task,
  head: string | null,
  failure: HandoffFailureRecord,
  onFileChange?: (absPath: string) => void,
): void {
  try {
    const raw = readFileSync(task.absPath, "utf8");
    const doc = parseDocument(raw);
    if (head) doc.data.last_handoff_failure_sha = head;
    doc.data.last_handoff_failure_fingerprint = failure.fingerprint;
    const keys = Object.keys(doc.data).filter(
      (k) => k !== "last_handoff_failure_sha" && k !== "last_handoff_failure_fingerprint",
    );
    keys.unshift("last_handoff_failure_fingerprint", "last_handoff_failure_sha");
    writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
    commitTaskFile(config.root, task.absPath, `docs(${task.id}): record handoff failure metadata`);
    onFileChange?.(task.absPath);
  } catch (err) {
    console.error(
      `[repoos] could not persist handoff failure metadata for #${task.id}: ${(err as Error).message}`,
    );
  }
}

export function clearHandoffFailureLoopMetadata(
  config: RepoOSConfig,
  task: Task,
): void {
  try {
    const raw = readFileSync(task.absPath, "utf8");
    const doc = parseDocument(raw);
    if (!("last_handoff_failure_sha" in doc.data) && !("last_handoff_failure_fingerprint" in doc.data)) {
      return;
    }
    delete doc.data.last_handoff_failure_sha;
    delete doc.data.last_handoff_failure_fingerprint;
    const keys = Object.keys(doc.data);
    writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
    commitTaskFile(config.root, task.absPath, `docs(${task.id}): clear handoff failure metadata`);
  } catch {
    /* best-effort */
  }
}

export function parkTaskForIdenticalHandoffFailures(
  config: RepoOSConfig,
  task: Task,
  failureDetail: string,
  onFileChange?: (absPath: string) => void,
): void {
  const current = parseTask({
    content: readFileSync(task.absPath, "utf8"),
    absPath: task.absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
  if (current.needsInput && current.needsInputReason === IDENTICAL_HANDOFF_FAILURES_REASON) return;
  const note = `watchdog: parked after ${MAX_IDENTICAL_HANDOFF_VALIDATION_FAILURES} identical handoff validation failures · ${failureDetail}`;
  current.needsInput = true;
  current.needsInputReason = IDENTICAL_HANDOFF_FAILURES_REASON;
  recordChange(current, note);
  writeFileSync(task.absPath, serializeTask(current));
  commitTaskFile(config.root, current.absPath, `docs(${current.id}): park identical handoff failures`);
  onFileChange?.(current.absPath);
}

/**
 * Restart the engineer once with the last check failure text. Returns true when
 * a restart was scheduled (caller should not surface / re-validate).
 */
export function scheduleIdenticalCheckFailureEngineerRestart(
  config: RepoOSConfig,
  task: Task,
  failure: HandoffFailureRecord,
  runner: AgentRunner,
  onFileChange?: (absPath: string) => void,
): boolean {
  if (alreadyRestartedEngineerForCheckFailure(task.body)) return false;
  const engineer = resolveAgentForTask(config, task);
  if (!engineer) return false;

  const note =
    "watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation";
  try {
    const current = parseTask({
      content: readFileSync(task.absPath, "utf8"),
      absPath: task.absPath,
      root: config.root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    recordChange(current, note);
    writeFileSync(task.absPath, serializeTask(current));
    commitTaskFile(config.root, current.absPath, `docs(${current.id}): record engineer restart`);
    onFileChange?.(current.absPath);
  } catch (err) {
    console.error(
      `[repoos] could not record engineer restart for #${task.id}: ${(err as Error).message}`,
    );
    return false;
  }

  const workdir = task.branch
    ? (worktreePathForBranch(config.root, task.branch) ?? config.root)
    : config.root;
  const message = [
    "Automatic recovery: the server already recorded this exact handoff check failure on the current branch tip, so it will not re-run validation until the branch changes.",
    "",
    "Previous failure:",
    "",
    failure.detail,
    "",
    "Fix the failure, run `repoos check`, then hand off again.",
  ].join("\n");
  const hasSession = runner.output(task.id) !== null;
  const sent = hasSession
    ? runner.send(task.id, message, engineer, { skipBoardDivergence: true, cwd: workdir })
    : task.branch
      ? runner.start(task, task.branch, engineer, { cwd: workdir, resumePreamble: message })
      : { ok: false as const, reason: "task has no branch" };
  if (!sent.ok) {
    runner.system(
      task.id,
      `✗ could not restart engineer after identical check failure: ${sent.reason ?? "unknown error"}`,
    );
    return false;
  }
  runner.system(task.id, "↻ restarted engineer with the last identical check failure");
  return true;
}

/** Whether the Activity log shows any persisted handoff failure at all. */
export function bodyHasHandoffFailureActivity(body: string): boolean {
  return HANDOFF_FAILED_ACTIVITY.test(body);
}
