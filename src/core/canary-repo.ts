import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { commitFiles, currentBranch, isGitRepo } from "./git.js";
import { canaryRelPath, parseCanaryDigit, patchGitignoreForCanary } from "./canary.js";

export function readCanaryCounter(root: string, cacheDir = ".repoos"): number {
  const abs = join(root, canaryRelPath(cacheDir));
  if (!existsSync(abs)) return 0;
  try {
    return parseCanaryDigit(readFileSync(abs, "utf8"));
  } catch {
    return 0;
  }
}

function refExists(root: string, ref: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", ref], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function defaultBranchSync(root: string): string {
  if (refExists(root, "refs/heads/main")) return "main";
  if (refExists(root, "refs/heads/master")) return "master";
  const head = currentBranch(root);
  return head && head !== "HEAD" ? head : "main";
}

function ensureCanaryGitignore(root: string, cacheDir: string): string | null {
  const giPath = join(root, ".gitignore");
  const raw = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
  const { content, changed } = patchGitignoreForCanary(raw, cacheDir);
  if (!changed) return null;
  writeFileSync(giPath, content, "utf8");
  return giPath;
}

function isCanaryTracked(root: string, cacheDir: string): boolean {
  const rel = canaryRelPath(cacheDir);
  try {
    const out = execFileSync("git", ["ls-files", "--", rel], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return out === rel;
  } catch {
    return false;
  }
}

function writeCanaryFileIfMissing(root: string, cacheDir: string): string | null {
  const rel = canaryRelPath(cacheDir);
  const abs = join(root, rel);
  if (existsSync(abs)) return null;
  mkdirSync(join(root, cacheDir), { recursive: true });
  writeFileSync(abs, "0", "utf8");
  return abs;
}

/** On disk but still ignored/untracked — commit after gitignore is fixed. */
function canaryFileNeedingCommit(root: string, cacheDir: string): string | null {
  const rel = canaryRelPath(cacheDir);
  const abs = join(root, rel);
  if (!existsSync(abs) || isCanaryTracked(root, cacheDir)) return null;
  return abs;
}

/**
 * Lazily scaffold the counter file (and gitignore exception) on first canary
 * run, then commit to main so the task worktree has the file (#0151).
 */
export function ensureCanaryReadyForTask(
  config: RepoOSConfig,
  onFailure?: (detail: string) => void,
): boolean {
  const cacheDir = config.cacheDir ?? ".repoos";
  const root = config.root;
  const fail = (detail: string) => {
    onFailure?.(detail);
    return false;
  };

  const gi = ensureCanaryGitignore(root, cacheDir);
  const canary =
    writeCanaryFileIfMissing(root, cacheDir) ?? canaryFileNeedingCommit(root, cacheDir);
  if (!gi && !canary) return true;

  if (!isGitRepo(root)) {
    return fail("canary: not a git repository — cannot commit counter file to main");
  }

  const head = currentBranch(root);
  const main = defaultBranchSync(root);
  if (head && head !== main) {
    return fail(
      `canary: repo root is on branch "${head}", not "${main}" — commit the counter on ${main} before running the canary`,
    );
  }

  const message = "chore: add RepoOS canary flow-test counter";
  if (gi && !commitFiles(root, [gi], message)) {
    return fail("canary: failed to commit .gitignore update for canary counter");
  }
  if (canary && !commitFiles(root, [canary], message)) {
    return fail("canary: failed to commit canary counter file");
  }
  return true;
}

/**
 * Write the initial counter during `repoos init` (not committed — same as other
 * scaffold files).
 */
export function scaffoldCanaryFile(root: string, cacheDir: string): string | null {
  return writeCanaryFileIfMissing(root, cacheDir);
}
