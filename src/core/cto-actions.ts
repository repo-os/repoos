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
};

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
