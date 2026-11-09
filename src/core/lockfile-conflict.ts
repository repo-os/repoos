/**
 * Lockfile-only merge conflicts (#0679): regenerate instead of handing back to
 * an engineer when the only blocking paths are lockfiles.
 */
import { spawn } from "node:child_process";
import { basename } from "node:path";
import {
  runGit,
  stagedForeignBookkeepingPaths,
  workFileFilter,
  type WorkFileFilter,
} from "./git.js";

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
  opts: { taskId?: string; filter?: WorkFileFilter } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const diffRes = await runGit(worktreePath, ["diff", "--name-only", "--diff-filter=U"], 10_000);
  const conflicts = diffRes.status === 0 ? diffRes.stdout.split("\n").filter(Boolean) : [];
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
  // Stage only the conflicted lockfiles this function is completing — a bare
  // `add -A` would also sweep in whatever else the task worktree holds dirty
  // (another task's bookkeeping from a board write), and the following bare
  // commit would publish it to the branch (#1076).
  //
  // A sibling staged BEFORE this merge cannot reach here: git refuses to start
  // a merge over a dirty index ("Your local changes would be overwritten by
  // merge"). But `bun install` below can run for minutes, and a concurrent
  // board write during that window CAN leave a sibling's `work/<other-id>-*.md`
  // staged. The merge commit must stay a bare `--no-edit` (git rejects a
  // pathspec commit mid-merge), so we do not rely on the merge-start guard:
  // any foreign bookkeeping the index holds is unstaged first, so a sibling's
  // file can never ride the merge commit onto the branch (#1076).
  if (opts.taskId) {
    const filter = opts.filter ?? workFileFilter({});
    const foreign = await stagedForeignBookkeepingPaths(worktreePath, {
      ...filter,
      taskId: opts.taskId,
    });
    if (foreign.length > 0) {
      const unstage = await runGit(
        worktreePath,
        ["reset", "--quiet", "HEAD", "--", ...foreign],
        15_000,
      );
      if (unstage.status !== 0) {
        await runGit(worktreePath, ["merge", "--abort"], 4000);
        return {
          ok: false,
          reason: `could not unstage another task's bookkeeping (${foreign.slice(0, 5).join(", ")}) before completing the lockfile merge`,
        };
      }
    }
  }
  const add = await runGit(worktreePath, ["add", "--", ...conflicts], 30_000);
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
