/**
 * Lockfile-only merge conflicts (#0679): regenerate instead of handing back to
 * an engineer when the only blocking paths are lockfiles.
 */
import { spawn } from "node:child_process";
import { basename } from "node:path";
import { runGit } from "./git.js";

const LOCKFILE_NAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/** True when every conflicting path is a known lockfile. */
export function isLockfileOnlyConflicts(conflicts: string[]): boolean {
  return (
    conflicts.length > 0 &&
    conflicts.every((p) => LOCKFILE_NAMES.has(basename(p)) || LOCKFILE_NAMES.has(p))
  );
}

async function runBunInstall(cwd: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["install"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve(1);
      }
    }, timeoutMs);
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(1);
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(code ?? 1);
      }
    });
  });
}

/**
 * While a merge is in progress with only lockfile conflicts, drop the lockfiles,
 * regenerate with `bun install`, and complete the merge commit.
 */
export async function tryCompleteMergeByRegeneratingLockfile(
  worktreePath: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const diffRes = await runGit(worktreePath, ["diff", "--name-only", "--diff-filter=U"], 10_000);
  const conflicts =
    diffRes.status === 0 ? diffRes.stdout.split("\n").filter(Boolean) : [];
  if (!isLockfileOnlyConflicts(conflicts)) {
    return { ok: false, reason: "not a lockfile-only conflict" };
  }
  for (const p of conflicts) {
    const rm = await runGit(worktreePath, ["rm", "-f", "--", p], 10_000);
    if (rm.status !== 0) {
      await runGit(worktreePath, ["merge", "--abort"], 4000);
      return { ok: false, reason: `could not remove conflicted lockfile ${p}` };
    }
  }
  const installCode = await runBunInstall(worktreePath, 300_000);
  if (installCode !== 0) {
    await runGit(worktreePath, ["merge", "--abort"], 4000);
    return { ok: false, reason: "bun install failed after lockfile conflict" };
  }
  const add = await runGit(worktreePath, ["add", "-A"], 30_000);
  if (add.status !== 0) {
    await runGit(worktreePath, ["merge", "--abort"], 4000);
    return { ok: false, reason: "could not stage regenerated lockfile" };
  }
  const commit = await runGit(worktreePath, ["commit", "--no-edit"], 30_000);
  if (commit.status !== 0) {
    await runGit(worktreePath, ["merge", "--abort"], 4000);
    return {
      ok: false,
      reason: `could not commit lockfile regeneration: ${commit.stderr.trim()}`,
    };
  }
  return { ok: true };
}
