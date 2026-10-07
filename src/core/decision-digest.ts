/**
 * CTO "needs a decision" digest (#0730): escalations policy cannot resolve,
 * with extracted cause, evidence links, and safe actions (human vs automatic).
 */
import type { ApprovalPolicyRejectReason, ApprovalPolicyResult } from "./approval-policy.js";
import {
  classifyFailure,
  describeCloseOutFailure,
  type CloseOutFailureKind,
} from "./close-out-failure.js";
import { extractFailedTests, summarizeCheckFailure } from "./check-failure-summary.js";
import { isCtoActionAllowlisted, type CtoSafeActionId } from "./cto-actions.js";
import { parseReviewVerdict } from "./review-verdict.js";
import type { RepoOSConfig, Task } from "./types.js";

export type DecisionItemKind =
  | "handoff-failed"
  | "close-out-failed"
  | "review-blocked"
  | "needs-merge"
  | "human-assigned"
  | "stuck-run"
  | "release"
  | "owner-config";

export interface DecisionEvidence {
  label: string;
  /** In-app route (e.g. `/work?task=0042`). */
  href?: string;
  /** Repo-relative log path when present. */
  path?: string;
  checkRunId?: string;
}

export interface DecisionAction {
  id: string;
  label: string;
  /** When true and automation is not paused, the CTO or approval policy may take this. */
  policyAutomatic: boolean;
  ctoAction?: CtoSafeActionId;
}

export interface DecisionCause {
  headline: string;
  detail?: string;
  step?: string;
  host?: string;
  failingTests?: string[];
}

export interface DecisionDigestItem {
  id: string;
  kind: DecisionItemKind;
  taskId: string | null;
  title: string;
  cause: DecisionCause;
  evidence: DecisionEvidence[];
  actions: DecisionAction[];
  at: string;
  link: string | null;
}

export interface DecisionDigest {
  generatedAt: string;
  automationPaused: boolean;
  approvalEnabled: boolean;
  items: DecisionDigestItem[];
}

export interface CloseOutJobDigestSource {
  taskId: string;
  taskTitle: string;
  failedPhase?: string;
  reason?: string;
  logPath?: string;
  debugTldr?: string;
  failedAt?: string;
  logExcerpt?: string;
}

export interface SilentRunDigestSource {
  taskId: string;
  taskTitle: string;
  lastOutputAt: string | null;
  detail: string;
}

export interface ReleaseRunDigestSource {
  state: "failed" | "running";
  message: string;
  startedAt: string | null;
}

export interface ProviderFailureDigestSource {
  id: string;
  taskId: string | null;
  message: string;
  detail: string;
  at: string;
}

export interface DecisionDigestInput {
  config: RepoOSConfig;
  tasks: Task[];
  failedCloseOutJobs: CloseOutJobDigestSource[];
  silentRuns: SilentRunDigestSource[];
  releaseRun: ReleaseRunDigestSource | null;
  providerFailures: ProviderFailureDigestSource[];
  /** Latest reviewer report markdown per task id (review queue only). */
  reviewMarkdownByTaskId: Record<string, string>;
  /** Server-side approval evaluation per task in review. */
  approvalByTaskId: Record<string, ApprovalPolicyResult>;
  generatedAt?: string;
}

const POLICY_REASON_LABELS: Record<ApprovalPolicyRejectReason, string> = {
  disabled: "Auto-approval is off",
  "human-only": "Task is tagged human-only",
  "not-in-review": "Task is not in review",
  "needs-input": "Task needs input",
  "no-rule-match": "No auto-approve rule matches this task",
  "verdict-not-clean": "Reviewer verdict is not clean",
  "blocking-bugs": "Review report lists blocking bugs",
  "gate-not-green": "Handoff check gate is not green",
  "ui-without-visual-evidence": "UI change lacks handoff screenshots",
  "blocked-paths": "Branch touches machinery paths",
  "p0-needs-human": "p0 tasks need a human",
  "main-dirty": "Primary checkout is dirty",
  "branch-conflict": "Merge preflight reports conflicts",
  "branch-missing": "Task branch is missing locally",
  "handoff-drift": "Worktree no longer matches the handoff snapshot",
};

function automationPaused(config: RepoOSConfig): boolean {
  return config.automation?.paused === true;
}

function approvalEnabled(config: RepoOSConfig): boolean {
  return config.approval?.enabled === true && !automationPaused(config);
}

function ctoAuto(action: CtoSafeActionId, config: RepoOSConfig): boolean {
  return !automationPaused(config) && isCtoActionAllowlisted(config, action);
}

function taskLink(taskId: string): string {
  return `/work?task=${taskId}`;
}

/** Cause text for a needs-input / handoff failure. */
export function extractHandoffCause(task: Task): DecisionCause {
  const reason = task.needsInputReason ?? "needs-input";
  const detail = task.debugTldr?.trim() || task.needsInputDetail?.trim();
  const headline =
    detail?.split("\n")[0]?.trim() ||
    reason.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const failingTests =
    reason === "check-failed-after-retries" || reason === "dev-error"
      ? extractFailedTests(task.needsInputDetail ?? "")
      : undefined;
  const summary = summarizeCheckFailure(task.needsInputDetail ?? "");
  return {
    headline: summary ?? headline,
    detail: detail && detail !== headline ? detail : undefined,
    step: reason === "check-failed-after-retries" || reason === "dev-error" ? "check" : undefined,
    failingTests: failingTests?.length ? failingTests : undefined,
  };
}

/** Cause text for a failed close-out integration job. */
export function extractCloseOutCause(job: CloseOutJobDigestSource): DecisionCause {
  const reason = job.reason ?? "";
  const mapped = describeCloseOutFailure(job.failedPhase, reason);
  const combined = [reason, job.logExcerpt].filter(Boolean).join("\n");
  const failingTests = extractFailedTests(combined);
  const headline = job.debugTldr?.trim() || mapped.message;
  return {
    headline,
    detail: mapped.detail ?? (reason.trim() || undefined),
    step: mapped.step,
    failingTests: failingTests.length ? failingTests : undefined,
  };
}

function closeOutKind(job: CloseOutJobDigestSource): CloseOutFailureKind {
  return classifyFailure(job.failedPhase, job.reason ?? "");
}

export function actionsForHandoffFailure(task: Task, config: RepoOSConfig): DecisionAction[] {
  const reason = task.needsInputReason ?? "";
  const actions: DecisionAction[] = [];
  if (task.status === "review" && /review-failed|watchdog-stuck/.test(reason)) {
    actions.push({
      id: "review-again",
      label: "Request review again",
      policyAutomatic: false,
    });
  }
  actions.push({
    id: "message-engineer",
    label: "Message the engineer",
    policyAutomatic: false,
  });
  if (reason === "identical-handoff-failures") {
    actions.push({
      id: "restart-fresh",
      label: "Restart engineer with a fresh session",
      policyAutomatic: false,
    });
  }
  actions.push({
    id: "dismiss-needs-input",
    label: "Dismiss needs-input flag",
    policyAutomatic: false,
  });
  if (task.status === "active" && ctoAuto("restart-stalled-agent", config) && !task.needsInput) {
    actions.unshift({
      id: "cto-restart",
      label: "Restart stalled engineer (CTO)",
      policyAutomatic: true,
      ctoAction: "restart-stalled-agent",
    });
  }
  return actions;
}

export function actionsForCloseOutFailure(
  job: CloseOutJobDigestSource,
  config: RepoOSConfig,
): DecisionAction[] {
  const kind = closeOutKind(job);
  const actions: DecisionAction[] = [
    { id: "retry-done", label: "Retry Move to done", policyAutomatic: false },
  ];
  if (kind === "conflict" || kind === "syncing") {
    actions.push({
      id: "merge-main-into-branch",
      label: "Merge main into the task branch",
      policyAutomatic: false,
    });
  }
  if (kind === "environment" && ctoAuto("requeue-closeout-after-env-fix", config)) {
    actions.unshift({
      id: "cto-requeue-closeout",
      label: "Refresh install and re-queue close-out (CTO)",
      policyAutomatic: true,
      ctoAction: "requeue-closeout-after-env-fix",
    });
  }
  if (mappedRefreshHint(kind)) {
    actions.push({
      id: "refresh-main-install",
      label: "Refresh install in main",
      policyAutomatic: ctoAuto("refresh-main-install", config),
      ctoAction: "refresh-main-install",
    });
  }
  return actions;
}

function mappedRefreshHint(kind: CloseOutFailureKind): boolean {
  return kind === "environment";
}

export function actionsForStuckRun(config: RepoOSConfig): DecisionAction[] {
  const actions: DecisionAction[] = [
    { id: "message-engineer", label: "Message the engineer", policyAutomatic: false },
    { id: "pause-task", label: "Pause the task", policyAutomatic: false },
  ];
  if (ctoAuto("restart-stalled-agent", config)) {
    actions.unshift({
      id: "cto-restart",
      label: "Restart stalled engineer (CTO)",
      policyAutomatic: true,
      ctoAction: "restart-stalled-agent",
    });
  }
  return actions;
}

export function actionsForReviewBlocked(
  result: ApprovalPolicyResult,
  config: RepoOSConfig,
): DecisionAction[] {
  if (result.eligible && approvalEnabled(config)) {
    return [
      {
        id: "auto-move-to-done",
        label: "Move to done (approval policy)",
        policyAutomatic: true,
      },
    ];
  }
  const actions: DecisionAction[] = [
    { id: "open-review", label: "Open review report", policyAutomatic: false },
    { id: "move-to-done", label: "Move to done manually", policyAutomatic: false },
  ];
  if (result.reason === "gate-not-green") {
    actions.unshift({
      id: "fix-check-gate",
      label: "Fix failing check and re-hand off",
      policyAutomatic: false,
    });
  }
  if (result.reason === "verdict-not-clean" || result.reason === "blocking-bugs") {
    actions.unshift({
      id: "address-review",
      label: "Address reviewer findings",
      policyAutomatic: false,
    });
  }
  return actions;
}

/** True when the item still needs a human even with automation on. */
export function itemRequiresHumanDecision(
  item: DecisionDigestItem,
  automationPaused: boolean,
): boolean {
  if (automationPaused) return true;
  return item.actions.some((a) => !a.policyAutomatic);
}

function pushItem(items: DecisionDigestItem[], item: DecisionDigestItem): void {
  if (items.some((x) => x.id === item.id)) return;
  items.push(item);
}

function reviewBlockedCause(
  task: Task,
  result: ApprovalPolicyResult,
  reviewMarkdown: string,
): DecisionCause {
  const verdict = parseReviewVerdict(reviewMarkdown);
  const gate = task.extra?.last_check_failure;
  if (result.reason === "gate-not-green" && typeof gate === "string" && gate.trim()) {
    const failingTests = extractFailedTests(gate);
    return {
      headline: "Review is clean but the handoff check gate is still red",
      detail: gate.trim(),
      step: "check",
      failingTests: failingTests.length ? failingTests : undefined,
    };
  }
  if (result.reason === "verdict-not-clean") {
    return {
      headline: `Reviewer verdict is "${verdict ?? "unclear"}" — not auto-approvable`,
      detail: POLICY_REASON_LABELS[result.reason!],
    };
  }
  const reason = result.reason;
  return {
    headline: reason ? POLICY_REASON_LABELS[reason] : "Waiting for a human sign-off",
    detail: result.rule ? `Would auto-approve under ${result.rule}` : undefined,
  };
}

/**
 * Build the digest. Pure — callers supply live server state.
 */
export function buildDecisionDigest(input: DecisionDigestInput): DecisionDigest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const paused = automationPaused(input.config);
  const items: DecisionDigestItem[] = [];

  for (const task of input.tasks) {
    if (task.isArchived || task.status === "done") continue;

    if (task.assignee === "human" && !task.needsInput) {
      const item: DecisionDigestItem = {
        id: `human-assigned:${task.id}`,
        kind: "human-assigned",
        taskId: task.id,
        title: task.title,
        cause: { headline: "Assigned to you" },
        evidence: [{ label: "Task", href: taskLink(task.id) }],
        actions: [{ id: "open-task", label: "Open task", policyAutomatic: false }],
        at: task.updated_at ?? generatedAt,
        link: taskLink(task.id),
      };
      if (itemRequiresHumanDecision(item, paused)) pushItem(items, item);
      continue;
    }

    if (task.needsMerge) {
      const item: DecisionDigestItem = {
        id: `needs-merge:${task.id}`,
        kind: "needs-merge",
        taskId: task.id,
        title: task.title,
        cause: { headline: "Branch has drifted from main" },
        evidence: [{ label: "Task", href: taskLink(task.id) }],
        actions: [
          {
            id: "merge-main-into-branch",
            label: "Merge main into the task branch",
            policyAutomatic: false,
          },
        ],
        at: task.updated_at ?? generatedAt,
        link: taskLink(task.id),
      };
      pushItem(items, item);
    }

    if (task.needsInput) {
      const cause = extractHandoffCause(task);
      const evidence: DecisionEvidence[] = [{ label: "Task", href: taskLink(task.id) }];
      if (task.needsInputReason) {
        evidence.push({ label: `Reason: ${task.needsInputReason}` });
      }
      const item: DecisionDigestItem = {
        id: `handoff-failed:${task.id}`,
        kind: "handoff-failed",
        taskId: task.id,
        title: task.title,
        cause,
        evidence,
        actions: actionsForHandoffFailure(task, input.config),
        at: task.updated_at ?? generatedAt,
        link: taskLink(task.id),
      };
      if (itemRequiresHumanDecision(item, paused)) pushItem(items, item);
    }

    if (task.status === "review" && !task.needsInput) {
      const reviewMarkdown = input.reviewMarkdownByTaskId[task.id] ?? "";
      const approval = input.approvalByTaskId[task.id] ?? { eligible: false };
      if (approval.eligible && approvalEnabled(input.config)) {
        continue;
      }
      const verdict = parseReviewVerdict(reviewMarkdown);
      const gate = task.extra?.last_check_failure;
      const gateRed = typeof gate === "string" && gate.trim().length > 0;
      const mismatch = verdict === "good to go" && gateRed;
      const reviewNotClean = verdict !== null && verdict !== "good to go";
      const policyBlocks =
        approvalEnabled(input.config) &&
        !approval.eligible &&
        approval.reason &&
        approval.reason !== "disabled" &&
        approval.reason !== "no-rule-match" &&
        approval.reason !== "not-in-review";
      if (!mismatch && !reviewNotClean && !policyBlocks) {
        continue;
      }
      const item: DecisionDigestItem = {
        id: `review-blocked:${task.id}`,
        kind: "review-blocked",
        taskId: task.id,
        title: task.title,
        cause: reviewBlockedCause(task, approval, reviewMarkdown),
        evidence: [
          { label: "Review report", href: `${taskLink(task.id)}&tab=review` },
          { label: "Task", href: taskLink(task.id) },
        ],
        actions: actionsForReviewBlocked(approval, input.config),
        at: task.updated_at ?? generatedAt,
        link: taskLink(task.id),
      };
      if (itemRequiresHumanDecision(item, paused)) pushItem(items, item);
    }
  }

  for (const job of input.failedCloseOutJobs) {
    const cause = extractCloseOutCause(job);
    const evidence: DecisionEvidence[] = [{ label: "Task", href: taskLink(job.taskId) }];
    if (job.logPath) {
      evidence.push({ label: "Close-out log", path: job.logPath });
    }
    const item: DecisionDigestItem = {
      id: `close-out-failed:${job.taskId}:${job.failedAt ?? "latest"}`,
      kind: "close-out-failed",
      taskId: job.taskId,
      title: job.taskTitle,
      cause,
      evidence,
      actions: actionsForCloseOutFailure(job, input.config),
      at: job.failedAt ?? generatedAt,
      link: taskLink(job.taskId),
    };
    if (itemRequiresHumanDecision(item, paused)) pushItem(items, item);
  }

  for (const run of input.silentRuns) {
    const item: DecisionDigestItem = {
      id: `stuck-run:${run.taskId}`,
      kind: "stuck-run",
      taskId: run.taskId,
      title: run.taskTitle,
      cause: {
        headline: "Agent output has gone quiet while the process is still running",
        detail: run.detail,
      },
      evidence: [{ label: "Task", href: taskLink(run.taskId) }],
      actions: actionsForStuckRun(input.config),
      at: run.lastOutputAt ?? generatedAt,
      link: taskLink(run.taskId),
    };
    if (itemRequiresHumanDecision(item, paused)) pushItem(items, item);
  }

  if (input.releaseRun?.state === "failed") {
    const item: DecisionDigestItem = {
      id: `release:${input.releaseRun.startedAt ?? "failed"}`,
      kind: "release",
      taskId: null,
      title: "Release failed",
      cause: { headline: input.releaseRun.message || "Release pipeline failed" },
      evidence: [{ label: "Releases", href: "/releases" }],
      actions: [{ id: "open-releases", label: "Open Releases", policyAutomatic: false }],
      at: input.releaseRun.startedAt ?? generatedAt,
      link: "/releases",
    };
    pushItem(items, item);
  }

  for (const pf of input.providerFailures) {
    const item: DecisionDigestItem = {
      id: `owner-config:${pf.id}`,
      kind: "owner-config",
      taskId: pf.taskId,
      title: pf.message,
      cause: { headline: pf.detail || "Provider or billing error" },
      evidence: [
        { label: "Settings → Agents", href: "/agents" },
        ...(pf.taskId ? [{ label: "Task", href: taskLink(pf.taskId) }] : []),
      ],
      actions: [
        {
          id: "fix-provider",
          label: "Fix provider credentials or billing",
          policyAutomatic: false,
        },
      ],
      at: pf.at,
      link: pf.taskId ? taskLink(pf.taskId) : "/agents",
    };
    pushItem(items, item);
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    generatedAt,
    automationPaused: paused,
    approvalEnabled: approvalEnabled(input.config),
    items,
  };
}
