import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { commitFiles } from "./git.js";
import { canaryGitignoreNegation, canaryRelPath, parseCanaryDigit } from "./canary.js";

export function readCanaryCounter(root: string, cacheDir = ".repoos"): number {
  const abs = join(root, canaryRelPath(cacheDir));
  if (!existsSync(abs)) return 0;
  try {
    return parseCanaryDigit(readFileSync(abs, "utf8"));
  } catch {
    return 0;
  }
}

function ensureCanaryGitignore(root: string, cacheDir: string): string | null {
  const negation = canaryGitignoreNegation(cacheDir);
  const giPath = join(root, ".gitignore");
  const existing = existsSync(giPath) ? readFileSync(giPath, "utf8").split(/\r?\n/) : [];
  if (existing.some((line) => line.trim() === negation)) return null;
  const block =
    (existsSync(giPath) && !readFileSync(giPath, "utf8").endsWith("\n") ? "\n" : "") +
    `# RepoOS canary flow-test counter (tracked)\n${negation}\n`;
  appendFileSync(giPath, block);
  return giPath;
}

function writeCanaryFileIfMissing(root: string, cacheDir: string): string | null {
  const rel = canaryRelPath(cacheDir);
  const abs = join(root, rel);
  if (existsSync(abs)) return null;
  mkdirSync(join(root, cacheDir), { recursive: true });
  writeFileSync(abs, "0", "utf8");
  return abs;
}

/**
 * Lazily scaffold the counter file (and gitignore exception) on first canary
 * run, then commit to main so the task worktree has the file (#0151).
 */
export function ensureCanaryReadyForTask(config: RepoOSConfig): void {
  const cacheDir = config.cacheDir ?? ".repoos";
  const toCommit: string[] = [];
  const gi = ensureCanaryGitignore(config.root, cacheDir);
  if (gi) toCommit.push(gi);
  const canary = writeCanaryFileIfMissing(config.root, cacheDir);
  if (canary) toCommit.push(canary);
  if (toCommit.length === 0) return;
  commitFiles(config.root, toCommit, "chore: add RepoOS canary flow-test counter");
}

/**
 * Write the initial counter during `repoos init` (not committed — same as other
 * scaffold files).
 */
export function scaffoldCanaryFile(root: string, cacheDir: string): string | null {
  return writeCanaryFileIfMissing(root, cacheDir);
}
