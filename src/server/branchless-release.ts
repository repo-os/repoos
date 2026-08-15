/**
 * Release a branch-less task directly, skipping the branch-merge close-out
 * pipeline entirely.
 *
 * A task fixed by a direct commit on `main` (a hotfix — see #0212, not yet a
 * first-class flow) has nothing to merge: its code is already on `main`.
 * Routing it through the normal `/done` pipeline dead-ends on "no branch to
 * merge" — not because the task isn't done, but because that pipeline is
 * built entirely around merging a branch. This is the separate path: verify
 * `main` is currently green, then release directly via `markTaskReleased`.
 *
 * Never touches the job queue or the repository lock — there is no merge to
 * serialize against other close-outs, so those mechanisms don't apply.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import { markTaskReleased } from "./write.js";

export interface CheckResult {
  ok: boolean;
  /** Tail of combined stdout+stderr on failure, for the caller to surface. */
  output?: string;
}

/** Real check runner: prefers the local build's own CLI, same preference order as the close-out pipeline. */
export function runCheckOnRoot(root: string): CheckResult {
  const localCli = join(root, "dist", "cli", "index.js");
  const candidates: string[][] = existsSync(localCli)
    ? [[process.execPath, localCli, "check"], ["repoos", "check"]]
    : [["repoos", "check"], ["bun", "run", "repoos", "check"]];
  let last: ReturnType<typeof spawnSync> | null = null;
  for (const [cmd, ...args] of candidates) {
    const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 600_000 });
    last = r;
    if (r.status === 0) return { ok: true };
  }
  const output = [last?.stdout, last?.stderr]
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .join("\n")
    .trim()
    .split("\n")
    .slice(-15)
    .join("\n");
  return { ok: false, output: output || "no output captured" };
}

export interface ReleaseBranchlessResult {
  ok: boolean;
  reason?: string;
  task?: Task;
}

/**
 * A task is eligible for this path when it has no branch and isn't already
 * done. `review`-status is deliberately excluded even if branchless — that
 * shape shouldn't occur (nothing sets `review` without a branch), and if it
 * ever does, the normal `/done` merge path's own guard is the one that
 * should reject it, not this one silently swallowing it.
 */
export function isBranchlessReleaseEligible(task: Task): boolean {
  return !task.branch && task.status !== "done" && task.status !== "review";
}

export async function releaseBranchless(
  config: RepoOSConfig,
  task: Task,
  runCheck: (root: string) => CheckResult = runCheckOnRoot,
): Promise<ReleaseBranchlessResult> {
  const check = runCheck(config.root);
  if (!check.ok) {
    return {
      ok: false,
      reason: `repoos check failed on main — cannot release a branch-less task until main is green: ${check.output ?? ""}`,
    };
  }
  const task_ = markTaskReleased(config, task.absPath);
  return { ok: true, task: task_ };
}
