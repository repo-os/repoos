/**
 * Opt-in approval policy (#0686): decide whether a task in `review` with a clean
 * reviewer verdict may Move to done without a human click. Default is off.
 */
import { parseTaskAreas } from "./areas.js";
import type { ApprovalConfig, RepoOSConfig, Task } from "./types.js";
import { reviewReportHasBlockingBugs } from "./review-report-sections.js";
import { parseReviewVerdict } from "./review-verdict.js";

/** Default area names treated as UI — never auto-approved without visual evidence. */
export const DEFAULT_APPROVAL_UI_AREAS = ["web", "ui", "ui-app", "frontend", "mobile"];

export type ApprovalPolicyRejectReason =
  | "disabled"
  | "human-only"
  | "not-in-review"
  | "needs-input"
  | "no-rule-match"
  | "verdict-not-clean"
  | "blocking-bugs"
  | "gate-not-green"
  | "ui-without-visual-evidence"
  | "branch-conflict"
  | "branch-missing"
  | "handoff-drift";

export interface ApprovalPolicyInput {
  task: Task;
  /** Stored reviewer report markdown. */
  reviewMarkdown: string;
  /** True when `preflightMerge` reported unresolved conflicts. */
  mergeConflicts?: boolean;
  /** True when the branch ref no longer exists locally. */
  branchMissing?: boolean;
  /** True when handoff snapshot / worktree integrity check failed. */
  handoffDrift?: boolean;
  /** At least one handoff screenshot on disk with no `shots: failed` activity note. */
  uiVisualEvidenceOk?: boolean;
}

export interface ApprovalPolicyResult {
  eligible: boolean;
  /** When eligible, names the rule for the audit trail, e.g. `area:api`. */
  rule?: string;
  reason?: ApprovalPolicyRejectReason;
}

function normalizedTags(task: Task): string[] {
  return (task.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function resolveUiAreas(config: RepoOSConfig): string[] {
  const fromCfg = config.approval?.autoApprove?.uiAreas;
  if (fromCfg?.length) return fromCfg.map((a) => a.trim().toLowerCase()).filter(Boolean);
  return DEFAULT_APPROVAL_UI_AREAS;
}

function taskTouchesUiArea(task: Task, uiAreas: string[]): boolean {
  const taskAreas = parseTaskAreas(task.area ?? task.areas).map((a) => a.toLowerCase());
  return taskAreas.some((a) => uiAreas.includes(a));
}

function matchesAreaRule(task: Task, areas: string[] | undefined): string | null {
  if (!areas?.length) return null;
  const allowed = new Set(areas.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const hit = parseTaskAreas(task.area ?? task.areas).find((a) => allowed.has(a.toLowerCase()));
  return hit ? `area:${hit}` : null;
}

function matchesTypeRule(task: Task, types: string[] | undefined): string | null {
  if (!types?.length) return null;
  const allowed = new Set(types.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const t = (task.type ?? "").trim().toLowerCase();
  if (!t || !allowed.has(t)) return null;
  return `type:${task.type.trim()}`;
}

/** Resolved `[approval]` with defaults applied. */
export function resolvedApprovalConfig(
  config: Pick<RepoOSConfig, "approval">,
): Required<Pick<ApprovalConfig, "enabled">> & ApprovalConfig {
  const raw = config.approval ?? {};
  return {
    enabled: raw.enabled === true,
    autoApprove: raw.autoApprove,
  };
}

export function evaluateApprovalPolicy(
  config: Pick<RepoOSConfig, "approval">,
  input: ApprovalPolicyInput,
): ApprovalPolicyResult {
  const policy = resolvedApprovalConfig(config);
  if (!policy.enabled) {
    return { eligible: false, reason: "disabled" };
  }

  const { task, reviewMarkdown } = input;
  if (normalizedTags(task).includes("human-only")) {
    return { eligible: false, reason: "human-only" };
  }
  if (task.status !== "review") {
    return { eligible: false, reason: "not-in-review" };
  }
  if (task.needsInput) {
    return { eligible: false, reason: "needs-input" };
  }

  const areaRule = matchesAreaRule(task, policy.autoApprove?.areas);
  const typeRule = matchesTypeRule(task, policy.autoApprove?.types);
  if (!areaRule && !typeRule) {
    return { eligible: false, reason: "no-rule-match" };
  }

  const verdict = parseReviewVerdict(reviewMarkdown);
  if (verdict !== "good to go") {
    return { eligible: false, reason: "verdict-not-clean" };
  }
  if (reviewReportHasBlockingBugs(reviewMarkdown)) {
    return { eligible: false, reason: "blocking-bugs" };
  }

  const lastFailure = task.extra?.last_check_failure;
  if (typeof lastFailure === "string" && lastFailure.trim()) {
    return { eligible: false, reason: "gate-not-green" };
  }

  if (input.branchMissing) {
    return { eligible: false, reason: "branch-missing" };
  }
  if (input.mergeConflicts) {
    return { eligible: false, reason: "branch-conflict" };
  }
  if (input.handoffDrift) {
    return { eligible: false, reason: "handoff-drift" };
  }

  const uiAreas = resolveUiAreas(config as RepoOSConfig);
  if (taskTouchesUiArea(task, uiAreas)) {
    if (!input.uiVisualEvidenceOk) {
      return { eligible: false, reason: "ui-without-visual-evidence" };
    }
  }

  const parts = [areaRule, typeRule].filter(Boolean) as string[];
  return { eligible: true, rule: parts.join(", ") };
}

/** True when activity notes record a failed handoff capture. */
export function taskBodyHasShotFailure(taskBody: string | undefined): boolean {
  if (!taskBody) return false;
  return /· note: shots: failed —/m.test(taskBody);
}
