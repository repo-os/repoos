/**
 * Close-out dependency install helpers (#0674).
 *
 * Candidates normally symlink main's `node_modules`; that tree goes stale when an
 * earlier merge added packages but never refreshed main. These helpers infer the
 * install command from lockfiles (#0449), run optional shell overrides, and
 * classify gate output that is really an environment problem.
 */

import { spawn } from "node:child_process";
import { existsSync, lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";

export type CloseOutCandidateMode = "symlink-main" | "own-install";

const CANDIDATE_MODES = new Set<CloseOutCandidateMode>(["symlink-main", "own-install"]);

/** Whether a merged diff touches package manifests or lockfiles (#0449). */
export function hasDependencyInputChange(paths: readonly string[]): boolean {
  return paths.some((path) => {
    const filename = path.slice(path.lastIndexOf("/") + 1);
    return (
      filename === "package.json" ||
      filename === "bun.lock" ||
      filename === "package-lock.json" ||
      filename === "pnpm-lock.yaml" ||
      filename === "yarn.lock"
    );
  });
}

export function resolveCloseOutCandidateMode(config: RepoOSConfig): CloseOutCandidateMode {
  const raw = config.closeOut?.candidate ?? config.worktrees?.candidate;
  if (typeof raw === "string" && CANDIDATE_MODES.has(raw as CloseOutCandidateMode)) {
    return raw as CloseOutCandidateMode;
  }
  return "symlink-main";
}

export function resolveInstallShellCommand(config: RepoOSConfig): string | undefined {
  const cmd = config.closeOut?.installCommand ?? config.worktrees?.installCommand;
  return typeof cmd === "string" && cmd.trim() ? cmd.trim() : undefined;
}

export function resolvePostPublishShellCommand(config: RepoOSConfig): string | undefined {
  const cmd = config.closeOut?.postPublishCommand;
  return typeof cmd === "string" && cmd.trim() ? cmd.trim() : undefined;
}

/**
 * Lockfile-inferred install argv, or null when no lockfile is present.
 * May return npm/pnpm/yarn/bun argv when those lockfiles exist — same #0449
 * inference as before; not an endorsement of those tools for RepoOS itself.
 */
export function inferLockfileInstallCommand(
  projectRoot: string,
): { command: string; args: string[] } | null {
  if (existsSync(join(projectRoot, "bun.lock"))) {
    return { command: "bun", args: ["install", "--frozen-lockfile"] };
  }
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) {
    return { command: "pnpm", args: ["install", "--frozen-lockfile"] };
  }
  if (existsSync(join(projectRoot, "package-lock.json"))) {
    return { command: "npm", args: ["ci"] };
  }
  if (existsSync(join(projectRoot, "yarn.lock"))) {
    return { command: "yarn", args: ["install", "--frozen-lockfile"] };
  }
  return null;
}

/**
 * Whether the validating gate should run a candidate-local install before build/check.
 * Docs-only close-outs skip the whole non-docs branch, so they never call this (#0674).
 * `symlink-main` installs only when the merged diff changes package inputs; `own-install`
 * does the same but uses a private frozen install instead of symlinking when it runs.
 */
export function shouldRunCandidateInstall(
  config: RepoOSConfig,
  changedPaths: readonly string[] | null,
): boolean {
  if (!existsSync(join(config.root, "package.json"))) return false;
  return changedPaths !== null && hasDependencyInputChange(changedPaths);
}

export interface RunInstallResult {
  ok: boolean;
  reason?: string;
  cancelled?: boolean;
  timedOut?: boolean;
}

export interface RunInstallOptions {
  timeoutMs?: number;
  isCancelled?: () => boolean;
  deadlineAt?: number;
  /** When set, runs this shell command instead of a lockfile-inferred install. */
  shellCommand?: string;
}

function commandMissing(errorCode: string | undefined): boolean {
  return errorCode === "ENOENT" || errorCode === "EACCES";
}

function tail(stdout: string, stderr: string, max = 800): string {
  const combined = `${stdout}\n${stderr}`.trim();
  if (combined.length <= max) return combined;
  return combined.slice(-max);
}

/** Run a shell install command in `cwd` (used for custom install/post-publish). */
export async function runInstallShellCommand(
  cwd: string,
  command: string,
  opts: RunInstallOptions = {},
): Promise<RunInstallResult> {
  const timeout =
    opts.deadlineAt !== undefined
      ? Math.min(opts.timeoutMs ?? 300_000, Math.max(0, opts.deadlineAt - Date.now()))
      : (opts.timeoutMs ?? 300_000);

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let errorCode: string | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelPoll: ReturnType<typeof setInterval> | undefined;

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cancelPoll) clearInterval(cancelPoll);
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        resolve({ ok: false, timedOut: true });
        return;
      }
      if (cancelled) {
        resolve({ ok: false, cancelled: true });
        return;
      }
      if (status === 0) {
        resolve({ ok: true });
        return;
      }
      const detail = commandMissing(errorCode)
        ? `install command could not be launched (${command})`
        : tail(stdout, stderr);
      resolve({ ok: false, reason: detail });
    };

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      errorCode = err.code;
      finish(null);
    });
    child.on("close", (code) => finish(code));

    if (opts.isCancelled) {
      cancelPoll = setInterval(() => {
        if (opts.isCancelled!()) {
          cancelled = true;
          child.kill("SIGKILL");
        }
      }, 400);
    }

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, timeout);
  });
}

/** Run argv-style install (bun/pnpm/npm/yarn) in `cwd`. */
export async function runArgvInstall(
  cwd: string,
  spec: { command: string; args: string[] },
  opts: RunInstallOptions = {},
): Promise<RunInstallResult> {
  const timeout =
    opts.deadlineAt !== undefined
      ? Math.min(opts.timeoutMs ?? 300_000, Math.max(0, opts.deadlineAt - Date.now()))
      : (opts.timeoutMs ?? 300_000);

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let errorCode: string | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelPoll: ReturnType<typeof setInterval> | undefined;

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cancelPoll) clearInterval(cancelPoll);
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) {
        resolve({ ok: false, timedOut: true });
        return;
      }
      if (cancelled) {
        resolve({ ok: false, cancelled: true });
        return;
      }
      if (status === 0) {
        resolve({ ok: true });
        return;
      }
      const detail = commandMissing(errorCode)
        ? `${spec.command} is not available to install dependencies`
        : tail(stdout, stderr);
      resolve({ ok: false, reason: detail });
    };

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      errorCode = err.code;
      finish(null);
    });
    child.on("close", (code) => finish(code));

    if (opts.isCancelled) {
      cancelPoll = setInterval(() => {
        if (opts.isCancelled!()) {
          cancelled = true;
          child.kill("SIGKILL");
        }
      }, 400);
    }

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, timeout);
  });
}

function removeCandidateNodeModulesLink(projectRoot: string): void {
  const nodeModules = join(projectRoot, "node_modules");
  try {
    if (lstatSync(nodeModules).isSymbolicLink()) unlinkSync(nodeModules);
  } catch {
    /* missing or unreadable is fine */
  }
}

async function runConfiguredInstall(
  projectRoot: string,
  config: RepoOSConfig,
  kind: "candidate" | "post-publish",
  opts: RunInstallOptions,
): Promise<RunInstallResult> {
  removeCandidateNodeModulesLink(projectRoot);

  if (opts.shellCommand) {
    return runInstallShellCommand(projectRoot, opts.shellCommand, opts);
  }

  const shell =
    kind === "post-publish"
      ? resolvePostPublishShellCommand(config)
      : resolveInstallShellCommand(config);
  if (shell) {
    return runInstallShellCommand(projectRoot, shell, opts);
  }

  const inferred = inferLockfileInstallCommand(projectRoot);
  if (!inferred) {
    return {
      ok: false,
      reason:
        "package inputs changed but no recognized lockfile is available to prepare dependencies",
    };
  }
  return runArgvInstall(projectRoot, inferred, opts);
}

/** Candidate-local frozen install (replaces a symlink to main's tree). */
export async function prepareCandidateDependencyInstall(
  candidateRoot: string,
  config: RepoOSConfig,
  opts: RunInstallOptions = {},
): Promise<RunInstallResult> {
  return runConfiguredInstall(candidateRoot, config, "candidate", opts);
}

/** Refresh main's install after a dependency-changing merge lands. */
export async function refreshMainDependencyInstall(
  config: RepoOSConfig,
  opts: RunInstallOptions = {},
): Promise<RunInstallResult> {
  return runConfiguredInstall(config.root, config, "post-publish", opts);
}

export type PostPublishRefreshOutcome = { kind: "skipped" } | { kind: "ok" } | RunInstallResult;

/**
 * After a publish merge, refresh main when `baseMainSha..headSha` changed package inputs.
 * Used by the close-out orchestrator and integration tests (#0674).
 */
export async function refreshMainInstallAfterPublish(
  config: RepoOSConfig,
  baseMainSha: string,
  headSha: string,
  publishedPaths: readonly string[],
  opts: RunInstallOptions = {},
): Promise<PostPublishRefreshOutcome> {
  if (!publishedPaths.length || !hasDependencyInputChange(publishedPaths)) {
    return { kind: "skipped" };
  }
  void baseMainSha;
  void headSha;
  const result = await refreshMainDependencyInstall(config, opts);
  if (result.ok) return { kind: "ok" };
  return result;
}

const ENV_PATTERNS: RegExp[] = [
  /\bexit(?:ed with)? code 127\b/i,
  /\bcould not resolve\b/i,
  /\bfailed to resolve import\b/i,
  /\brolldown failed to resolve\b/i,
  /\bdenied id\b.*\bnode_modules\b/i,
  /\bdependency install failed\b/i,
  /\bis not available to (?:prepare candidate dependencies|install dependencies)\b/i,
  /\binstall command could not be launched\b/i,
  /\bpackage inputs changed but no recognized lockfile\b/i,
  /\bcommand not found\b/i,
  /\bENOENT\b.*\bnode_modules\b/i,
];

/** True when a close-out gate reason is likely stale/missing deps, not branch code. */
export function isCloseOutEnvironmentFailure(reason: string): boolean {
  const text = reason.trim();
  if (!text) return false;
  return ENV_PATTERNS.some((re) => re.test(text));
}
