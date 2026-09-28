import type { Status } from "../../core/types.js";
import type { NotificationSpec } from "./format.js";

/**
 * Build a notification spec for a status transition, or null if no notification applies.
 * For ready → active, returns "Started" (lower severity to avoid noise).
 * For active/review → done, returns "Done" (lower severity).
 * Other transitions do not currently trigger ntfy notifications.
 */
export function notificationForStatusChange(prev: Status, next: Status): NotificationSpec | null {
  if (prev === "ready" && next === "active") {
    return { headline: "▶️ Started", severity: "low" };
  }
  if ((prev === "active" || prev === "review") && next === "done") {
    return { headline: "✅ Done", severity: "low" };
  }
  return null;
}

export function notificationForTaskCreated(): NotificationSpec {
  return { headline: "🆕 New", severity: "low" };
}

export function notificationForNeedsInput(): NotificationSpec {
  return {
    headline: "🙋 Needs you",
    severity: "high",
    subtitle: "Agent is waiting for your decision",
  };
}

export function notificationForMovedToReview(): NotificationSpec {
  return { headline: "👀 In review", severity: "normal" };
}

export function notificationForReviewFeedback(): NotificationSpec {
  return {
    headline: "📝 Review ready",
    severity: "normal",
    subtitle: "Agent review feedback is available",
  };
}

export function notificationForIntegrationFailed(detail?: string): NotificationSpec {
  return {
    headline: "⚠️ Merge failed",
    severity: "high",
    subtitle: detail?.trim() || "Close-out or integration failed",
  };
}

export function notificationForAgentFailed(detail?: string): NotificationSpec {
  return {
    headline: "❌ Agent failed",
    severity: "high",
    subtitle: detail?.trim() || "The agent run ended with an error",
  };
}

export function notificationForServerFailed(detail?: string): NotificationSpec {
  return {
    headline: "🛑 Server failed",
    severity: "high",
    subtitle: detail?.trim() || "Handoff or server finalization failed",
  };
}

/**
 * A clean agent turn ended and nothing else took over — the task sits `active`
 * with no live turn (#0542). Deliberately quiet: it is the "the agent finished,
 * what next?" moment, not an alarm.
 */
export function notificationForAgentCompleted(): NotificationSpec {
  return {
    headline: "🏁 Agent finished",
    severity: "low",
    subtitle: "The agent finished its turn; the task is still active",
  };
}

/**
 * The task branch diverged from `main` and a sync could not resolve it
 * (`needs_merge`) — the agent cannot cleanly continue until it resolves (#0542).
 */
export function notificationForMergeConflict(): NotificationSpec {
  return {
    headline: "🔀 Merge conflict",
    severity: "high",
    subtitle: "Task branch conflicts with main — resolve the sync",
  };
}
