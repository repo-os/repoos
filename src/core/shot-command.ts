/**
 * Command-based shot capture (#0761).
 *
 * A non-web capture target does not boot a URL; it RUNS A COMMAND that renders
 * one or more image files offscreen (AppKit `bitmapImageRepForCachingDisplay`
 * inside `swift test`, `xcrun simctl io <device> screenshot`, `adb exec-out
 * screencap`, `screencapture`, …). This module is the one place that runs such a
 * command and collects what it produced:
 *
 *  - the command runs in the task worktree (or the target's `cwd`);
 *  - RepoOS hands it a fresh output directory in `REPOOS_SHOT_DIR` (gitignored),
 *    and never passes a tracked path by default — a command that ignores the
 *    variable writes nothing RepoOS collects;
 *  - a `requires` binary that is missing is a clean SKIP (never a failed
 *    handoff), checked before anything runs;
 *  - the command runs with a timeout; on expiry it is killed and the tail of
 *    its stdout/stderr is returned as the failure detail;
 *  - every image matching `outputGlob` (default: every image directly in the
 *    output dir) is collected, in a stable order.
 *
 * Pure of server/UI concerns — the CLI and the handoff capture both call
 * {@link runShotCommand} and feed the bytes into the shared shot store, so the
 * two paths stay in lockstep. Zero runtime dependencies: `node:child_process`
 * and `node:fs` only, and `command` is always run under the repo's own runtime
 * (Bun first) as a shell string, exactly like a preview command.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ShotTargetConfig } from "./types.js";
import { matchGlob } from "./shot-targets.js";

/** Default capture timeout: an offscreen render / simulator screencap can be slow to warm up. */
export const DEFAULT_SHOT_TIMEOUT_MS = 120_000;

/** Image extensions a captured file may carry, matching the shot store. */
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

/** MIME type for a captured file's extension. */
export function mimeForShotFile(file: string): string {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

/** One image file a capture command produced. */
export interface CapturedShotFile {
  /** File name relative to the output directory, using `/` separators. */
  name: string;
  /** MIME type inferred from the extension. */
  mime: string;
  /** Raw bytes. */
  data: Buffer;
}

export type ShotCommandOutcome =
  | { status: "captured"; files: CapturedShotFile[]; warnings: string[] }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * True when `binary` resolves to something executable on `PATH` (or is an
 * existing path). Used for the target's `requires` check: a missing binary is a
 * visible skip, not a crash. A bare name is looked up with `which`/`command -v`
 * through the shell so a shell function or a shim on `PATH` counts.
 */
export function binaryAvailable(binary: string): boolean {
  const name = binary.trim();
  if (!name) return true;
  if (name.includes("/")) return existsSync(name);
  const probe = spawnSync("sh", ["-c", `command -v ${shellQuote(name)}`], {
    encoding: "utf8",
    timeout: 5000,
  });
  return probe.status === 0 && Boolean(probe.stdout?.trim());
}

/** Single-quote a string for safe interpolation into a POSIX shell command. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Filesystem-safe slug for a target name (used as a subdir under `shots/`). */
export function slugName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "shot"
  );
}

/** The last `max` non-empty lines of `text`, for a failure note. */
export function tailLines(text: string, max = 12): string {
  const lines = text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return lines.slice(-max).join("\n");
}

/**
 * Every image file under `dir` matching `globs` (repo-`/` separators, relative
 * to `dir`), sorted for a stable capture order. Directories are walked; the
 * default glob set (`*`) collects every image directly in `dir`.
 */
export function collectShotFiles(dir: string, globs: string[]): string[] {
  if (!existsSync(dir)) return [];
  const patterns = globs.length ? globs : ["*"];
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(current, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!IMAGE_EXT.test(entry)) continue;
      const rel = relative(dir, abs).split(sep).join("/");
      if (patterns.some((g) => matchGlob(g, rel))) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Run a capture target's command and collect the images it produced.
 *
 * `worktreeRoot` is the task worktree; `outputDir` is a fresh, gitignored
 * directory the caller owns (created here). Returns a structured outcome —
 * never throws — so a capture problem is a visible note, not a failed handoff.
 */
export function runShotCommand(
  target: ShotTargetConfig,
  worktreeRoot: string,
  outputDir: string,
): ShotCommandOutcome {
  if (target.requires && !binaryAvailable(target.requires)) {
    return {
      status: "skipped",
      reason: `"${target.requires}" is not installed — its capture target "${target.name}" was skipped`,
    };
  }
  // Fresh output dir every run: a stale file from a previous capture must never
  // be collected as this run's evidence.
  try {
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    return {
      status: "failed",
      reason: `could not prepare the shot output directory: ${(err as Error).message}`,
    };
  }
  const cwd = target.cwd ? join(worktreeRoot, target.cwd) : worktreeRoot;
  const timeout = target.timeoutMs && target.timeoutMs > 0 ? target.timeoutMs : DEFAULT_SHOT_TIMEOUT_MS;
  const run = spawnSync("sh", ["-c", target.command], {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      // The documented contract: a capture command writes into this directory.
      REPOOS_SHOT_DIR: outputDir,
      REPOOS_WORKTREE: worktreeRoot,
    },
  });
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? (run.error ? `${run.error.message}\n` : "");
  // A timeout makes `spawnSync` set `error.code === "ETIMEDOUT"` (or signal it
  // killed the child with) and no status. Say so plainly rather than reporting a
  // generic non-zero exit.
  const timedOut =
    run.error !== undefined &&
    (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT" &&
    run.status === null;
  if (timedOut) {
    return {
      status: "failed",
      reason:
        `capture command for "${target.name}" timed out after ${timeout}ms` +
        (tailLines(`${stdout}\n${stderr}`) ? `\n${tailLines(`${stdout}\n${stderr}`)}` : ""),
    };
  }
  const files = collectShotFiles(outputDir, target.outputGlob ?? []);
  if (run.status !== 0 && files.length === 0) {
    const tail = tailLines(`${stdout}\n${stderr}`);
    return {
      status: "failed",
      reason:
        `capture command for "${target.name}" exited ${run.status ?? "without a status"}` +
        (tail ? `\n${tail}` : ""),
    };
  }
  if (files.length === 0) {
    const tail = tailLines(`${stdout}\n${stderr}`);
    return {
      status: "skipped",
      reason:
        `capture command for "${target.name}" produced no image files` +
        (target.outputGlob?.length
          ? ` matching ${target.outputGlob.join(", ")}`
          : " in REPOOS_SHOT_DIR") +
        (run.status !== 0 ? ` (exit ${run.status})` : "") +
        (tail ? `\n${tail}` : ""),
    };
  }
  const warnings: string[] = [];
  if (run.status !== 0) {
    warnings.push(
      `capture command for "${target.name}" exited ${run.status} but produced ${files.length} file(s) — collected anyway`,
    );
  }
  const captured: CapturedShotFile[] = [];
  for (const name of files) {
    try {
      captured.push({ name, mime: mimeForShotFile(name), data: readFileSync(join(outputDir, name)) });
    } catch (err) {
      warnings.push(`could not read captured file ${name}: ${(err as Error).message}`);
    }
  }
  if (captured.length === 0) {
    return { status: "failed", reason: `no captured file under ${outputDir} could be read` };
  }
  return { status: "captured", files: captured, warnings };
}
