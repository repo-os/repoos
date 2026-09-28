import type { Task } from "../../core/types.js";
import type { NotificationKind } from "./types.js";
import { notificationForIntegrationFailed, notificationForServerFailed } from "./spec.js";
import type { NotificationSpec } from "./format.js";

export interface ProgressFailureNotification {
  kind: NotificationKind;
  spec: NotificationSpec;
  summary: string;
}

/**
 * Map a terminal `task.progress` step to a failure notification.
 * Handoff finalization prefixes steps with `handoff:`; close-out emits bare `failed`.
 * Bare `failed` while the task is still `active` is treated as handoff/server failure.
 */
export function progressFailureNotification(
  task: Task,
  step: string,
  detail?: string,
): ProgressFailureNotification | null {
  const text = detail?.trim() || "";
  if (step === "handoff:failed" || (step === "failed" && task.status === "active")) {
    const spec = notificationForServerFailed(text);
    return {
      kind: "task.server_failed",
      spec,
      summary: text || spec.subtitle || "",
    };
  }
  if (step === "failed") {
    const spec = notificationForIntegrationFailed(text);
    return {
      kind: "task.integration_failed",
      spec,
      summary: text || spec.subtitle || "",
    };
  }
  return null;
}
