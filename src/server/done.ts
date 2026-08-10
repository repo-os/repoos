/**
 * `POST /api/tasks/:id/done` orchestration — the review -> done close-out.
 *
 * Runs against the MAIN checkout (`config.root`), never the task's worktree:
 *   1. merge the task's branch into main (FF when possible, merge commit
 *      otherwise); on conflict the merge is aborted and the task stays review.
 *   2. rebuild + `repoos check` so the merged main stays green.
 *   3. set status `done`, delete the branch, remove the task's worktree.
 * A failure at any step leaves the task in `review`; if the merge already
 * happened, we report that state honestly.
 */
import { spawn } from "node:child_process";
import { relative } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  mergeBranch,
  deleteBranch,
  removeWorktree,
  commitTaskFile,
} from "../core/git.js";
import { patchTaskFile } from "./write.js";

export interface CheckSummary {
  ok: boolean;
  /** Human-readable failure detail (when not ok). */
  detail?: string;
}

export interface CompleteResult {
  ok: boolean;
  /** Whether the branch was merged into main (even when later steps failed). */
  merged: boolean;
  /** Files that conflicted (merge aborted, task still in review). */
  conflicts: string[];
  /** Whether the merge was a fast-forward. */
  ff: boolean;
  /** Post-merge build/check gate (undefined when the merge itself failed). */
  check?: CheckSummary;
  /** The updated task, present when the task reached `done`. */
  task?: Task;
  /** Human-readable reason (not ok). */
  reason?: string;
}

/** The progress steps reported to the UI while the flow runs. */
export type DoneStep = "merge" | "build" | "screenshots" | "check" | "done";

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

/** Non-blocking `spawn`, resolving with exit status + captured output. */
function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (status: number | null, error?: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, error });
    };
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err: NodeJS.ErrnoException) => finish(null, err));
    child.on("close", (code: number | null) => finish(code));
    timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout);
  });
}

async function runStep(
  cwd: string,
  candidates: string[][],
  label: string,
): Promise<CheckSummary> {
  let missing = "";
  for (const cmd of candidates) {
    const run = await runProcess(cmd[0], cmd.slice(1), { cwd, timeout: 240_000 });
    if (run.status === 0) return { ok: true };
    if (run.error && (run.error.code === "ENOENT" || run.error.code === "EACCES")) {
      missing = `${cmd[0]} is not available`;
      continue;
    }
    const out = [run.stdout, run.stderr]
      .filter((x) => x.trim() !== "")
      .join("\n")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(" · ");
    return { ok: false, detail: out || `\`${label}\` failed (exit ${run.status})` };
  }
  return { ok: false, detail: missing || `\`${label}\` could not be run` };
}

const BUILD_STEPS: string[][] = [
  ["bun", "run", "build"],
  ["npm", "run", "build"],
];

/**
 * Regenerate the committed screenshots. Merging a UI-changing task makes the
 * `screenshots` gate of `repoos check` fail (the `.ui-hash` drift), so the
 * done flow re-captures before checking. The script serves dist/ui itself on an
 * ephemeral port, so no build is needed here — `BUILD_STEPS` already ran.
 */
const SCREENSHOT_STEPS: string[][] = [["node", "scripts/capture-screenshots.mjs"]];

/** Commit regenerated `dist/` and `screenshots/` so main stays clean and mergeable. */
async function commitGenerated(root: string): Promise<void> {
  await runProcess("git", ["add", "-A", "--", "dist", "screenshots"], { cwd: root, timeout: 4000 });
  await runProcess("git", ["commit", "-m", "chore: regenerate dist and screenshots"], {
    cwd: root,
    timeout: 4000,
  });
}

const CHECK_STEPS: string[][] = [
  ["repoos", "check"],
  ["bun", "run", "repoos", "check"],
  ["node", "dist/cli/index.js", "check"],
];

export async function completeTask(
  config: RepoOSConfig,
  task: Task,
  onProgress?: (step: DoneStep) => void,
): Promise<CompleteResult> {
  const root = config.root;

  onProgress?.("merge");
  // Ensure the task file is committed in main before merging: API-created tasks
  // are untracked in main, and the agent's main-copy sync leaves uncommitted
  // edits — either would abort `git merge`. The branch's version of the task
  // file is authoritative for the final state, so if it is the only conflicted
  // path the merge resolves it automatically.
  commitTaskFile(root, task.absPath, `docs(${task.id}): update task`);
  const rel = relative(root, task.absPath);
  // `dist/` and `screenshots/` are generated by every build/check and change on
  // both sides of a close-out merge; the build right after this merge
  // regenerates them, so the branch's version is safe to take.
  const merge = await mergeBranch(root, task.branch, {
    autoResolve: [rel, "dist/", "screenshots/"],
  });
  if (!merge.merged) {
    return {
      ok: false,
      merged: false,
      conflicts: merge.conflicts,
      ff: false,
      reason: merge.conflicts.length
        ? `merge conflict: ${merge.conflicts.join(", ")}`
        : merge.reason ?? "merge failed",
    };
  }

  onProgress?.("build");
  const build = await runStep(root, BUILD_STEPS, "bun run build");
  if (!build.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      check: { ok: false, detail: `build failed: ${build.detail}` },
      reason: "build failed after merge — task kept in review",
    };
  }
  // Re-capture screenshots against the merged UI so `repoos check` stays green.
  onProgress?.("screenshots");
  const shots = await runStep(root, SCREENSHOT_STEPS, "repoos screenshots");
  if (!shots.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      check: { ok: false, detail: `screenshot regeneration failed: ${shots.detail}` },
      reason: "screenshot regeneration failed after merge — task kept in review",
    };
  }
  await commitGenerated(root);

  onProgress?.("check");
  const check = await runStep(root, CHECK_STEPS, "repoos check");
  if (!check.ok) {
    return {
      ok: false,
      merged: true,
      conflicts: [],
      ff: merge.ff,
      check: { ok: false, detail: `repoos check failed: ${check.detail}` },
      reason: "repoos check failed after merge — task kept in review",
    };
  }

  onProgress?.("done");
  const updated = patchTaskFile(config, task.absPath, { status: "done" });
  // Best-effort cleanup; content is preserved in the merged main. The worktree
  // must go first — git refuses to delete a branch checked out in a worktree.
  removeWorktree(root, task.branch);
  deleteBranch(root, task.branch);

  return {
    ok: true,
    merged: true,
    conflicts: [],
    ff: merge.ff,
    check: { ok: true },
    task: updated,
  };
}
