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
import type { AttentionEventStore } from "./attention-events.js";
import type { CloseOutEnqueueDeps } from "./request-close-out.js";
import { enqueueCloseOutForTask, gatherApprovalPreflight } from "./request-close-out.js";
import type { LiveIndex } from "./live-index.js";
import { localBranches } from "../core/git.js";

export type ApprovalPolicyRunnerDeps = CloseOutEnqueueDeps & {
  /** Durable attention bell (#0687) — a policy auto-approval must be visible there. */
  attentionEvents?: AttentionEventStore;
};

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
  // Disabled policy must not start background merge analysis after review.
  if (config.approval?.enabled !== true || config.automation?.paused === true) {
    return { eligible: false, reason: "disabled" };
  }
  const branch = task.branch;
  let branchMissing = !branch;
  let mergePreflightFailed = false;
  let handoffDrift = false;
  let mainDirty = false;
  let changedPaths: string[] | null = null;

  if (branch && localBranches(config.root).has(branch)) {
    const preflight = await gatherApprovalPreflight(config, task);
    branchMissing = preflight.branchMissing;
    mergePreflightFailed = preflight.mergePreflightFailed;
    handoffDrift = preflight.handoffDrift;
    mainDirty = preflight.mainDirty;
    changedPaths = preflight.changedPaths;
  } else if (branch) {
    branchMissing = true;
  }

  const policy = config.approval;
  if (
    policy?.enabled === true &&
    !(policy.autoApprove?.areas?.length ?? 0) &&
    !(policy.autoApprove?.types?.length ?? 0)
  ) {
    console.warn(
      "[repoos] approval.enabled is true but approval.autoApprove.areas and .types are both empty — nothing will auto-approve until you configure at least one list",
    );
  }

  return evaluateApprovalPolicy(config, {
    task,
    reviewMarkdown,
    branchMissing,
    mergePreflightFailed,
    handoffDrift,
    mainDirty,
    changedPaths,
    uiVisualEvidenceOk: uiVisualEvidenceOk(config, task),
  });
}

export async function tryAutoApproveAfterCleanReview(
  deps: ApprovalPolicyRunnerDeps,
  task: Task,
  report: ReviewReport,
): Promise<void> {
  // The master kill switch (#0727) halts auto-approval even when the policy
  // itself is configured and enabled.
  if (deps.config.automation?.paused === true) return;

  const fresh = deps.index.getTask(task.id) ?? task;
  const decision = await evaluateAutoApprove(deps.config, fresh, report.markdown);
  if (!decision.eligible || !decision.rule) return;

  const rule = decision.rule;
  const enqueue = await enqueueCloseOutForTask(deps, deps.index.getTask(fresh.id) ?? fresh);
  if (!enqueue.ok) {
    console.warn(
      `[repoos] approval policy: close-out did not start for #${fresh.id} (${enqueue.reason}) — task stays in review with no auto-approve audit entry`,
    );
    return;
  }

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
      `[repoos] approval policy: close-out started for #${fresh.id} but audit entry failed: ${(err as Error).message}`,
    );
    return;
  }

  const at = new Date().toISOString();
  // Record in the durable attention bell too, so a policy landing is visible
  // exactly like a CTO safe action (#0727).
  try {
    deps.attentionEvents?.record({
      kind: "ctoAction",
      taskId: fresh.id,
      message: `CTO: auto-approved #${fresh.id}`,
      detail: `Moved to done by approval policy (${rule}). Main clean, gate green, review clean.`,
      at,
    });
    deps.emitEvent({ type: "attention.updated", at });
  } catch (err) {
    console.error(
      `[repoos] approval policy: auto-approved #${fresh.id} but bell entry failed: ${(err as Error).message}`,
    );
  }
  deps.emitEvent({ type: "task.autoApproved", id: fresh.id, rule, at });
}
