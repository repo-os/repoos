/**
 * Orchestrates individual close-out jobs through their lifecycle. Each job:
 *   1. Validates the candidate away from live main (temporary worktree/branch)
 *   2. Checks for main SHA drift and rebuilds if needed
 *   3. Publishes only a green candidate while holding the repo lock
 *   4. Cleans up the candidate and task resources
 *
 * Phases track recovery: if interrupted mid-flight, retry resumes from the current phase.
 */

import { readFileSync, existsSync, symlinkSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { IntegrationJob, JobCoordinator } from "./integration-job.js";
import type { RepositoryLock, RootLock } from "./repo-lock.js";
import type { Logger } from "../core/logger.js";
import {
  currentBranch,
  runGit,
  worktreePathForBranch,
  ensureWorktree,
  removeWorktree,
  deleteBranch,
  isGitRepo,
  commitTaskFile,
  mergeBranch,
  dirtyFiles,
  getDiff,
  getDiffStats,
  GitDirtyCheckError,
} from "../core/git.js";
import type { DoneStep } from "./done.js";
import { redactSecrets, stripAnsi } from "./done.js";
import { markTaskReleased } from "./write.js";
import { saveDiffSnapshot } from "./diff-snapshot.js";

// Candidate branch prefix. Must be a valid git refname: a leading dot is
// rejected by git (`'.repoos/integrate/…' is not a valid branch name`), which
// silently failed every close-out job at worktree creation.
const CANDIDATE_BRANCH_PREFIX = "repoos/integrate/";

/** Shared literal for the failed job phase so recovery paths stay consistent. */
const PHASE_FAILED = "failed";

function candidateBranchName(taskId: string): string {
  return `${CANDIDATE_BRANCH_PREFIX}${taskId}`;
}

/**
 * Resolve the repository's actual default branch name.
 * Tries (in order):
 * 1. git symbolic-ref refs/remotes/origin/HEAD (when remote exists)
 * 2. git config --get init.defaultBranch
 * 3. currently checked-out branch
 * 4. fallback to "main"
 */
async function resolveDefaultBranch(root: string): Promise<string> {
  // Try remote HEAD first (most reliable for cloned repos)
  const remoteHeadRes = await runGit(root, ["symbolic-ref", "refs/remotes/origin/HEAD"], 4000);
  if (remoteHeadRes.status === 0) {
    // Output format: "ref: refs/remotes/origin/main" -> extract "main"
    const match = remoteHeadRes.stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  }

  // Try init.defaultBranch config
  const configRes = await runGit(root, ["config", "--get", "init.defaultBranch"], 4000);
  if (configRes.status === 0 && configRes.stdout.trim()) {
    return configRes.stdout.trim();
  }

  // Fall back to currently checked-out branch
  const currentRes = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"], 4000);
  if (currentRes.status === 0 && currentRes.stdout.trim() && currentRes.stdout.trim() !== "HEAD") {
    return currentRes.stdout.trim();
  }

  // Final fallback
  return "main";
}

// How much of a failed command's output to keep as the failure reason.
const TAIL_LINES = 15;
const TAIL_MAX_CHARS = 800;

/**
 * Locate a task's file directly on disk by id, independent of the live
 * index's freshness. Used only as a fallback when `getTask` misses — the
 * normal, common path is the index lookup, which is far cheaper than a
 * directory scan. Task ids are unique by filename convention (`<id>-*.md`).
 */
function findTaskFileById(root: string, workDir: string, taskId: string): string | null {
  const dir = join(root, workDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const match = entries.find((f) => f.startsWith(`${taskId}-`) && f.endsWith(".md"));
  return match ? join(dir, match) : null;
}

/**
 * The useful part of a failed command's combined output. bun/npm wrap a child
 * failure with a generic trailing line (`error: script "repoos" exited with
 * code 1`) that is useless as a reason on its own, so keep the last several
 * meaningful lines — the real cause (a failing test, a compiler error) sits
 * just above the wrapper.
 *
 * The reason is persisted to `.repoos/integration-jobs/<id>.json` and shown
 * verbatim in the UI, so it must be free of ANSI escapes (the gate's test
 * output is colored) and of anything that looks like a credential. When the
 * excerpt exceeds the character cap it is cut from the front at a WORD
 * boundary — cutting mid-word produced reasons like `check failed: …eletion
 * detected by…` (0215) that read as garbage.
 */
export function tailLine(stdout: string, stderr: string): string {
  const lines = redactSecrets(stripAnsi(`${stdout}\n${stderr}`))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "unknown error";
  let tail = lines.slice(-TAIL_LINES).join("\n");
  if (tail.length > TAIL_MAX_CHARS) {
    const cut = tail.length - TAIL_MAX_CHARS;
    const lastWs = Math.max(tail.lastIndexOf(" ", cut), tail.lastIndexOf("\n", cut));
    const start = lastWs >= 0 ? lastWs + 1 : cut;
    return `…${tail.slice(start)}`;
  }
  return tail;
}

/** Remove terminal control sequences before persisting a diagnostic to JSON/UI. */
const ANSI_ESCAPE_RE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

/**
 * Format command output for a close-out failure. Keep complete, readable tail
 * lines so a JSON-backed UI never receives terminal colours or a diagnostic
 * truncated in the middle of an ANSI escape sequence.
 */
export function summarizeCommandFailure(stdout: string, stderr: string): string {
  const lines = `${stdout}\n${stderr}`
    .replace(ANSI_ESCAPE_RE, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "unknown error";
  const tail: string[] = [];
  let length = 0;
  for (const line of lines.slice(-TAIL_LINES).reverse()) {
    const nextLength = length + (tail.length > 0 ? 1 : 0) + line.length;
    if (nextLength > TAIL_MAX_CHARS && tail.length > 0) break;
    tail.unshift(nextLength > TAIL_MAX_CHARS ? `…${line.slice(-(TAIL_MAX_CHARS - 1))}` : line);
    length = tail.join("\n").length;
  }
  return tail.join("\n");
}

interface ProcessRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

function runProcess(cmd: string, args: string[], opts: { cwd: string; timeout: number }): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    };

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", () => finish(null));
    child.on("close", (code: number | null) => finish(code));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeout);
  });
}

/** Candidate validation and publication orchestrator for one job. */
export class CloseOutOrchestrator {
  constructor(
    private config: RepoOSConfig,
    private coordinator: JobCoordinator,
    private repoLock?: RepositoryLock,
    private rootLock?: RootLock,
    private getTask?: (taskId: string) => Task | null,
    private onProgress?: (step: DoneStep) => void,
    private logger?: Logger,
  ) {}

  /**
   * Process the next job in the queue: validate and publish it.
   * Phases are atomic; a retry at any phase resumes from that phase.
   * May return early if the job transitions back to an earlier phase (e.g., on main drift).
   */
  async processNext(): Promise<{ ok: boolean; reason?: string; requiresRetry?: boolean }> {
    const job = this.coordinator.peekNext();
    if (!job) return { ok: true, reason: "queue empty" };

    return this.processJob(job);
  }

  private async processJob(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;

    this.logger?.integration(job.taskId, "info", `Processing job phase: ${job.phase}`, {
      taskId: job.taskId,
      phase: job.phase,
    });

    try {
      if (!isGitRepo(root)) {
        return { ok: false, reason: "not a git repository" };
      }

      // Transition from queued to syncing.
      if (job.phase === "queued") {
        const updated = this.coordinator.updateJob(job.taskId, {
          phase: "syncing",
          startedAt: new Date().toISOString(),
        });
        if (!updated) return { ok: false, reason: "job disappeared" };
        job = updated;
      }

      // Syncing phase: ensure the candidate worktree exists and is up to date with main.
      if (job.phase === "syncing") {
        const syncRes = await this.syncCandidate(job);
        if (!syncRes.ok) {
          this.logger?.integration(job.taskId, "error", "sync failed", { reason: syncRes.reason });
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            failedPhase: "syncing",
            reason: syncRes.reason,
          });
          return syncRes;
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "validating" })!;
      }

      // Validating phase: run the full gate (build, check) on the candidate.
      //
      // The gate is retried once before the job is failed (#0216). A false
      // failure here is expensive — the branch is green, but the task is
      // stranded in review and the user cannot tell contention from a real
      // regression. The retry also classifies the failure, which is the part
      // that actually helps: a genuine defect reproduces with the SAME reason
      // (Node-version-dependent breakage did exactly this on #0205, failing
      // identically twice), whereas load-induced failures land on a different
      // test each run (#0211 failed on two unrelated tests). Two attempts is
      // the cap — this must never loop.
      if (job.phase === "validating") {
        let validateRes = await this.validateCandidate(job);
        if (!validateRes.ok && validateRes.retryable === false) {
          // Deterministic by construction — a second run proves nothing and
          // costs the user another full gate cycle.
          this.logger?.integration(job.taskId, "error", "validation failed (non-retryable)", { reason: validateRes.reason });
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            failedPhase: "validating",
            reason: validateRes.reason,
          });
          return validateRes;
        }
        if (!validateRes.ok) {
          const firstReason = validateRes.reason ?? "unknown";
          validateRes = await this.validateCandidate(job);
          if (!validateRes.ok) {
            const secondReason = validateRes.reason ?? "unknown";
            const reason = firstReason === secondReason
              ? `${secondReason} — reproduced identically on retry, so this is a real failure in the branch, not machine load`
              : `${secondReason} — NOTE: the first attempt failed differently (${firstReason}). Two unrelated failures point at machine load or infrastructure rather than a regression in this branch; check for stray serve processes and retry.`;
            this.coordinator.updateJob(job.taskId, {
              phase: PHASE_FAILED,
              failedPhase: "validating",
              reason,
            });
            return { ok: false, reason };
          }
        }
        job = this.coordinator.updateJob(job.taskId, {
          phase: "publishing",
          candidateSha: validateRes.candidateSha,
        })!;
      }

      // Publishing phase: merge candidate to live main, holding the repo lock.
      if (job.phase === "publishing") {
        const pubRes = await this.publishCandidate(job);
        if (!pubRes.ok) {
          // Check if the job phase was changed by publishCandidate() (e.g., drift handling).
          // If it was moved back to "syncing" for retry, don't overwrite it to "failed".
          const currentJob = this.coordinator.getJob(job.taskId);
          if (currentJob && currentJob.phase === "syncing") {
            // Drift detected and handled - will retry on next processNext() call
            this.logger?.integration(job.taskId, "info", "main drifted during publish — resyncing", {
              reason: pubRes.reason,
            });
            return pubRes;
          }
          this.logger?.integration(job.taskId, "error", "publish failed", { reason: pubRes.reason });
          this.coordinator.updateJob(job.taskId, {
            phase: PHASE_FAILED,
            failedPhase: "publishing",
            reason: pubRes.reason,
          });
          return pubRes;
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "cleanup" })!;
      }

      // Cleanup phase: remove candidate worktree, delete candidate branch, remove task worktree.
      if (job.phase === "cleanup") {
        const cleanRes = await this.cleanup(job);
        if (!cleanRes.ok) {
          // Log but don't fail: the merge succeeded, so task is done even if cleanup is messy.
          this.logger?.integration(job.taskId, "warn", "cleanup warning", { reason: cleanRes.reason });
          console.warn(`Cleanup warning for task ${job.taskId}: ${cleanRes.reason}`);
        }
        job = this.coordinator.updateJob(job.taskId, { phase: "done" })!;
        this.logger?.integration(job.taskId, "info", "close-out complete — published to main");
      }

      return { ok: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown error";
      this.logger?.integration(job.taskId, "error", "orchestrator error", { reason });
      this.coordinator.updateJob(job.taskId, {
        phase: PHASE_FAILED,
        failedPhase: job.phase ?? "unknown",
        reason: `orchestrator error: ${reason}`,
      });
      return { ok: false, reason };
    }
  }

  private async syncCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string }> {
    this.onProgress?.("sync");
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);

    // Resolve the repository's actual default branch
    const mainBranch = await resolveDefaultBranch(root);

    // Record main SHA at validation start.
    const mainShaRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
    if (mainShaRes.status !== 0) {
      return { ok: false, reason: "could not get main SHA" };
    }
    const baseMainSha = mainShaRes.stdout.trim();

    this.coordinator.updateJob(job.taskId, { baseMainSha });

    // Ensure candidate worktree exists and is on main.
    const wtRes = ensureWorktree(root, branch, `candidate-${job.taskId}`);
    if (!wtRes.ok) {
      return { ok: false, reason: `could not create candidate worktree: ${wtRes.reason}` };
    }

    // A fresh candidate worktree has no dependencies, and the gate below runs a
    // full `bun run build` + check. Reuse the main checkout's node_modules via
    // a symlink instead of a slow cold install; fail-soft so a missing install
    // surfaces as a build/check error rather than a misleading sync failure.
    const candidateNodeModules = join(wtRes.path, "node_modules");
    if (!existsSync(candidateNodeModules)) {
      const rootNodeModules = join(root, "node_modules");
      if (existsSync(rootNodeModules)) {
        try {
          symlinkSync(rootNodeModules, candidateNodeModules, "dir");
        } catch {
          /* fail-soft: the build step will report the real error */
        }
      }
    }

    // Reset candidate to main so it's a clean base for the merge.
    const resetRes = await runGit(wtRes.path, ["reset", "--hard", mainBranch], 30_000);
    if (resetRes.status !== 0) {
      return { ok: false, reason: `could not reset candidate to main: ${resetRes.stderr}` };
    }

    // Validate and record the feature branch SHA.
    const taskBranch = job.branch ?? job.taskId;
    // Check if the feature branch exists (critical: avoid merging unrelated history)
    const taskWtPath = worktreePathForBranch(root, taskBranch);
    if (!taskWtPath) {
      return { ok: false, reason: `feature branch ${taskBranch} worktree not found` };
    }

    const branchShaRes = await runGit(taskWtPath, ["rev-parse", "HEAD"], 4000);
    if (branchShaRes.status !== 0) {
      return { ok: false, reason: "could not get feature branch SHA" };
    }

    this.coordinator.updateJob(job.taskId, { branchSha: branchShaRes.stdout.trim() });

    return { ok: true, candidateSha: baseMainSha };
  }

  /**
   * Merge the feature branch into the candidate, then run the gate on it.
   *
   * `retryable: false` marks a failure that cannot possibly resolve on a second
   * identical run — a merge conflict is the same conflict every time — so the
   * caller can skip its retry instead of spending another few minutes proving
   * the point. Everything else defaults to retryable: build and check failures
   * are where genuine flakiness lives.
   */
  private async validateCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string; candidateSha?: string; retryable?: boolean }> {
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);
    const wtPath = worktreePathForBranch(root, branch);
    if (!wtPath) {
      return { ok: false, reason: "candidate worktree not found" };
    }

    // Check for main SHA changes. If main advanced, discard candidate and rebuild.
    const mainBranch = await resolveDefaultBranch(root);
    const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
    if (currentMainRes.status !== 0) {
      return { ok: false, reason: "could not get current main SHA" };
    }
    const currentMainSha = currentMainRes.stdout.trim();

    if (job.baseMainSha && currentMainSha !== job.baseMainSha) {
      // Main advanced: discard candidate, rebuild from new SHA, and revalidate.
      removeWorktree(root, branch);
      this.coordinator.updateJob(job.taskId, {
        phase: "syncing",
        baseMainSha: null,
        candidateSha: null,
      });
      return this.syncCandidate(job);
    }

    // Merge feature branch into candidate.
    const featureBranch = job.branch ?? job.taskId;

    // Verify feature branch still exists before attempting merge
    const branchListRes = await runGit(root, ["branch", "--list", featureBranch], 4000);
    if (branchListRes.status !== 0 || !branchListRes.stdout.trim()) {
      return { ok: false, reason: `feature branch ${featureBranch} no longer exists` };
    }

    // In the candidate worktree, merge the feature branch from its location.
    // dist/ and screenshots/ are generated output — the build step right
    // after this merge (below) regenerates them from source regardless of
    // what the merge produced, so a conflict there must never block the
    // merge. The task's own doc file routinely differs between main and the
    // branch (status/review_rounds bookkeeping on either side), so its
    // branch version is taken as authoritative, same as the legacy done.ts
    // close-out path. Reuses the existing, tested autoResolve semantics in
    // core/git.ts rather than reimplementing conflict resolution here.
    //
    // dist/ is gitignored on main as of 2026-08-15 (see docs/dogfooding-vs-
    // general.md), so most new merges won't touch this entry at all — a
    // branch that never modified dist/ resolves as a clean deletion. It stays
    // in the list because a branch cut BEFORE that change can still have
    // dist/ tracked and modified; mergeBranch's `-X theirs` fallback already
    // handles that as a modify/delete conflict. Safe to drop once no such
    // branch remains, but harmless to leave indefinitely.
    const task = this.getTask?.(job.taskId);
    const autoResolve = ["dist/", "screenshots/", ...(task ? [relative(root, task.absPath)] : [])];
    this.onProgress?.("merge");
    const merge = await mergeBranch(wtPath, featureBranch, { autoResolve });
    if (!merge.merged) {
      // A conflict is a property of the two trees, not of the machine. Retrying
      // re-derives the identical conflict; the fix is always to merge main into
      // the feature branch and resolve it there (see docs/close-out-pipeline.md).
      return {
        ok: false,
        retryable: false,
        reason: merge.conflicts.length
          ? `merge conflict in ${merge.conflicts.join(", ")} — resolve it in the feature branch's own worktree (merge main into the branch), then retry`
          : merge.reason ?? "merge failed",
      };
    }

    // Check for merge conflict markers in text files (unresolved conflicts in content).
    const lsRes = await runGit(wtPath, ["ls-files"], 5000);
    if (lsRes.status === 0) {
      const files = lsRes.stdout.split("\n").filter(Boolean);
      const textExtensions = [".json", ".md", ".ts", ".tsx", ".js", ".jsx", ".css", ".html"];
      for (const file of files) {
        if (textExtensions.some((ext) => file.endsWith(ext))) {
          try {
            const content = readFileSync(join(wtPath, file), "utf8");
            // Check for git conflict markers: exactly 7 of each character at line start
            if (/^<{7}$|^={7}$|^>{7}$/m.test(content)) {
              return { ok: false, reason: `unresolved conflict markers in ${file}` };
            }
          } catch {
            /* skip unreadable files */
          }
        }
      }
    }

    // Run the post-merge gate: build + check via bun/npm.
    this.onProgress?.("build");
    let buildRes = await runProcess("bun", ["run", "build"], { cwd: wtPath, timeout: 300_000 });
    if (buildRes.status !== 0) {
      buildRes = await runProcess("npm", ["run", "build"], { cwd: wtPath, timeout: 300_000 });
    }
    if (buildRes.status !== 0) {
      return { ok: false, reason: `build failed: ${summarizeCommandFailure(buildRes.stdout, buildRes.stderr)}` };
    }

    this.onProgress?.("check");
    // The candidate's OWN freshly-built CLI comes first, same as the legacy
    // done.ts close-out gate (#0130): a globally linked `repoos` resolves
    // build freshness and gate code against its own install snapshot, which
    // can disagree with the checkout actually being validated here. Running
    // `check` via the candidate's own `dist/cli/index.js` guarantees the gate
    // evaluates the exact code that was just merged and built above.
    const localCli = join(wtPath, "dist", "cli", "index.js");
    let checkRes = existsSync(localCli)
      ? await runProcess(process.execPath, [localCli, "check"], { cwd: wtPath, timeout: 600_000 })
      : { status: 1, stdout: "", stderr: "candidate dist/cli/index.js missing" };
    if (checkRes.status !== 0) {
      checkRes = await runProcess("repoos", ["check"], { cwd: wtPath, timeout: 600_000 });
    }
    if (checkRes.status !== 0) {
      checkRes = await runProcess("bun", ["run", "repoos", "check"], { cwd: wtPath, timeout: 600_000 });
    }
    if (checkRes.status !== 0) {
      return { ok: false, reason: `check failed: ${summarizeCommandFailure(checkRes.stdout, checkRes.stderr)}` };
    }

    // Candidate is green. Capture its SHA.
    const candidateShaRes = await runGit(wtPath, ["rev-parse", "HEAD"], 4000);
    if (candidateShaRes.status !== 0) {
      return { ok: false, reason: "could not get candidate SHA after validation" };
    }

    // Capture the reviewable source diff before publication removes the task
    // branch/worktree. The candidate is based on the exact main SHA checked
    // above and contains the validated feature merge, so this records the
    // precise change that is about to land (not a later, polluted main diff).
    const snapshotDiff = await getDiff(wtPath, mainBranch);
    const snapshotStats = getDiffStats(wtPath, mainBranch);
    saveDiffSnapshot(root, this.config.cacheDir, job.taskId, snapshotStats, snapshotDiff);

    return { ok: true, candidateSha: candidateShaRes.stdout.trim() };
  }

  private async publishCandidate(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;
    const mainBranch = await resolveDefaultBranch(root);

    const branch = candidateBranchName(job.taskId);
    const wtPath = worktreePathForBranch(root, branch);
    if (!wtPath) {
      return { ok: false, reason: "candidate worktree missing at publish time" };
    }

    // Acquire the repository lock before publishing.
    if (this.repoLock) {
      let acquireAttempts = 0;
      while (!this.repoLock.acquire(job.taskId) && acquireAttempts < 60) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        acquireAttempts++;
      }
      if (acquireAttempts >= 60) {
        return { ok: false, reason: "could not acquire publication lock (timeout)" };
      }
    }

    // Publishing mutates the live checkout.  It must therefore mutually
    // exclude a hotfix, which also owns that checkout for its entire run.
    // Acquire after the publication lock so concurrent close-outs retain
    // their existing serialization, but before inspecting or merging main.
    if (this.rootLock && !this.rootLock.acquire(job.taskId, "close-out")) {
      const holder = this.rootLock.getHolder();
      this.repoLock?.release(job.taskId);
      return {
        ok: false,
        reason: `main checkout is held by ${holder?.kind ?? "another operation"} (task #${holder?.taskId ?? "unknown"}); wait for it to finish before moving this task to done`,
      };
    }

    try {
      // Final SHA check: ensure candidate is still based on current main (holding the lock).
      const currentMainRes = await runGit(root, ["rev-parse", `${mainBranch}^{commit}`], 4000);
      if (currentMainRes.status !== 0) {
        return { ok: false, reason: "could not verify main before publish" };
      }
      const currentMainSha = currentMainRes.stdout.trim();

      if (job.baseMainSha !== currentMainSha) {
        // Main advanced between validation and publishing: go back to syncing.
        removeWorktree(root, branch);
        this.coordinator.updateJob(job.taskId, {
          phase: "syncing",
          baseMainSha: null,
          candidateSha: null,
        });
        return { ok: false, reason: "main advanced, revalidating" };
      }

      // Publish-time dirty-main guard (#0211): the main working tree can be
      // dirtied between enqueue and publish (validation runs minutes-long
      // builds in the candidate worktree while `repoos check` regenerates a
      // dirty `dist/` on main). Re-check right before the merge so a dirty
      // main is surfaced as an actionable message instead of git's raw
      // "your local changes would be overwritten" at the tail of a long job.
      // Fails closed: an error/timeout in the check is "unknown", never
      // "clean", so we never merge blindly.
      let dirtyOnMain: string[];
      try {
        dirtyOnMain = await dirtyFiles(root);
      } catch (err) {
        if (err instanceof GitDirtyCheckError) {
          return {
            ok: false,
            reason: `could not verify main is clean at publish time (${err.message}). The candidate was NOT merged; retry, or commit/stash main's working tree first.`,
          };
        }
        throw err;
      }
      if (dirtyOnMain.length > 0) {
        return {
          ok: false,
          reason: `main has ${dirtyOnMain.length} uncommitted file${dirtyOnMain.length === 1 ? "" : "s"} at publish time, so the merge would abort: ${dirtyOnMain.slice(0, 8).join(", ")}${dirtyOnMain.length > 8 ? ", …" : ""}. The candidate was NOT merged; commit or stash those on main (or use "Commit & continue") and retry.`,
        };
      }

      // Merge candidate to live main using FF when possible.
      const mergeRes = await runGit(root, ["merge", "--ff-only", branch], 30_000);
      if (mergeRes.status !== 0) {
        // Try a regular merge if FF is not possible.
        const regularMerge = await runGit(root, ["merge", "--no-edit", branch], 30_000);
        if (regularMerge.status !== 0) {
          // A dirty main that slipped in between the check and the merge (or a
          // conflict) aborts with git's raw "would be overwritten" message.
          // Re-frame a dirty-main outcome as an actionable instruction rather
          // than dumping that raw stderr.
          if (/would be overwritten by merge/i.test(regularMerge.stderr)) {
            const blocking = regularMerge.stderr
              .split("\n")
              .filter((l) => l.startsWith("\t"))
              .map((l) => l.trim())
              .filter(Boolean);
            return {
              ok: false,
              reason: `main has uncommitted files blocking the merge${blocking.length ? `: ${blocking.slice(0, 8).join(", ")}${blocking.length > 8 ? ", …" : ""}` : ""}. The candidate was NOT merged; commit or stash those on main (or use "Commit & continue") and retry.`,
            };
          }
          return { ok: false, reason: `could not merge to main: ${regularMerge.stderr}` };
        }
      }

      this.onProgress?.("done");
      return { ok: true };
    } finally {
      this.rootLock?.release(job.taskId);
      // Always release the lock when done publishing.
      if (this.repoLock) {
        this.repoLock.release(job.taskId);
      }
    }
  }

  private async cleanup(job: IntegrationJob): Promise<{ ok: boolean; reason?: string }> {
    const root = this.config.root;
    const branch = candidateBranchName(job.taskId);

    // Remove candidate worktree.
    removeWorktree(root, branch);

    // Delete candidate branch.
    deleteBranch(root, branch);

    // Remove task's feature worktree (if it still exists).
    removeWorktree(root, job.branch ?? job.taskId);

    // Delete task's feature branch.
    deleteBranch(root, job.branch ?? job.taskId);

    // Mark the task as done in the main checkout.
    //
    // The live index can miss a lookup right after a reload (its in-memory
    // rebuild is not instant, and this cleanup step can land in that window —
    // observed live, 2026-08-15, #0195: publish succeeded, main fast-forwarded
    // to the candidate, but this step silently no-op'd — `task` was undefined,
    // the `if (task)` guard skipped markTaskReleased with no error, and the
    // task sat published-but-not-released until a manual retry). Falling back
    // to a direct on-disk lookup by id makes this step independent of index
    // freshness — the file is exactly what markTaskReleased writes to anyway.
    try {
      const absPath = this.getTask?.(job.taskId)?.absPath ?? findTaskFileById(root, this.config.workDir, job.taskId);
      if (absPath) {
        markTaskReleased(this.config, absPath);
      } else {
        console.error(`Could not locate task ${job.taskId} on disk to mark it released — publish succeeded but release marking was skipped`);
      }
    } catch (err) {
      console.error(`Failed to mark task ${job.taskId} as done:`, err);
      // Don't fail cleanup - the important part (merge) already succeeded
    }

    return { ok: true };
  }
}
