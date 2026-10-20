/**
 * Keep the closing task's canonical `work/<id>-*.md` in `review` after a failed
 * close-out (#0838). A failed publish-time auto-resolve can leave main's copy
 * dirty or reverted to a stale branch-side bookkeeping shape (missing or wrong
 * `status:`), which surfaces as `inbox` via the parser default and blocks the
 * next handoff ("task must be active or review, but is inbox").
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseTask } from "../core/task.js";
import { patchTaskFile } from "./write.js";

function findTaskFileById(root: string, workDir: string, taskId: string): string | null {
  const dir = join(root, workDir);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const match = entries.find((f) => f.startsWith(`${taskId}-`) && f.endsWith(".md"));
  return match ? join(dir, match) : null;
}

/**
 * After a failed close-out, restore the board copy so Move to done / handoff can
 * retry without manual `repoos mv … active`. Never writes `inbox`.
 */
export function preserveClosingTaskReviewStatusOnMain(
  config: RepoOSConfig,
  taskId: string,
  getTask?: (id: string) => Task | null,
): void {
  const workDir = config.workDir ?? "work";
  const absPath = getTask?.(taskId)?.absPath ?? findTaskFileById(config.root, workDir, taskId);
  if (!absPath || !existsSync(absPath)) return;

  const rel = relative(config.root, absPath).split("\\").join("/");
  // Drop half-applied merge resolution debris on the live main checkout.
  try {
    execFileSync("git", ["checkout", "HEAD", "--", rel], { cwd: config.root });
  } catch {
    /* best-effort — patch below still restores review when needed */
  }

  let task: Task;
  try {
    task = parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root: config.root,
      defaultStatus: config.defaultStatus ?? "inbox",
      defaultAssignee: config.defaultAssignee ?? "unassigned",
    });
  } catch {
    return;
  }
  if (task.status === "done") return;
  if (task.status === "review") return;

  try {
    patchTaskFile(config, absPath, {
      status: "review",
      note: "close-out failed — restored review status for retry (#0838)",
    });
  } catch {
    // Best-effort repair: a mid-merge file (unresolved conflict markers) or a
    // concurrent writer is left untouched. The failure handler must not throw.
  }
}
