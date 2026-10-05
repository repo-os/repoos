/**
 * Opt-in approval policy runner (#0686) — after a clean review, optionally
 * enqueue Move to done and record an auditable activity entry.
 */
import type { ReviewReport } from "./review.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  evaluateApprovalPolicy,
  taskBodyHasShotFailure,
  type ApprovalPolicyResult,
} from "../core/approval-policy.js";
import { localShotStore } from "./shots.js";
import { patchTaskFile } from "./write.js";
import type { CloseOutEnqueueDeps } from "./request-close-out.js";
import { enqueueCloseOutForTask, gatherApprovalPreflight } from "./request-close-out.js";
import type { LiveIndex } from "./live-index.js";
import { localBranches } from "../core/git.js";

export type ApprovalPolicyRunnerDeps = CloseOutEnqueueDeps;

function uiVisualEvidenceOk(config: RepoOSConfig, task: Task): boolean {
  if (taskBodyHasShotFailure(task.body)) return false;
  const shots = localShotStore(config, task.id).list();
  return shots.length > 0;
}

export async function evaluateAutoApprove(
  config: RepoOSConfig,
  task: Task,
  reviewMarkdown: string,
): Promise<ApprovalPolicyResult> {
  const branch = task.branch;
  let branchMissing = !branch;
  let mergeConflicts = false;
  let handoffDrift = false;

  if (branch && localBranches(config.root).has(branch)) {
    const preflight = await gatherApprovalPreflight(config, task);
    branchMissing = preflight.branchMissing;
    mergeConflicts = preflight.mergeConflicts;
    handoffDrift = preflight.handoffDrift;
  } else if (branch) {
    branchMissing = true;
  }

  return evaluateApprovalPolicy(config, {
    task,
    reviewMarkdown,
    branchMissing,
    mergeConflicts,
    handoffDrift,
    uiVisualEvidenceOk: uiVisualEvidenceOk(config, task),
  });
}

export async function tryAutoApproveAfterCleanReview(
  deps: ApprovalPolicyRunnerDeps,
  task: Task,
  report: ReviewReport,
): Promise<void> {
  const fresh = deps.index.getTask(task.id) ?? task;
  const decision = await evaluateAutoApprove(deps.config, fresh, report.markdown);
  if (!decision.eligible || !decision.rule) return;

  const rule = decision.rule;
  const auditLine = `auto-approved by policy: ${rule}`;

  try {
    const updated = patchTaskFile(deps.config, fresh.absPath, { note: auditLine });
    deps.index.applyFileChange(updated.absPath, { guarded: true });
    deps.emitEvent({
      type: "task.updated",
      task: updated,
      prev: {},
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      `[repoos] approval policy: could not record audit entry for #${fresh.id}: ${(err as Error).message}`,
    );
    return;
  }

  const at = new Date().toISOString();
  deps.emitEvent({ type: "task.autoApproved", id: fresh.id, rule, at });

  const enqueue = await enqueueCloseOutForTask(deps, deps.index.getTask(fresh.id) ?? fresh);
  if (!enqueue.ok) {
    console.warn(
      `[repoos] approval policy: auto-approve recorded for #${fresh.id} but close-out did not start (${enqueue.reason})`,
    );
  }
}
