/**
 * Optional ntfy push notifications for task lifecycle events (#0161).
 *
 * Implementation lives in `notifications/` (#0537); this module keeps the
 * historical import path and re-exports the shared format helpers.
 */
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { getAuthStore } from "../core/auth-store.js";
import {
  formatNotification,
  notificationForStatusChange,
  notificationForTaskCreated,
  notificationForNeedsInput,
  notificationContextFromConfig,
  notifyStatusChange as dispatchStatusChange,
  notifyTaskCreated as dispatchTaskCreated,
  notifyNeedsInput as dispatchNeedsInput,
  ntfyBaseUrl,
  publishNtfyRaw,
} from "./notifications/index.js";
import type { NotificationSeverity } from "./notifications/types.js";

export {
  formatNotification,
  notificationForStatusChange,
  notificationForTaskCreated,
  notificationForNeedsInput,
  ntfyBaseUrl,
};
export type { NotificationSpec } from "./notifications/format.js";

type LegacyNtfyPriority = "min" | "low" | "default" | "high" | "max";

const LEGACY_PRIORITY_TO_SEVERITY: Record<LegacyNtfyPriority, NotificationSeverity> = {
  min: "background",
  low: "low",
  default: "normal",
  high: "high",
  max: "urgent",
};

function dispatchContext(config: RepoOSConfig) {
  return notificationContextFromConfig(config, getAuthStore(config.root));
}

/** Best-effort publish of a message to the configured topic. Never throws. */
export function publish(
  config: RepoOSConfig,
  message: string,
  priority: LegacyNtfyPriority = "default",
): void {
  publishNtfyRaw(config, message, LEGACY_PRIORITY_TO_SEVERITY[priority] ?? "normal");
}

export function notifyStatusChange(
  config: RepoOSConfig,
  task: Task,
  prev: Status,
  next: Status,
): void {
  dispatchStatusChange(dispatchContext(config), task, prev, next);
}

export function notifyTaskCreated(config: RepoOSConfig, task: Task): void {
  dispatchTaskCreated(dispatchContext(config), task);
}

export function notifyNeedsInput(config: RepoOSConfig, task: Task): void {
  dispatchNeedsInput(dispatchContext(config), task);
}
