/**
 * Hover popover copy for agent / state recency on board and pipeline cards (#1058).
 * Inline labels drop noisy "active N ago" suffixes; this module formats what the
 * shared `data-tip` tooltip shows instead (lib/tooltip.ts).
 */

import { formatPipelineElapsed } from "../../../core/pipeline-view.js";
import { formatActivity } from "./retryHints.js";
import { fmtFullDateTime, relTime } from "./time.js";

/** Combine an optional activity line with the hint's explanatory title. */
export function cardHintDataTip(title: string, activityTip?: string | null): string {
  if (activityTip?.trim()) return `${activityTip.trim()}\n${title}`;
  return title;
}

/** Prefer the newest usable timestamp; malformed telemetry must not mask a fallback. */
export function firstValidActivityTimestamp(
  ...timestamps: Array<string | null | undefined>
): string | undefined {
  for (const value of timestamps) {
    if (value && Number.isFinite(Date.parse(value))) return value;
  }
  return undefined;
}

/** Last engineer output — "Active 3m ago" plus the local timestamp. */
export function agentLastActivityTip(lastAt: string | undefined, nowMs: number): string | null {
  const activity = formatActivity(nowMs, lastAt);
  if (!activity) return null;
  const headline = activity === "just now" ? "Active just now" : `Active ${activity}`;
  const stamp = fmtFullDateTime(lastAt);
  return stamp ? `${headline}\n${stamp}` : headline;
}

/** Pipeline card / state elapsed — how long the row has been in this state. */
export function stateElapsedTip(
  prefix: string,
  sinceIso: string | null | undefined,
  nowMs: number,
): string | null {
  if (!sinceIso || !Number.isFinite(Date.parse(sinceIso))) return null;
  const compact = formatPipelineElapsed(sinceIso, nowMs);
  if (compact === "—") return null;
  const headline = compact === "just now" ? `${prefix} just now` : `${prefix} for ${compact}`;
  const rel = relTime(sinceIso, new Date(nowMs));
  const stamp = fmtFullDateTime(sinceIso);
  const ageLine = rel !== "unknown" ? rel : null;
  const lines = [headline, ageLine, stamp].filter((line): line is string => !!line?.trim());
  return lines.length ? lines.join("\n") : null;
}
