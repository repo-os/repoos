/**
 * Reject task branches that accidentally carry `repoos.toml` edits (#0827).
 *
 * Settings autosave and preview runs can rewrite the worktree copy; WIP
 * checkpoints must not commit that churn. Tasks that explicitly declare
 * `repoos.toml` work (title, `paths`, or `config` area) are exempt.
 */
import type { Task } from "./types.js";
import { parseTaskAreas } from "./areas.js";
import { branchChangesSinceBase, runGit } from "./git.js";

export const REPOOS_TOML_REL = "repoos.toml";

/** Stable prefix for handoff / close-out refusal reasons — grep-friendly. */
export const STRAY_REPOOS_TOML_ON_BRANCH_PREFIX = "stray repoos.toml on task branch";

/** True when the task record says changing `repoos.toml` is in scope. */
export function taskDeclaresRepoosTomlWork(
  task: Pick<Task, "title" | "paths" | "area">,
): boolean {
  if (
    task.paths?.some((p) => p === REPOOS_TOML_REL || p.replace(/^\.\//, "") === REPOOS_TOML_REL)
  ) {
    return true;
  }
  const title = task.title ?? "";
  if (title.toLowerCase().includes("repoos.toml")) return true;
  if (/\bconfig schema\b/i.test(title)) return true;
  const areas = parseTaskAreas(task.area);
  return areas.some((a) => a.toLowerCase() === "config");
}

function formatOffendingLines(diffText: string): string {
  const lines = diffText
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
    .slice(0, 16);
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

export function formatStrayRepoosTomlDetail(diffSnippet: string): string {
  return (
    `${STRAY_REPOOS_TOML_ON_BRANCH_PREFIX}: ${REPOOS_TOML_REL} differs from main` +
    `${formatOffendingLines(diffSnippet)}. ` +
    `Revert it with: git checkout main -- ${REPOOS_TOML_REL}`
  );
}

/** Unified diff for `repoos.toml` between merge-base(main) and HEAD, or null. */
export async function repoosTomlBranchDiffSnippet(
  worktree: string,
  baseBranch: string,
): Promise<string | null> {
  const baseRes = await runGit(worktree, ["merge-base", baseBranch, "HEAD"], 15_000);
  if (baseRes.status !== 0) return null;
  const base = baseRes.stdout.trim();
  const diff = await runGit(worktree, ["diff", base, "HEAD", "--", REPOOS_TOML_REL], 15_000);
  if (diff.status !== 0) return null;
  const text = diff.stdout.trim();
  return text.length > 0 ? text : null;
}

/**
 * Fail closed when the branch diverged on `repoos.toml` without declaring that
 * work. Hotfix tasks skip the check (main-checkout flow).
 */
export async function guardStrayRepoosTomlOnTaskBranch(
  worktree: string,
  mainBranch: string,
  task: Pick<Task, "title" | "paths" | "area" | "hotfix">,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (task.hotfix) return { ok: true };
  if (taskDeclaresRepoosTomlWork(task)) return { ok: true };
  const { paths } = branchChangesSinceBase(worktree, mainBranch);
  if (!paths.includes(REPOOS_TOML_REL)) return { ok: true };
  const snippet = await repoosTomlBranchDiffSnippet(worktree, mainBranch);
  return {
    ok: false,
    detail: formatStrayRepoosTomlDetail(
      snippet ?? `--- a/${REPOOS_TOML_REL}\n+++ b/${REPOOS_TOML_REL}`,
    ),
  };
}
