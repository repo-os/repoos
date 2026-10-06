/**
 * Close-out repair handback (#0679): move a task from `review` back to `active`
 * and resume the engineer with actionable conflict/gate output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import { commitTaskFile } from "../core/git.js";
import { parseTask } from "../core/task.js";
import { recordChange, serializeTask } from "../core/task.js";
import type { AgentRunner } from "./agents.js";
import { resolveAgentForTask } from "./agents.js";
import { patchTaskFile } from "./write.js";
import { clearWorktreeHandoffProtection } from "./worktree-handoff-guard.js";

const REPAIR_DELAY_MS = 3_000;

export type CloseOutRepairKind = "merge-conflict" | "gate-failure";

const HANDOFF_INSTRUCTION =
  "Merge main into your branch, resolve any conflicts, run `repoos check` until it passes, " +
  "then request handoff to review again.";

function repairMessage(kind: CloseOutRepairKind, reason: string): string {
  const lead =
    kind === "merge-conflict"
      ? "Move to done failed because your branch conflicts with main."
      : "Move to done failed: the merge-gate check failed even though this branch passed handoff review.";
  return [lead, "", reason.trim(), "", HANDOFF_INSTRUCTION].join("\n");
}

/**
 * Move the task to `active`, clear handoff locks, and message the engineer.
 * Returns false when no engineer is configured or the task is not in `review`.
 */
export function scheduleCloseOutRepairHandback(
  config: RepoOSConfig,
  task: Task,
  kind: CloseOutRepairKind,
  reason: string,
  runner: AgentRunner,
  onFileChange?: (absPath: string) => void,
): boolean {
  if (task.status !== "review") return false;

  const engineer = resolveAgentForTask(config, task);
  if (!engineer) {
    runner.persistHandoffFailure(
      task.id,
      task,
      `close-out ${kind} and no engineer is configured · ${reason}`,
    );
    return false;
  }

  setTimeout(() => {
    try {
      const updated = patchTaskFile(
        config,
        task.absPath,
        {
          status: "active",
          needsInput: false,
          note: `close-out repair: ${kind}`,
        },
        {},
      );
      clearWorktreeHandoffProtection(config.root, config.cacheDir ?? ".repoos", task.id);
      onFileChange?.(updated.absPath);
    } catch (err) {
      runner.system(
        task.id,
        `✗ could not move task to active for close-out repair: ${(err as Error).message}`,
      );
      runner.persistHandoffFailure(task.id, task, `close-out repair status change failed · ${reason}`);
      return;
    }

    const message = repairMessage(kind, reason);
    const sent = runner.send(task.id, message, engineer, { skipBoardDivergence: true });
    if (!sent.ok) {
      runner.system(
        task.id,
        `✗ close-out repair could not resume engineer: ${sent.reason ?? "unknown error"}`,
      );
      runner.persistHandoffFailure(
        task.id,
        task,
        `could not resume engineer after close-out ${kind} · ${sent.reason ?? "unknown error"}`,
      );
      return;
    }

    try {
      const raw = readFileSync(task.absPath, "utf8");
      const doc = parseDocument(raw);
      const count = (typeof doc.data.close_out_repair_count === "number"
        ? doc.data.close_out_repair_count
        : 0) + 1;
      doc.data.close_out_repair_count = count;
      const keys = Object.keys(doc.data).filter((k) => k !== "close_out_repair_count");
      keys.unshift("close_out_repair_count");
      writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      commitTaskFile(config.root, task.absPath, `docs(${task.id}): record close-out repair`);
      onFileChange?.(task.absPath);
    } catch {
      /* bookkeeping is best-effort */
    }

    runner.system(task.id, "↻ close-out failed — task moved to active for repair");
  }, REPAIR_DELAY_MS);

  return true;
}

/** Persist last successful close-out gate duration on the task file (#0679). */
export function recordTaskCloseOutGateDuration(
  config: RepoOSConfig,
  absPath: string,
  durationMs: number,
): void {
  if (!(durationMs > 0)) return;
  try {
    const task = parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root: config.root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    recordChange(task, `close-out gate completed in ${Math.round(durationMs / 1000)}s`);
    const doc = parseDocument(serializeTask(task));
    doc.data.last_close_out_gate_ms = Math.floor(durationMs);
    doc.data.last_close_out_gate_at = new Date().toISOString();
    const keys = Object.keys(doc.data).filter(
      (k) => k !== "last_close_out_gate_ms" && k !== "last_close_out_gate_at",
    );
    keys.unshift("last_close_out_gate_ms", "last_close_out_gate_at");
    writeFileSync(absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
    commitTaskFile(config.root, absPath, `docs(${task.id}): record close-out gate duration`);
  } catch {
    /* visibility only */
  }
}
