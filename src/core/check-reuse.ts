/** Exact-commit reuse for handoff. Unknown evidence always runs the gate. */
import { realpathSync } from "node:fs";
import { runGit } from "./git.js";
import { getCheckStore, type CheckRunRow } from "./check-store.js";

export interface CheckSnapshot {
  candidateSha: string;
  mainSha: string;
  mergeBase: string;
}

/** Capture only committed, clean inputs; include untracked files, not ignored build/cache output. */
export async function checkSnapshot(
  worktree: string,
  changedRef?: string,
): Promise<CheckSnapshot | null> {
  try {
    const git = async (args: string[]): Promise<string> => {
      const result = await runGit(worktree, args, 10_000);
      if (result.status !== 0) throw new Error("git comparison unavailable");
      return result.stdout.trim();
    };
    if (await git(["status", "--porcelain", "--untracked-files=all"])) return null;
    const candidateSha = await git(["rev-parse", "HEAD"]);
    const mainSha = await git(["rev-parse", "main"]);
    const mergeBase = await git(["merge-base", candidateSha, mainSha]);
    // Any supported scope must cover at least changed:main at the captured base.
    if (changedRef && (await git(["merge-base", candidateSha, changedRef])) !== mergeBase)
      return null;
    if (![candidateSha, mainSha, mergeBase].every((s) => /^[a-f0-9]{40,64}$/.test(s))) return null;
    return { candidateSha, mainSha, mergeBase };
  } catch {
    return null;
  }
}

export function sameCheckSnapshot(a: CheckSnapshot | null, b: CheckSnapshot | null): boolean {
  return (
    !!a &&
    !!b &&
    a.candidateSha === b.candidateSha &&
    a.mainSha === b.mainSha &&
    a.mergeBase === b.mergeBase
  );
}

/** Board-only commits on main do not change the code against which tests were selected. */
export async function compatibleCheckSnapshots(
  worktree: string,
  a: CheckSnapshot | null,
  b: CheckSnapshot | null,
): Promise<boolean> {
  if (!a || !b || a.candidateSha !== b.candidateSha || a.mergeBase !== b.mergeBase) return false;
  if (
    ![a.candidateSha, a.mainSha, a.mergeBase, b.mainSha].every((s) => /^[a-f0-9]{40,64}$/.test(s))
  )
    return false;
  if (sameCheckSnapshot(a, b)) return true;
  try {
    const diff = await runGit(
      worktree,
      ["diff", "--name-only", "-z", a.mainSha, b.mainSha],
      10_000,
    );
    return (
      diff.status === 0 &&
      diff.stdout
        .split("\0")
        .filter(Boolean)
        .every((path) => /^work\/[^/]+\.md$/.test(path))
    );
  } catch {
    return false;
  }
}

/** Internal deployment knob; zero disables reuse. Invalid values fail closed. */
export function handoffCheckMaxAgeMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.REPOOS_HANDOFF_CHECK_MAX_AGE_MS;
  return value === undefined ? 60 * 60_000 : Number(value);
}

export async function findReusableHandoffCheck(
  root: string,
  cacheDir: string,
  taskId: string,
  worktree: string,
  maxAgeMs = handoffCheckMaxAgeMs(),
): Promise<CheckRunRow | null> {
  try {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return null;
    const snapshot = await checkSnapshot(worktree);
    if (!snapshot) return null;
    for (const row of getCheckStore(root, cacheDir).list({ taskId, limit: 1000 })) {
      const age = Date.now() - Date.parse(row.startedAt);
      if (
        row.taskId !== taskId ||
        !row.worktree ||
        realpathSync(row.worktree) !== realpathSync(worktree) ||
        row.outcome !== "pass" ||
        (row.phase !== "cli" && row.phase !== "pre-review") ||
        !row.reuseContext ||
        !row.candidateSha ||
        !["full", "changed:main", `changed:${snapshot.mergeBase}`].includes(row.scope) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > maxAgeMs
      )
        continue;
      if (
        await compatibleCheckSnapshots(
          worktree,
          {
            candidateSha: row.candidateSha,
            ...row.reuseContext,
          },
          snapshot,
        )
      )
        return row;
    }
    return null;
  } catch {
    return null;
  }
}
