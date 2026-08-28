/**
 * Runtime selection for the long-lived `repoos serve` process.
 *
 * RepoOS has zero runtime dependencies and its SQLite layer already targets
 * `bun:sqlite` OR `node:sqlite` (see db.ts), so the server runs unchanged
 * under either runtime. Bun boots ~2-3x faster, holds noticeably less memory,
 * and runs the vitest suite ~5x faster with no swap-thrash flake — a clear
 * win across the board.
 *
 * So the DEFAULT is: use Bun when `bun` is on PATH, else Node. Opt out with
 * `REPOOS_RUNTIME=node`.
 *
 *   REPOOS_RUNTIME unset   Bun if available, else Node, silently  (default)
 *   REPOOS_RUNTIME=auto    same as unset (explicit form)
 *   REPOOS_RUNTIME=bun     require Bun; print one line + stay on Node if missing
 *   REPOOS_RUNTIME=node    always Node
 *   REPOOS_BUN_PATH=/x     explicit bun binary instead of a PATH lookup
 *
 * Only `repoos serve` re-execs — short commands (`list`, `show`, …) would pay
 * a second process launch for no benefit. Everything the server then spawns
 * via `process.execPath` (reload replacements, preview children, `repoos
 * check`) inherits the same runtime automatically.
 *
 * The switch uses `process.execve` (a true exec: same PID, no wrapper) when
 * available — Node ≥ 22.15 on POSIX — and falls back to a spawned child with
 * signal relay everywhere else.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** True when this process is Bun rather than Node. */
export function isBun(): boolean {
  return typeof (process.versions as { bun?: string }).bun === "string";
}

/**
 * Absolute path to a `bun` binary, or null. Honors `REPOOS_BUN_PATH`;
 * otherwise resolves `bun` on PATH via `which`/`where`. Never throws.
 */
export function resolveBun(): string | null {
  const explicit = process.env.REPOOS_BUN_PATH;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const r = spawnSync(finder, ["bun"], { encoding: "utf8", timeout: 4000 });
    if (r.status !== 0) return null;
    const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

/** "node" is the only explicit opt-out; anything else (incl. unset) prefers Bun. */
type RuntimeMode = "prefer-bun" | "require-bun" | "node";

function runtimeMode(): RuntimeMode {
  const raw = (process.env.REPOOS_RUNTIME ?? "").toLowerCase();
  if (raw === "node") return "node";
  if (raw === "bun") return "require-bun";
  return "prefer-bun"; // unset, "auto", or anything unrecognized
}

/**
 * Whether repoos-spawned dev subtasks that CAN run on either runtime — right
 * now just `repoos check`'s vitest step — should be forced onto Bun.
 *
 * True when the runtime isn't pinned to Node, Bun is usable, AND the target
 * repo declares Bun as its package manager (a `bun.lock` / `bun.lockb`). The
 * lockfile guard keeps `repoos check` in a managed repo whose test script
 * expects Node from being silently switched.
 */
export function preferBunForDevTasks(cwd: string = process.cwd()): boolean {
  if (runtimeMode() === "node") return false;
  if (!existsSync(join(cwd, "bun.lock")) && !existsSync(join(cwd, "bun.lockb"))) {
    return false;
  }
  return isBun() || resolveBun() !== null;
}

/**
 * Unless pinned to Node (`REPOOS_RUNTIME=node`) or already running under Bun,
 * re-exec this CLI under Bun when `bun` is available. With `process.execve`
 * this never returns (the process image is replaced in place). With the spawn
 * fallback it returns `true` and the Node parent lingers only to relay
 * SIGINT/SIGTERM/SIGHUP/SIGQUIT and propagate the child's exit status.
 *
 * Returns `false` (a no-op) in every other case: already Bun, pinned to Node,
 * `bun` unavailable, or a prior attempt already set the re-exec guard — the
 * caller then proceeds normally on the current runtime.
 *
 * Call this for `serve` only, before any server work begins.
 */
export function reexecServeUnderBunIfRequested(): boolean {
  if (isBun()) return false;
  if (process.env.REPOOS_RUNTIME_REEXEC === "1") return false; // exactly one attempt
  const mode = runtimeMode();
  if (mode === "node") return false;

  const bun = resolveBun();
  if (!bun) {
    if (mode === "require-bun") {
      process.stderr.write(
        "[repoos] REPOOS_RUNTIME=bun but `bun` is not on PATH — running `serve` on Node.\n",
      );
    }
    return false;
  }

  const script = process.argv[1];
  if (!script) return false; // no entry path to hand to bun — stay put

  const argv = [script, ...process.argv.slice(2)];
  const env: NodeJS.ProcessEnv = { ...process.env, REPOOS_RUNTIME_REEXEC: "1" };

  // Preferred: true exec — same PID, no wrapper, signals land directly.
  const execve = (process as { execve?: (f: string, a: readonly string[], e: NodeJS.ProcessEnv) => never }).execve;
  if (typeof execve === "function") {
    try {
      execve(bun, [bun, ...argv], env);
      // not reached on success
    } catch (err) {
      // execve(2) failed; the process is intact — fall through to spawn.
      process.stderr.write(
        `[repoos] execve(bun) failed (${(err as Error).message}); using a child process\n`,
      );
    }
  }

  // Fallback (Windows, older Node, or a failed execve): spawn + relay.
  let child: ChildProcess;
  try {
    child = spawn(bun, argv, { stdio: "inherit", env });
  } catch (err) {
    process.stderr.write(
      `[repoos] could not launch bun (${(err as Error).message}) — running on Node.\n`,
    );
    return false;
  }

  const forward = (sig: NodeJS.Signals): void => {
    try {
      child.kill(sig);
    } catch {
      /* child already gone */
    }
  };
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as NodeJS.Signals[]) {
    process.on(s, () => forward(s));
  }
  child.on("error", (err) => {
    process.stderr.write(`[repoos] bun exited abnormally: ${err.message}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : code ?? 0);
  });

  // The live child handle and signal listeners keep this parent alive; it
  // does nothing else until the child exits.
  return true;
}
