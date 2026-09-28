import type { RepoOSConfig, Status } from "../../core/types.js";

/** Portable urgency — map to provider-specific headers inside each adapter. */
export type NotificationSeverity = "background" | "low" | "normal" | "high" | "urgent";

export type NotificationKind =
  | "task.created"
  | "task.started"
  | "task.needs_input"
  | "task.agent_completed"
  | "task.moved_to_review"
  | "task.review_feedback"
  | "task.integration_failed"
  | "task.agent_failed"
  | "task.done";

export interface NotificationAction {
  label: string;
  url: string;
}

/**
 * Shared notification content built once per event. Providers render this
 * shape rather than duplicating headline/summary/link logic.
 */
export interface NotificationPayload {
  kind: NotificationKind;
  severity: NotificationSeverity;
  repositoryName: string;
  taskId: string;
  taskTitle: string;
  status: Status;
  summary: string;
  /** Absolute or app-relative deep link into the web UI. */
  link: string;
  /** Scannable one-line headline (emoji + short verb), e.g. "▶️ Started". */
  headline: string;
  /** Optional second line (e.g. needs-input detail). */
  subtitle?: string;
  actions?: NotificationAction[];
}

export interface NotificationProvider {
  readonly id: string;
  isEnabled(ctx: NotificationDispatchContext): boolean;
  /** Fire-and-forget delivery. Must never throw. */
  deliver(ctx: NotificationDispatchContext, payload: NotificationPayload): void;
}

export interface NotificationDispatchContext {
  config: RepoOSConfig;
  /** Control-plane origin when known (e.g. `http://127.0.0.1:7171`). */
  publicOrigin?: string;
  authStore: import("../../core/auth-store.js").AuthStore | null;
  fetch?: typeof fetch;
}
