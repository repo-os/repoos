/**
 * CTO safe action allowlist (#0688): named, bounded server actions the CTO (or
 * the UI) may invoke when listed in `cto.actions`.
 */
import type { RepoOSConfig } from "./types.js";

/** Every action id the server implements. */
export const CTO_SAFE_ACTION_IDS = [
  "restart-stalled-agent",
  "refresh-main-install",
  "requeue-closeout-after-env-fix",
  "kill-hung-validation",
] as const;

export type CtoSafeActionId = (typeof CTO_SAFE_ACTION_IDS)[number];

const ACTION_SET = new Set<string>(CTO_SAFE_ACTION_IDS);

export function isCtoSafeActionId(id: string): id is CtoSafeActionId {
  return ACTION_SET.has(id);
}

/** Per-action hourly rate limits (global or per task scope). */
export const CTO_ACTION_RATE_LIMITS: Record<
  CtoSafeActionId,
  { maxPerHour: number; scope: "global" | "task" }
> = {
  "restart-stalled-agent": { maxPerHour: 6, scope: "task" },
  "refresh-main-install": { maxPerHour: 4, scope: "global" },
  "requeue-closeout-after-env-fix": { maxPerHour: 6, scope: "task" },
  // A hung run is killed once per task and retried elsewhere (#0729); a
  // task-scoped cap lets a genuinely broken branch be retried a few times
  // before the CTO escalates rather than looping the kill forever.
  "kill-hung-validation": { maxPerHour: 6, scope: "task" },
};

/** Minimal shape of a dead-session classification; mirrors task-watchdog. */
export interface CtoDeadAgentClassification {
  kind: "never-started" | "crashed" | "exited-without-handoff";
  reason: string;
}

/**
 * Restart strategy for a dead engineer (#0727): resume keeps the conversation,
 * fresh abandons it. A network stall or an interrupted turn is a resumed
 * conversation; a degenerate loop — the same session ending without a handoff
 * again and again — only escapes by starting over.
 */
export type CtoRestartStrategy = "resume" | "fresh";

/** How many CTO restarts of one task earn a fresh session. */
export const CTO_FRESH_SESSION_RESTART_THRESHOLD = 2;

/**
 * Choose resume vs fresh for a dead active engineer. `priorRestarts` counts the
 * CTO restarts already recorded for the task this episode. A never-started
 * session, a stall/timeout or an interrupted turn resumes — but once a task has
 * already been restarted to the threshold it starts fresh regardless, so a
 * repeat stall that is really a loop still gets a new conversation (#0727).
 * Every other death (a real crash, an exit without handoff) starts fresh.
 */
export function decideRestartStrategy(
  classification: Pick<CtoDeadAgentClassification, "kind" | "reason">,
  priorRestarts: number,
): CtoRestartStrategy {
  if (priorRestarts >= CTO_FRESH_SESSION_RESTART_THRESHOLD) return "fresh";
  if (classification.kind === "never-started") return "resume";
  const r = classification.reason.toLowerCase();
  if (/timeout|stall|hung|hang|busy|interrupted|network/.test(r)) return "resume";
  return "fresh";
}

export function configuredCtoActions(config: RepoOSConfig): CtoSafeActionId[] {
  const raw = config.cto?.actions ?? [];
  const out: CtoSafeActionId[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && isCtoSafeActionId(entry) && !out.includes(entry)) {
      out.push(entry);
    }
  }
  return out;
}

export function isCtoActionAllowlisted(config: RepoOSConfig, action: CtoSafeActionId): boolean {
  return configuredCtoActions(config).includes(action);
}

/** Human-readable labels for Settings and the attention bell. */
export const CTO_ACTION_LABELS: Record<CtoSafeActionId, string> = {
  "restart-stalled-agent": "Restart stalled engineer",
  "refresh-main-install": "Refresh install in main",
  "requeue-closeout-after-env-fix": "Re-queue close-out after env fix",
  "kill-hung-validation": "Kill hung validation run",
};

/**
 * Pure rate-limit check: `recent` is ISO timestamps within the last hour for
 * this action's scope key.
 */
export function ctoActionRateLimitExceeded(action: CtoSafeActionId, recentCount: number): boolean {
  const limit = CTO_ACTION_RATE_LIMITS[action].maxPerHour;
  return recentCount >= limit;
}

export function ctoActionRateScopeKey(action: CtoSafeActionId, taskId: string | null): string {
  const spec = CTO_ACTION_RATE_LIMITS[action];
  if (spec.scope === "global") return "global";
  return taskId ?? "global";
}

/** Activity-log marker the `restart-stalled-agent` safe action writes. */
export const CTO_RESTART_ACTIVITY_MARKER = /CTO action: restart-stalled-agent/;

/**
 * How many times the CTO has already restarted this task's engineer in the
 * current active episode — counted from the most recent `status →active`
 * transition, so a task restarted, resolved and restarted again gets a fresh
 * budget (#0727). Mirrors the scoped-marker scans in `task-watchdog.ts`.
 */
export function countCtoRestartsThisEpisode(body: string): number {
  const lines = body.split("\n");
  const activityIndex = lines.findIndex((line) => line.trim() === "## Activity");
  if (activityIndex === -1) return 0;
  let count = 0;
  for (let i = lines.length - 1; i > activityIndex; i--) {
    const line = lines[i];
    if (CTO_RESTART_ACTIVITY_MARKER.test(line)) count++;
    if (/^- \d{4}-\d{2}-\d{2}T\S+ · status [a-z_]+→active\b/.test(line)) break;
  }
  return count;
}
