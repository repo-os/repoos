/**
 * Paths and commit chains that must not invalidate a running check gate (#1061).
 *
 * Bookkeeping under `work/**` and the cache dir cannot change build or test
 * outcomes. Commits touching any other path invalidate the gate (#1061).
 */
import type { RepoOSConfig } from "./types.js";
import { pathsChangedBetweenCommits, runGit } from "./git.js";

function withTrailingSlash(dir: string): string {
  return `${dir.replace(/\/+$/, "")}/`;
}

export function checkGateBookkeepingPrefix(config: Pick<RepoOSConfig, "workDir" | "cacheDir">): {
  work: string;
  cache: string;
} {
  const work = withTrailingSlash(config.workDir ?? "work");
  const cache = withTrailingSlash(config.cacheDir ?? ".repoos");
  return { work, cache };
}

/** True when a path change cannot affect check results during a gate run. */
export function isCheckGateBookkeepingPath(
  path: string,
  config: Pick<RepoOSConfig, "workDir" | "cacheDir">,
): boolean {
  const { work, cache } = checkGateBookkeepingPrefix(config);
  return path.startsWith(work) || path.startsWith(cache);
}

export type CheckGateHeadDrift =
  | { ok: true }
  | { ok: false; reason: string; affectingPaths?: string[] };

/**
 * Whether `afterHead` is an acceptable drift from `beforeHead` for a gate that
 * started at `beforeHead`. Fails closed when git cannot list changed paths.
 */
export async function checkGateHeadDriftAllowed(
  workdir: string,
  config: RepoOSConfig,
  taskId: string,
  beforeHead: string,
  afterHead: string,
): Promise<CheckGateHeadDrift> {
  if (beforeHead === afterHead) return { ok: true };
  const changed = await pathsChangedBetweenCommits(workdir, beforeHead, afterHead);
  if (changed === null) {
    return {
      ok: false,
      reason: "could not determine which paths changed between the gate snapshots",
    };
  }
  const commitDetail = await formatNonBookkeepingCommitDrift(
    workdir,
    beforeHead,
    afterHead,
    config,
    changed.filter((p) => !isCheckGateBookkeepingPath(p, config)),
  );
  if (commitDetail === "") return { ok: true };
  if (commitDetail === null) {
    return {
      ok: false,
      reason: "could not determine the commit subjects and paths that moved HEAD during the check",
    };
  }
  return {
    ok: false,
    reason: commitDetail,
    affectingPaths: changed.filter((p) => !isCheckGateBookkeepingPath(p, config)),
  };
}

async function formatNonBookkeepingCommitDrift(
  wt: string,
  from: string,
  to: string,
  config: RepoOSConfig,
  aggregatePaths: string[],
): Promise<string | null> {
  const list = await runGit(wt, ["rev-list", "--first-parent", to, `^${from}`], 15_000);
  const parts: string[] = [`HEAD moved from ${from.slice(0, 8)} to ${to.slice(0, 8)}`];
  if (list.status !== 0) return null;
  {
    const shas = list.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const sha of shas) {
      const subj = await runGit(wt, ["log", "-1", "--format=%s", sha], 10_000);
      const paths = await pathsChangedBetweenCommits(wt, `${sha}^`, sha);
      if (paths === null) return null;
      const affecting = paths.filter((p) => !isCheckGateBookkeepingPath(p, config));
      if (affecting.length === 0) continue;
      if (subj.status !== 0 || !subj.stdout.trim()) return null;
      const subject = subj.stdout.trim();
      parts.push(`commit "${subject}" touched ${affecting.join(", ")}`);
    }
  }
  if (parts.length === 1 && aggregatePaths.length > 0) return null;
  return parts.length === 1 ? "" : parts.join("; ");
}
