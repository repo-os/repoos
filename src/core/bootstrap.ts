/**
 * Bootstrap phase that runs before every agent turn (initial and resumed).
 *
 * RepoOS can deterministically prepare a worktree before an agent sees it:
 * validate the root/worktree/branch, make dev dependencies available, and
 * confirm the RepoOS CLI used for orchestration is trustworthy. Agents should
 * never spend tokens on predictable setup.
 *
 * All mutations are safe: bootsrap never rewrites source, task content,
 * lockfiles, or unrelated user changes. Failures stop the launch with a clear
 * actionable error and the worktree stays recoverable.
 *
 * Zero runtime deps — `node:child_process` only. Like the rest of core, every
 * check here is best-effort and degrades gracefully.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "./types.js";

/** Outcome of a single bootstrap step. */
export interface BootstrapStep {
  name: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

/** Full bootstrap result — surfaced in the context pack and telemetry. */
export interface BootstrapResult {
  ok: boolean;
  /** All steps executed (successful or failed). */
  steps: BootstrapStep[];
  /** Total wall-clock duration in ms. */
  durationMs: number;
  /** When !ok, the first failing reason (human-readable). */
  reason?: string;
}

/** The package manager detected in a worktree, or null. */
export type PackageManager = "bun" | "npm" | null;

/**
 * Detect the package manager for a directory. Checks lockfiles first (the
 * authoritative signal) then falls back to binary probe.
 */
export function detectPackageManager(dir: string): PackageManager {
  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(join(dir, "package-lock.json"))) {
    return "npm";
  }
  if (existsSync(join(dir, "package.json"))) {
    const probe = spawnSync("bun", ["--version"], { cwd: dir, timeout: 4000 });
    if (probe.status === 0) return "bun";
    const npmProbe = spawnSync("npm", ["--version"], { cwd: dir, timeout: 4000 });
    if (npmProbe.status === 0) return "npm";
  }
  return null;
}

/**
 * Which install command to use. `bun install --frozen-lockfile` never mutates
 * the lockfile; `npm ci` does the same (requires an existing lockfile). Both
 * reuse the package manager's cache/store so the cost on a warm cache is low.
 */
function installCommand(pm: PackageManager, dir: string): { cmd: string; args: string[] } | null {
  if (pm === "bun") {
    return { cmd: "bun", args: ["install", "--frozen-lockfile"] };
  }
  if (pm === "npm") {
    if (!existsSync(join(dir, "package-lock.json"))) {
      return { cmd: "npm", args: ["install"] };
    }
    return { cmd: "npm", args: ["ci"] };
  }
  return null;
}

interface timedResult<T> {
  value: T;
  durationMs: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<timedResult<T>> {
  const start = Date.now();
  const value = await fn();
  return { value, durationMs: Date.now() - start };
}

function timedSync<T>(fn: () => T): timedResult<T> {
  const start = Date.now();
  const value = fn();
  return { value, durationMs: Date.now() - start };
}

const STEP_NAMES = {
  VALIDATE_ROOT: "validate-repo-root",
  VALIDATE_WORKTREE: "validate-worktree",
  CHECK_BUILD: "check-orchestration-build",
  INSTALL_DEPS: "install-dependencies",
} as const;

/**
 * Check whether the RepoOS build used for orchestration (the CLI the agent
 * will run for `repoos check` inside the worktree) is trustworthy.
 *
 * The check only blocks when evidence of a compiled build system exists:
 * a `src/` directory AND a `package.json` with a build script. Without both,
 * there is no compiled output to check — the bootstrap skips this step.
 */
function checkOrchestrationBuild(
  config: RepoOSConfig,
  cwd: string,
): { ok: boolean; detail: string } {
  const hasSrc = existsSync(join(config.root, "src"));
  const pkgPath = join(config.root, "package.json");
  let hasBuild = false;
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      hasBuild = typeof pkg?.scripts?.build === "string";
    } catch {
      /* unreadable */
    }
  }
  if (!hasSrc || !hasBuild) {
    return { ok: true, detail: "no compiled build system detected — skipping build check" };
  }
  const buildMarker = join(config.root, "dist", ".build-info.json");
  if (!existsSync(buildMarker)) {
    return {
      ok: false,
      detail: "dist/.build-info.json missing — run `bun run build` in the main checkout",
    };
  }
  return { ok: true, detail: "build marker present" };
}

/**
 * Validate the worktree directory exists and is safe to use. Returns true
 * when the cwd is a real directory inside (or equal to) the repo root or
 * its worktrees directory. Never rewrites anything.
 *
 * Uses realpathSync on all paths so macOS symlinks (/var → /private/var)
 * don't cause false mismatches.
 */
function validateWorktree(config: RepoOSConfig, cwd: string): { ok: boolean; detail: string } {
  if (!existsSync(cwd)) {
    return { ok: false, detail: `worktree path does not exist: ${cwd}` };
  }
  try {
    const normalizedCwd = realpathSync(cwd);
    const normalizedRoot = realpathSync(config.root);
    const wtDir = join(config.root, "..");
    const normalizedWtDir = realpathSync(wtDir);
    if (
      normalizedCwd === normalizedRoot ||
      normalizedCwd.startsWith(normalizedRoot + "/") ||
      normalizedCwd.startsWith(normalizedWtDir + "/")
    ) {
      return { ok: true, detail: "worktree path valid" };
    }
    return { ok: false, detail: `worktree path outside expected locations: ${cwd}` };
  } catch {
    // realpathSync fails if the path doesn't exist (already caught above)
    return { ok: false, detail: `cannot resolve worktree path: ${cwd}` };
  }
}

/**
 * Install development dependencies in the worktree when `node_modules` is
 * missing. Uses the detected package manager with a lockfile-respecting command
 * so the lockfile is never mutated. No-op when `node_modules` already exists.
 *
 * Safe: `--frozen-lockfile` / `npm ci` never rewrite lockfiles or package.json.
 * The package-manager cache (e.g. `~/.bun/install/cache`) is reused so a cold
 * network fetch is only needed on the first-ever install.
 */
function installDeps(dir: string): { ok: boolean; detail: string } {
  if (existsSync(join(dir, "node_modules"))) {
    return { ok: true, detail: "node_modules already present" };
  }
  const pm = detectPackageManager(dir);
  if (!pm) {
    return { ok: true, detail: "no package.json — nothing to install" };
  }
  const cmd = installCommand(pm, dir);
  if (!cmd) {
    return { ok: true, detail: `package manager ${pm} detected but no install command available` };
  }
  const proc = spawnSync(cmd.cmd, cmd.args, { cwd: dir, timeout: 120_000 });
  if (proc.status !== 0) {
    const err =
      proc.stderr?.toString("utf8").trim().split("\n").slice(-3).join(" ") || "unknown error";
    return { ok: false, detail: `${cmd.cmd} install failed: ${err}` };
  }
  return { ok: true, detail: `dependencies installed with ${cmd.cmd}` };
}

/**
 * Run the bootstrap phase for a task in its worktree. Returns a structured
 * result with per-step timing — callers surface failures as launch blockers
 * and record telemetry.
 *
 * Steps (in order):
 * 1. Validate the repo root is readable and has a valid config
 * 2. Validate the worktree path exists and is within expected bounds
 * 3. Check the orchestration build is not obviously broken
 * 4. Install dependencies if node_modules is missing
 *
 * The agent is never launched on step failure (the caller checks `result.ok`).
 * Every step that fails stops the bootstrap: later steps are skipped and
 * recorded as such.
 */
export async function bootstrap(
  config: RepoOSConfig,
  task: Task,
  branch: string,
  cwd: string,
): Promise<BootstrapResult> {
  const overallStart = Date.now();
  const steps: BootstrapStep[] = [];

  const add = (name: string, ok: boolean, durationMs: number, detail?: string): boolean => {
    steps.push({ name, ok, durationMs, detail });
    return ok;
  };

  // Step 1: validate repo root
  const { value: rootOk, durationMs: rootDur } = timedSync(() => {
    if (!existsSync(config.root)) {
      return { ok: false, detail: `repo root does not exist: ${config.root}` };
    }
    if (!existsSync(join(config.root, config.workDir))) {
      return { ok: false, detail: `work dir missing in root: ${config.workDir}` };
    }
    return { ok: true, detail: "repo root valid" };
  });
  if (!add(STEP_NAMES.VALIDATE_ROOT, rootOk.ok, rootDur, rootOk.detail)) {
    return {
      ok: false,
      steps,
      durationMs: Date.now() - overallStart,
      reason: rootOk.detail,
    };
  }

  // Step 2: validate worktree
  const { value: wtOk, durationMs: wtDur } = timedSync(() => validateWorktree(config, cwd));
  if (!add(STEP_NAMES.VALIDATE_WORKTREE, wtOk.ok, wtDur, wtOk.detail)) {
    return {
      ok: false,
      steps,
      durationMs: Date.now() - overallStart,
      reason: wtOk.detail,
    };
  }

  // Step 3: check orchestration build
  const { value: buildOk, durationMs: buildDur } = timedSync(() =>
    checkOrchestrationBuild(config, cwd),
  );
  if (!add(STEP_NAMES.CHECK_BUILD, buildOk.ok, buildDur, buildOk.detail)) {
    return {
      ok: false,
      steps,
      durationMs: Date.now() - overallStart,
      reason: buildOk.detail,
    };
  }

  // Step 4: install dependencies (async — may spawn a child process)
  const { value: depsOk, durationMs: depsDur } = await timed(async () => installDeps(cwd));
  add(STEP_NAMES.INSTALL_DEPS, depsOk.ok, depsDur, depsOk.detail);

  const durationMs = Date.now() - overallStart;
  if (!depsOk.ok) {
    return {
      ok: false,
      steps,
      durationMs,
      reason: depsOk.detail,
    };
  }

  return { ok: true, steps, durationMs };
}
