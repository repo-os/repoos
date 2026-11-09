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
  const inspected = await formatNonBookkeepingCommitDrift(workdir, beforeHead, afterHead, config);
  if (inspected.kind === "clean") return { ok: true };
  return { ok: false, reason: inspected.reason, affectingPaths: inspected.paths };
}

type CommitDriftInspection =
  | { kind: "clean" }
  | { kind: "changed"; reason: string; paths: string[] };

async function formatNonBookkeepingCommitDrift(
  wt: string,
  from: string,
  to: string,
  config: RepoOSConfig,
): Promise<CommitDriftInspection> {
  const ancestor = await runGit(wt, ["merge-base", "--is-ancestor", from, to], 10_000);
  if (ancestor.status !== 0) {
    return {
      kind: "changed",
      reason: `HEAD moved from ${from.slice(0, 8)} to ${to.slice(0, 8)}; commit ancestry could not be verified (source change; paths unavailable)`,
      paths: ["<paths unavailable>"],
    };
  }
  // Keep the endpoint diff as a fail-closed fallback, but do not treat it as
  // the full drift test: a source commit followed by a revert can leave the
  // endpoint tree unchanged even though the check may have observed it.
  const netPaths = await pathsChangedBetweenCommits(wt, from, to);
  if (netPaths === null) {
    return {
      kind: "changed",
      reason: `HEAD moved from ${from.slice(0, 8)} to ${to.slice(0, 8)}; changed paths could not be computed (source change; paths unavailable)`,
      paths: ["<paths unavailable>"],
    };
  }
  const netAffecting = netPaths.filter((path) => !isCheckGateBookkeepingPath(path, config));
  // Walk commits to detect source changes at any point in the gate and explain
  // them with their subjects and paths.
  // Ignore commits that were part of the checked tree's history.
  const list = await runGit(
    wt,
    ["rev-list", "--first-parent", "--reverse", `${from}..${to}`],
    15_000,
  );
  const parts: string[] = [`HEAD moved from ${from.slice(0, 8)} to ${to.slice(0, 8)}`];
  if (list.status !== 0) {
    return {
      kind: "changed",
      reason: `${parts[0]}; commit history could not be inspected${netAffecting.length ? `; source diff ${netAffecting.join(", ")}` : ""}`,
      paths: netAffecting.length ? [...netAffecting] : ["<paths unavailable>"],
    };
  }
  const allAffecting = new Set<string>();
  const explainedPaths = new Set<string>();
  {
    const shas = list.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const sha of shas) {
      // `from` may be reachable through a merge's second parent rather than
      // its first-parent chain. In that case rev-list --first-parent can
      // include commits that were already present in the checked tree. They
      // cannot represent drift that happened during this gate.
      const alreadyInCheckedTree = await runGit(
        wt,
        ["merge-base", "--is-ancestor", sha, from],
        10_000,
      );
      if (alreadyInCheckedTree.status === 0) continue;

      const subj = await runGit(wt, ["show", "-s", "--format=%s", sha], 10_000);
      const subject =
        subj.status === 0 && subj.stdout.trim() ? subj.stdout.trim() : "<subject unavailable>";
      const parents = await runGit(wt, ["rev-list", "--parents", "-n", "1", sha], 10_000);
      const parentShas = parents.status === 0 ? parents.stdout.trim().split(/\s+/).slice(1) : [];
      const firstParent = parentShas[0];
      const mergeCommit = parentShas.length > 1;
      // A merge can make the first-parent walk include commits from before
      // the gate began. Those commits are not drift unless the merge result
      // itself changes source relative to its first parent.
      if (!mergeCommit && firstParent) {
        const parentInCheckedTree = await runGit(
          wt,
          ["merge-base", "--is-ancestor", from, firstParent],
          10_000,
        );
        if (parentInCheckedTree.status !== 0) continue;
      }
      const diffBase = mergeCommit ? from : firstParent;
      const paths = diffBase ? await pathsChangedBetweenCommits(wt, diffBase, sha) : null;
      if (paths === null) {
        return {
          kind: "changed",
          reason: `${parts[0]}; paths for commit "${subject}" could not be computed`,
          paths: ["<paths unavailable>"],
        };
      }
      const affecting = paths.filter((p) => !isCheckGateBookkeepingPath(p, config));
      if (affecting.length === 0) continue;
      affecting.forEach((p) => {
        allAffecting.add(p);
        explainedPaths.add(p);
      });
      parts.push(`commit "${subject}" touched ${affecting.join(", ")}`);
    }
  }
  const unexplainedPaths = netAffecting.filter((path) => !explainedPaths.has(path));
  if (unexplainedPaths.length > 0) {
    return {
      kind: "changed",
      reason: `${parts[0]}; source diff ${unexplainedPaths.join(", ")} history could not be explained by inspected commits`,
      paths: [...netAffecting],
    };
  }
  if (parts.length > 1)
    return { kind: "changed", reason: parts.join("; "), paths: [...allAffecting] };
  if (netAffecting.length > 0) {
    return {
      kind: "changed",
      reason: `${parts[0]}; source diff ${netAffecting.join(", ")} history could not be explained by inspected commits`,
      paths: [...netAffecting],
    };
  }
  return { kind: "clean" };
}
