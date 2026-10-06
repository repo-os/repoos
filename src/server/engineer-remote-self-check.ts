/**
 * Engineer self-check on remote runners (#0694).
 *
 * Managed engineers run `repoos check` from a task worktree. When
 * `remoteValidation.engineerSelfCheckRemote` is on (default with remote
 * validation), the expensive install + build + test half runs on the board's
 * runner using the main checkout's provider state — so Hetzner's warm VM is
 * owned by the server, not a stray CLI in the worktree. Fast guards stay local.
 * A green remote pass at the same HEAD can be reused at handoff.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CheckRunRow } from "../core/check-store.js";
import { getCheckStore } from "../core/check-store.js";
import { loadConfig } from "../core/config.js";
import { mainCheckoutRoot, runGit, uncommittedWorkFiles, workFileFilter } from "../core/git.js";
import { patchTaskFile } from "./write.js";
import type { RepoOSConfig } from "../core/types.js";
import { parseTask, recordChange } from "../core/task.js";
import type { RemotePreReviewOutcome } from "./pre-review-remote-gate.js";
import { runRemotePreReviewGate } from "./pre-review-remote-gate.js";
import type { RemoteValidator } from "./remote-validation.js";
import { createRemoteValidator } from "./remote-validation.js";
import { Logger } from "../core/logger.js";

/** Default on when remote validation is enabled (#0694). */
export function engineerSelfCheckRemoteEnabled(config: RepoOSConfig): boolean {
  const rv = config.remoteValidation;
  if (!rv?.enabled) return false;
  return rv.engineerSelfCheckRemote !== false;
}

/** Board root for runner state / check history — never the task worktree alone. */
export function boardRootForEngineerRemote(worktreeRoot: string): string {
  const envRoot = process.env.REPOOS_CHECK_STORE_ROOT?.trim();
  return envRoot || mainCheckoutRoot(worktreeRoot);
}

/** Board task file path for a numeric task id (fail-soft → undefined). */
export function boardTaskAbsPath(boardConfig: RepoOSConfig, taskId: string): string | undefined {
  try {
    const dir = join(boardConfig.root, boardConfig.workDir);
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${taskId}-`) && name.endsWith(".md")) {
        return join(dir, name);
      }
    }
  } catch {
    /* missing work dir */
  }
  return undefined;
}

/** Managed agent turn running `repoos check` in a task worktree. */
export function isManagedEngineerCheck(env: NodeJS.ProcessEnv): boolean {
  return env.REPOOS_AGENT === "1" && /^\d+$/.test(env.REPOOS_TASK_ID?.trim() ?? "");
}

/** Config + logger for the board-owned runner instance. */
export function createBoardRemoteValidator(
  worktreeRoot: string,
  worktreeConfig: RepoOSConfig,
): RemoteValidator | undefined {
  const boardRoot = boardRootForEngineerRemote(worktreeRoot);
  const boardCfg = loadConfig(boardRoot);
  return createRemoteValidator(
    { ...boardCfg, root: boardRoot, cacheDir: worktreeConfig.cacheDir },
    new Logger({ root: boardRoot }),
  );
}

/**
 * Commit uncommitted task work so a bundle of HEAD matches what the engineer
 * is editing (#0512). Returns null on success or an error detail.
 */
export async function commitWipCheckpointForRemoteGate(
  worktreePath: string,
  config: RepoOSConfig,
  taskId: string,
): Promise<string | null> {
  let dirty: string[];
  try {
    dirty = await uncommittedWorkFiles(worktreePath, workFileFilter(config));
  } catch {
    return "could not read git status before remote self-check";
  }
  if (dirty.length === 0) return null;
  for (const path of dirty) {
    const add = await runGit(worktreePath, ["add", "--", path], 60_000);
    if (add.status !== 0) {
      return `could not stage ${path} for remote self-check`;
    }
  }
  const msg = `WIP: engineer self-check checkpoint (#${taskId})`;
  const commit = await runGit(worktreePath, ["commit", "-m", msg], 120_000);
  if (commit.status !== 0) {
    return commit.stderr.trim() || "WIP checkpoint commit failed";
  }
  return null;
}

export function formatSelfCheckDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "?";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export async function appendEngineerSelfCheckActivity(
  boardConfig: RepoOSConfig,
  taskAbsPath: string,
  entry: string,
): Promise<void> {
  try {
    const task = parseTask({
      content: readFileSync(taskAbsPath, "utf8"),
      absPath: taskAbsPath,
      root: boardConfig.root,
      defaultStatus: boardConfig.defaultStatus,
      defaultAssignee: boardConfig.defaultAssignee,
    });
    recordChange(task, entry);
    patchTaskFile(boardConfig, taskAbsPath, { body: task.body });
  } catch {
    /* observability only */
  }
}

/** Latest green remote pre-review run for this task at exactly this HEAD (#0694). */
export function findReusableRemotePreReviewPass(
  boardRoot: string,
  cacheDir: string,
  opts: { taskId: string; candidateSha: string },
): CheckRunRow | null {
  try {
    const rows = getCheckStore(boardRoot, cacheDir).list({
      taskId: opts.taskId,
      remote: true,
      limit: 50,
    });
    return (
      rows.find(
        (r) =>
          r.outcome === "pass" &&
          r.candidateSha === opts.candidateSha &&
          (r.phase === "pre-review" || r.phase === "cli") &&
          (r.scope ?? "full") === "full",
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Handoff path: skip a second remote run when the engineer already got green at
 * this HEAD on a runner.
 */
export function remoteOutcomeFromReuse(row: CheckRunRow): RemotePreReviewOutcome {
  const host = row.machine ?? "runner";
  const dur = formatSelfCheckDuration(row.durationMs);
  return {
    kind: "local-only",
    skipTests: true,
    detail: `reusing green remote self-check on ${host} (${dur}) — same HEAD, skipping duplicate runner pass`,
  };
}

export async function runEngineerRemoteSelfCheckGate(params: {
  worktreeConfig: RepoOSConfig;
  worktreePath: string;
  taskId: string;
  taskAbsPath?: string;
  changedRef?: string;
  onChunk?: (chunk: string) => void;
}): Promise<RemotePreReviewOutcome> {
  const boardRoot = boardRootForEngineerRemote(params.worktreePath);
  const remoteValidator = createBoardRemoteValidator(params.worktreePath, params.worktreeConfig);
  if (!remoteValidator) {
    return {
      kind: "fail",
      retryable: false,
      detail: "remote validation is not enabled",
    };
  }
  const boardCfg = loadConfig(boardRoot);
  const prevStore = process.env.REPOOS_CHECK_STORE_ROOT;
  process.env.REPOOS_CHECK_STORE_ROOT = boardRoot;
  const startedAt = Date.now();
  try {
    const gate = await runRemotePreReviewGate({
      config: boardCfg,
      remoteValidator,
      worktreePath: params.worktreePath,
      taskId: params.taskId,
      phase: "pre-review",
      changedRef: params.changedRef,
      onChunk: params.onChunk,
    });
    await remoteValidator.dispose().catch(() => {});
    if (gate.kind === "local-only" && gate.skipTests && params.taskAbsPath) {
      const headRes = await runGit(params.worktreePath, ["rev-parse", "HEAD"], 10_000);
      const candidateSha = headRes.status === 0 ? headRes.stdout.trim() : "";
      const row = candidateSha
        ? findReusableRemotePreReviewPass(boardRoot, boardCfg.cacheDir, {
            taskId: params.taskId,
            candidateSha,
          })
        : null;
      const machine = row?.machine ?? "remote host";
      const dur = formatSelfCheckDuration(row?.durationMs ?? Date.now() - startedAt);
      void appendEngineerSelfCheckActivity(
        boardCfg,
        params.taskAbsPath,
        `remote self-check on ${machine} (${dur})`,
      );
    }
    return gate;
  } finally {
    if (prevStore === undefined) delete process.env.REPOOS_CHECK_STORE_ROOT;
    else process.env.REPOOS_CHECK_STORE_ROOT = prevStore;
  }
}
