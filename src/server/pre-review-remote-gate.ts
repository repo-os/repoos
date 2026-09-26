/**
 * Remote path for the engineer pre-review gate (task #0520).
 *
 * When `remoteValidation.enabled`, install + build + tests run on the runner
 * against the worktree HEAD (same git-bundle transport as close-out); the local
 * `repoos check` then runs with `REPOOS_SKIP_TESTS=1`. See
 * docs/remote-validation.md.
 */

import type { RepoOSConfig } from "../core/types.js";
import { runGit } from "../core/git.js";
import type { RemoteValidator } from "./remote-validation.js";

/** Set on a spawned `repoos check` when a parent already ran the remote gate (#0520). */
export const REPOOS_REMOTE_VALIDATION_DONE = "REPOOS_REMOTE_VALIDATION_DONE";

export function remotePreReviewEnabled(config: RepoOSConfig): boolean {
  return config.remoteValidation?.enabled === true;
}

/** True when a parent gate (handoff, close-out, release) already ran remote validation. */
export function remoteValidationAlreadyAttempted(env: NodeJS.ProcessEnv): boolean {
  return env.REPOOS_SKIP_TESTS === "1" || env[REPOOS_REMOTE_VALIDATION_DONE] === "1";
}

/**
 * Extra env for a child `repoos check` after `runRemotePreReviewGate` ran in the
 * parent. Prevents a second remote run; optionally skips local tests.
 */
export function checkEnvAfterRemoteGate(
  outcome: RemotePreReviewOutcome | { kind: "skip" },
): NodeJS.ProcessEnv {
  if (outcome.kind === "skip") return {};
  const env: NodeJS.ProcessEnv = { [REPOOS_REMOTE_VALIDATION_DONE]: "1" };
  if (outcome.kind === "local-only" && outcome.skipTests) {
    env.REPOOS_SKIP_TESTS = "1";
  }
  return env;
}

/** Whether standalone `repoos check` should run the remote half (not when a parent already did). */
export function shouldRunCliRemotePreReviewGate(
  config: RepoOSConfig,
  opts: { localTestsOnly?: boolean },
  env: NodeJS.ProcessEnv,
): boolean {
  return (
    remotePreReviewEnabled(config) && !opts.localTestsOnly && !remoteValidationAlreadyAttempted(env)
  );
}

export type RemotePreReviewOutcome =
  | { kind: "skip" }
  | { kind: "local-only"; skipTests: boolean }
  | { kind: "fail"; detail: string; retryable: boolean };

export async function runRemotePreReviewGate(params: {
  config: RepoOSConfig;
  remoteValidator: RemoteValidator;
  worktreePath: string;
  taskId: string;
  onChunk?: (chunk: string) => void;
}): Promise<RemotePreReviewOutcome> {
  const rv = params.config.remoteValidation;
  if (!rv?.enabled) return { kind: "skip" };

  const headRes = await runGit(params.worktreePath, ["rev-parse", "HEAD"], 10_000);
  if (headRes.status !== 0) {
    return {
      kind: "fail",
      retryable: true,
      detail: "could not resolve worktree HEAD before remote validation",
    };
  }
  const candidateSha = headRes.stdout.trim();
  const remote = await params.remoteValidator.validate({
    taskId: params.taskId,
    worktreePath: params.worktreePath,
    candidateSha,
    onChunk: params.onChunk,
  });
  if (remote.ok) {
    return { kind: "local-only", skipTests: true };
  }
  if (remote.transient && !rv.fallbackToLocal) {
    return {
      kind: "fail",
      retryable: true,
      detail:
        `${remote.detail ?? "remote validation unavailable"} — retry once the runner is available, or set ` +
        `remoteValidation.fallbackToLocal to run the full gate locally`,
    };
  }
  if (!remote.transient) {
    return {
      kind: "fail",
      retryable: false,
      detail:
        `remote validation failed: ${remote.detail ?? "build or test suite failed on the runner"} — ` +
        `fix it in the feature branch and re-run the gate`,
    };
  }
  return { kind: "local-only", skipTests: false };
}
