/**
 * Release a branch-less task directly, skipping the branch-merge close-out
 * pipeline entirely.
 *
 * A task fixed by a direct commit on `main` (a hotfix — see #0212, not yet a
 * first-class flow) has nothing to merge: its code is already on `main`.
 * Routing it through the normal `/done` pipeline dead-ends on "no branch to
 * merge" — not because the task isn't done, but because that pipeline is
 * built entirely around merging a branch. This is the separate path: verify
 * `main` is currently green, then release directly via `markTaskReleased`.
 *
 * Never touches the job queue or the repository lock — there is no merge to
 * serialize against other close-outs, so those mechanisms don't apply.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { terminateProcessGroupAndWait } from "../core/process-group.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { loadConfig } from "../core/config.js";
import { spawnedRepoosCheckArgs } from "./pre-review-remote-gate.js";
import { markTaskReleased } from "./write.js";

export interface CheckResult {
  ok: boolean;
  /** Tail of combined stdout+stderr on failure, for the caller to surface. */
  output?: string;
}

interface CandidateResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Only a missing executable justifies trying another CLI candidate. */
  missingExecutable: boolean;
  timedOut?: boolean;
}

type RunCandidate = (
  cmd: string,
  args: string[],
  root: string,
  timeoutMs: number,
) => Promise<CandidateResult>;

const MAX_CHECK_OUTPUT_BYTES = 10 * 1024 * 1024;

export function branchlessReleaseTimeoutMs(_config: RepoOSConfig): number {
  // A branch-less CLI release runs synchronously on main. It has no merge job
  // to retry, and a timeout used to leave the check tree alive while refusing
  // the release. Let the full check finish; individual checks still report
  // real failures and explicit cancellation remains available to the caller.
  return 0;
}

function runCandidate(
  cmd: string,
  args: string[],
  root: string,
  timeoutMs: number,
): Promise<CandidateResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: root,
      detached: process.platform !== "win32",
      env: { ...process.env, REPOOS_CHECK_NO_TIMEOUTS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let settled = false;
    let termination: Promise<void> | null = null;
    const append = (chunks: Buffer[], chunk: Buffer): void => {
      chunks.push(chunk);
      outputBytes += chunk.length;
      while (outputBytes > MAX_CHECK_OUTPUT_BYTES && (stdout.length || stderr.length)) {
        const oldest = stdout.length ? stdout.shift()! : stderr.shift()!;
        outputBytes -= oldest.length;
      }
    };
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk));
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            if (child.pid) termination = terminateProcessGroupAndWait(child.pid);
          }, timeoutMs)
        : undefined;
    timer?.unref?.();
    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        status: timedOut ? null : status,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: [Buffer.concat(stderr).toString("utf8"), spawnError?.message]
          .filter(Boolean)
          .join("\n"),
        missingExecutable: spawnError?.code === "ENOENT",
        timedOut,
      });
    };
    child.once("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      finish(null);
    });
    child.once("close", (code) => {
      void (termination ?? Promise.resolve()).then(() => finish(code));
    });
  });
}

/** Retry another executable only when spawning the candidate failed. Never
 * rerun a full check after a real check failure or timeout. */
export async function runCheckCandidates(
  candidates: string[][],
  root: string,
  execute: RunCandidate = runCandidate,
  timeoutMs = 0,
): Promise<CheckResult> {
  let last: CandidateResult | null = null;
  for (const [cmd, ...args] of candidates) {
    const result = await execute(cmd!, args, root, timeoutMs);
    last = result;
    if (result.timedOut) break;
    if (result.status === 0) return { ok: true };
    if (!result.missingExecutable) break;
  }
  const output = [last?.stdout, last?.stderr]
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .join("\n")
    .trim()
    .split("\n")
    .slice(-15)
    .join("\n");
  const timeoutDetail = last?.timedOut ? `check command timed out after ${timeoutMs}ms` : "";
  return {
    ok: false,
    output: [timeoutDetail, output || "no output captured"].filter(Boolean).join("\n"),
  };
}

/** Real check runner: prefers the local build's own CLI, same preference order as the close-out pipeline. */
export async function runCheckOnRoot(root: string): Promise<CheckResult> {
  const cfg = loadConfig(root);
  const checkArgs = spawnedRepoosCheckArgs(cfg, { kind: "skip" });
  const localCli = join(root, "dist", "cli", "index.js");
  const candidates: string[][] = existsSync(localCli)
    ? [
        [process.execPath, localCli, "check", ...checkArgs],
        ["repoos", "check", ...checkArgs],
      ]
    : [
        ["repoos", "check", ...checkArgs],
        ["bun", "run", "repoos", "check", ...checkArgs],
      ];
  return runCheckCandidates(candidates, root, runCandidate, branchlessReleaseTimeoutMs(cfg));
}

export interface ReleaseBranchlessResult {
  ok: boolean;
  reason?: string;
  task?: Task;
}

/**
 * A task is eligible for this path when it has no branch and isn't already
 * done. `review`-status is deliberately excluded even if branchless — that
 * shape shouldn't occur (nothing sets `review` without a branch), and if it
 * ever does, the normal `/done` merge path's own guard is the one that
 * should reject it, not this one silently swallowing it.
 */
export function isBranchlessReleaseEligible(task: Task): boolean {
  return !task.branch && task.status !== "done" && task.status !== "review";
}

export async function releaseBranchless(
  config: RepoOSConfig,
  task: Task,
  runCheck: (root: string) => CheckResult | Promise<CheckResult> = runCheckOnRoot,
): Promise<ReleaseBranchlessResult> {
  const check = await runCheck(config.root);
  if (!check.ok) {
    return {
      ok: false,
      reason: `repoos check failed on main — cannot release a branch-less task until main is green: ${check.output ?? ""}`,
    };
  }
  const task_ = await markTaskReleased(config, task.absPath);
  return { ok: true, task: task_ };
}
