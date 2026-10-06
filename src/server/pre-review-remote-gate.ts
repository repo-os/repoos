/**
 * Remote path for the engineer pre-review gate (task #0520).
 *
 * When `remoteValidation.enabled`, install + build + tests run on the runner
 * against the worktree HEAD (same git-bundle transport as close-out); the local
 * `repoos check` then runs with `REPOOS_SKIP_TESTS=1`. See
 * docs/remote-validation.md.
 */

import { CLOSEOUT_CHECK_ARGS, planJobCapabilities, resolveCheckPlan } from "../core/check-plan.js";
import type { CheckRunPhase } from "../core/check-store.js";
import type { RepoOSConfig } from "../core/types.js";
import { runGit, uncommittedWorkFiles, workFileFilter } from "../core/git.js";
import type { RemoteValidator } from "./remote-validation.js";

/** Set on a spawned `repoos check` when a parent already ran the remote gate (#0520). */
export const REPOOS_REMOTE_VALIDATION_DONE = "REPOOS_REMOTE_VALIDATION_DONE";

export function remotePreReviewEnabled(config: RepoOSConfig): boolean {
  return config.remoteValidation?.enabled === true;
}

/**
 * Uncommitted task work in `worktreePath` that the remote gate would NOT test.
 * The runner receives a `git bundle` of `HEAD`, so edits still on disk never
 * reach it: a green remote run would describe the committed tree while the
 * local one differs (#0512's invariant — what is tested is what is committed).
 * Handoff commits first, so it never has any; a standalone `repoos check` on a
 * dirty tree can, and should test the working tree locally instead.
 *
 * Unknown is not clean: an unreadable git status is reported as blocking.
 */
export async function uncommittedFilesBlockingRemoteGate(
  worktreePath: string,
  config: RepoOSConfig,
): Promise<string[]> {
  try {
    return await uncommittedWorkFiles(worktreePath, workFileFilter(config));
  } catch {
    return ["(git status could not be read)"];
  }
}

/**
 * True when a parent gate (handoff, close-out, release) already ran remote
 * validation. `REPOOS_SKIP_TESTS=1` counts on purpose: close-out and release set
 * it after their own remote pass, and a user who exports it has asked for the
 * test suite to be skipped, which the remote run would contradict.
 */
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

/**
 * Whether a standalone `repoos check` may use the configured runner at all.
 * Only the Tailscale provider: its host is a stateless machine, so a CLI run is
 * just one more job. Hetzner runs a single warm VM whose lifecycle (provision,
 * idle teardown, leak reconciliation) is owned by the server process and tracked
 * in the server's `.repoos/remote-runner.json`. A CLI in a task worktree has a
 * different root, so it loads no state, and its `deleteLeaked()` would delete the
 * server's VM mid-run. Until the CLI can hand a run to the server, it tests
 * locally when the provider is Hetzner.
 */
export function standaloneCliCanUseRemote(config: RepoOSConfig): boolean {
  return config.remoteValidation?.provider === "tailscale";
}

/**
 * Whether standalone `repoos check` should run the remote half (not when a parent
 * already did, not with `--local-tests`, not when engineer self-check remote is
 * off). Same predicate as managed engineer self-check (#0694).
 */
export function shouldRunCliRemotePreReviewGate(
  config: RepoOSConfig,
  opts: { localTestsOnly?: boolean; changedRef?: string },
  env: NodeJS.ProcessEnv,
): boolean {
  if (opts.localTestsOnly) return false;
  if (remoteValidationAlreadyAttempted(env)) return false;
  if (!remotePreReviewEnabled(config)) return false;
  if (config.remoteValidation?.engineerSelfCheckRemote === false) return false;
  const managedEngineer =
    env.REPOOS_AGENT === "1" && /^\d+$/.test(env.REPOOS_TASK_ID?.trim() ?? "");
  if (managedEngineer) return true;
  // Standalone CLI: Tailscale only (#0520); changed-path mode still uses remote (#0694).
  return standaloneCliCanUseRemote(config);
}

/** Alias — one implementation for CLI and docs (#0694 review). */
export const shouldRunEngineerRemoteSelfCheck = shouldRunCliRemotePreReviewGate;

/**
 * `repoos check` argv for a child process spawned by handoff, close-out, release,
 * etc. When remote validation is enabled but the parent did not run it (release
 * with `useForReleases = false`, close-out without a build step, …), pass
 * `--local-tests` so the CLI does not auto-run remote again.
 */
export function spawnedRepoosCheckArgs(
  config: RepoOSConfig,
  remoteGateOutcome: RemotePreReviewOutcome | { kind: "skip" },
): readonly string[] {
  if (remoteGateOutcome.kind !== "skip") {
    return CLOSEOUT_CHECK_ARGS;
  }
  if (remotePreReviewEnabled(config)) {
    return ["--local-tests", ...CLOSEOUT_CHECK_ARGS];
  }
  return CLOSEOUT_CHECK_ARGS;
}

/**
 * The host capabilities a remote run of THIS repo's plan needs (#0521): the
 * `runsOn` union of every declared step. Shared by `runRemotePreReviewGate`
 * and any other route that dispatches `validate()` directly (the Checks
 * "Test suite" endpoint), so no caller can forget to route.
 */
export function remoteJobCapabilities(config: RepoOSConfig): string[] {
  return planJobCapabilities(resolveCheckPlan({ check: config.check }));
}

export type RemotePreReviewOutcome =
  | { kind: "skip" }
  | { kind: "local-only"; skipTests: boolean; detail?: string }
  | { kind: "fail"; detail: string; retryable: boolean };

export async function runRemotePreReviewGate(params: {
  config: RepoOSConfig;
  remoteValidator: RemoteValidator;
  worktreePath: string;
  taskId: string;
  /** Which gate is calling — recorded in the check-run history (#0564). */
  phase?: CheckRunPhase;
  onChunk?: (chunk: string) => void;
  /**
   * Epoch ms after which the caller has given up (#0521) — passed through so a
   * queued remote run cancels itself instead of outliving the caller that
   * abandoned it (the handoff's 10-minute deadline).
   */
  deadlineAt?: number;
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
  // Which host may run this job (#0521): the `runsOn` union of the whole plan,
  // deliberately not profile-filtered — the remote run executes the entire
  // plan in one go, so it must never land on a host missing one of its steps.
  const capabilities = remoteJobCapabilities(params.config);
  const remote = await params.remoteValidator.validate({
    taskId: params.taskId,
    worktreePath: params.worktreePath,
    candidateSha,
    phase: params.phase ?? "pre-review",
    onChunk: params.onChunk,
    ...(capabilities.length ? { capabilities } : {}),
    ...(params.deadlineAt !== undefined ? { deadlineAt: params.deadlineAt } : {}),
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
    // A red remote run is the branch's fault; a CONFIG error (no host
    // provides a required capability) is not — it must not fall back locally
    // either, or macOS-bound work would run on the wrong machine (#0521
    // review), so the detail points at the config instead of the branch.
    return {
      kind: "fail",
      retryable: false,
      detail: remote.configError
        ? `${remote.detail ?? "remote validation cannot run"} — fix the ` +
          `remoteValidation host configuration (docs/remote-validation.md) and re-run the gate`
        : `remote validation failed: ${remote.detail ?? "build or test suite failed on the runner"} — ` +
          `fix it in the feature branch and re-run the gate`,
    };
  }
  return {
    kind: "local-only",
    skipTests: false,
    detail: remote.detail,
  };
}
