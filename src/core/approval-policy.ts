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

/**
 * Repo-relative path prefixes whose change keeps a task on the human path
 * (#0727). Deliberately conservative — the machinery an auto-approval must not
 * silently rewrite: the server/engine, the CLI, the close-out hooks, the config
 * that governs the policy itself, the agent contract, and architecture records.
 */
export const DEFAULT_APPROVAL_MACHINERY_PATHS = [
  "src/server/",
  "src/core/",
  "src/cli/",
  "src/commands/",
  ".githooks/",
  "repoos.toml",
  "AGENTS.md",
  "docs/adr/",
];

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
  | "blocked-paths"
  | "p0-needs-human"
  | "main-dirty"
  | "branch-conflict"
  | "branch-missing"
  | "handoff-drift";

export interface ApprovalPolicyInput {
  task: Task;
  /** Stored reviewer report markdown. */
  reviewMarkdown: string;
  /** True when `preflightMerge` failed for any reason (conflicts or otherwise). */
  mergePreflightFailed?: boolean;
  /** True when the branch ref no longer exists locally. */
  branchMissing?: boolean;
  /** True when handoff snapshot / worktree integrity check failed. */
  handoffDrift?: boolean;
  /** At least one handoff screenshot on disk with no `shots: failed` activity note. */
  uiVisualEvidenceOk?: boolean;
  /** Repo-relative paths the branch changes vs its merge-base with main. */
  changedPaths?: string[] | null;
  /** True when the primary checkout has uncommitted files. */
  mainDirty?: boolean;
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

function resolveMachineryPaths(config: RepoOSConfig): string[] {
  const fromCfg = config.approval?.autoApprove?.machineryPaths;
  if (fromCfg?.length) return fromCfg.map((p) => p.trim()).filter(Boolean);
  return DEFAULT_APPROVAL_MACHINERY_PATHS;
}

/**
 * True when any changed path falls under a machinery prefix. File-boundary
 * aware: `repoos.toml` matches the file, not `repoos.tomlx`, while a trailing
 * `/` prefix matches everything beneath the directory.
 */
export function pathIsMachinery(path: string, machineryPaths: string[]): boolean {
  const normalized = path.trim().replace(/^\.\//, "");
  return machineryPaths.some((prefix) => {
    if (prefix.endsWith("/")) return normalized.startsWith(prefix);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
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
  config: Pick<RepoOSConfig, "approval" | "automation">,
  input: ApprovalPolicyInput,
): ApprovalPolicyResult {
  const policy = resolvedApprovalConfig(config);
  if (config.automation?.paused === true) {
    return { eligible: false, reason: "disabled" };
  }
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

  // A p0 is a release- or incident-class change: it needs a human regardless of
  // area/type, unless the owner opts in explicitly (#0727).
  if (String(task.priority ?? "").toLowerCase() === "p0" && policy.autoApprove?.allowP0 !== true) {
    return { eligible: false, reason: "p0-needs-human" };
  }

  const configuredAreas = policy.autoApprove?.areas ?? [];
  const configuredTypes = policy.autoApprove?.types ?? [];
  if (configuredAreas.length === 0 && configuredTypes.length === 0) {
    return { eligible: false, reason: "no-rule-match" };
  }

  const areaRule = matchesAreaRule(task, configuredAreas);
  const typeRule = matchesTypeRule(task, configuredTypes);
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

  const machinery = resolveMachineryPaths(config as RepoOSConfig);
  // Fail closed: when the preflight could not read the branch's paths, do not
  // silently treat it as "no machinery touched".
  if (input.changedPaths === null) {
    return { eligible: false, reason: "blocked-paths" };
  }
  if (input.changedPaths?.some((p) => pathIsMachinery(p, machinery))) {
    return { eligible: false, reason: "blocked-paths" };
  }

  if (input.branchMissing) {
    return { eligible: false, reason: "branch-missing" };
  }
  if (input.mergePreflightFailed) {
    return { eligible: false, reason: "branch-conflict" };
  }
  if (input.handoffDrift) {
    return { eligible: false, reason: "handoff-drift" };
  }
  if (input.mainDirty) {
    return { eligible: false, reason: "main-dirty" };
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
