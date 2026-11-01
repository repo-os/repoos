/**
 * One-time migration: clear stale `hold` frontmatter on `done` tasks (#0993).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { clearTerminalStateForDone } from "../core/done-task-cleanup.js";
import { parseTask, serializeTask } from "../core/task.js";
import type { RepoOSConfig } from "../core/types.js";
import { commitFiles } from "../core/git.js";

export interface DoneHoldMigrationOutcome {
  attempted: boolean;
  committed: boolean;
  rewritten: number;
  rewrittenAbsPaths: string[];
}

function walkTaskFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const visit = (path: string): void => {
    let st;
    try {
      st = statSync(path, { throwIfNoEntry: false });
    } catch {
      return;
    }
    if (!st) return;
    if (st.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
      return;
    }
    if (exts.includes(extname(path))) out.push(path);
  };
  visit(dir);
  return out;
}

export function runDoneHoldMigrationPass(
  config: RepoOSConfig,
  commit: (absPaths: string[]) => boolean,
): DoneHoldMigrationOutcome {
  const workDir = join(config.root, config.workDir);
  const exts = config.taskExtensions ?? [".md"];
  const rewrittenAbsPaths: string[] = [];
  for (const absPath of walkTaskFiles(workDir, exts)) {
    try {
      const content = readFileSync(absPath, "utf8");
      const task = parseTask({
        content,
        absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
      if (task.status !== "done") continue;
      if (!task.isHeld && !(task.tags ?? []).some((t) => t.trim().toLowerCase() === "hold")) {
        continue;
      }
      if (!clearTerminalStateForDone(task)) continue;
      writeFileSync(absPath, serializeTask(task));
      rewrittenAbsPaths.push(absPath);
    } catch {
      /* skip unreadable files */
    }
  }
  if (rewrittenAbsPaths.length === 0) {
    return { attempted: false, committed: false, rewritten: 0, rewrittenAbsPaths: [] };
  }
  const result = commit(rewrittenAbsPaths);
  return {
    attempted: true,
    committed: result,
    rewritten: rewrittenAbsPaths.length,
    rewrittenAbsPaths,
  };
}
