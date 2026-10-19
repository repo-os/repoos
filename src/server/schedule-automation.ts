import { isLinkedWorktreeRoot } from "../core/config.js";
import type { RepoOSConfig } from "../core/types.js";

export type ScheduleHostileReason =
  | "disabled"
  | "vitest"
  | "preview-child"
  | "preview-overrides"
  | "linked-worktree"
  | "ephemeral-port";

/**
 * Environments where creating tasks from schedules (tick or Run now) must never
 * run — previews, task worktrees, harness ephemeral servers, and preview
 * config overlays.
 */
export function scheduleHostileReason(
  config: RepoOSConfig,
  env: NodeJS.ProcessEnv = process.env,
  servePort?: number,
): ScheduleHostileReason | null {
  if (env.REPOOS_PREVIEW_CHILD === "1") return "preview-child";
  if ((config.previewOverrides?.length ?? 0) > 0) return "preview-overrides";
  if (isLinkedWorktreeRoot(config.root)) return "linked-worktree";
  if (servePort === 0) return "ephemeral-port";
  return null;
}

/** True when automatic minute ticks and boot catch-up may run. */
export function shouldRunScheduledTaskAutomation(
  config: RepoOSConfig,
  env: NodeJS.ProcessEnv = process.env,
  servePort?: number,
): boolean {
  if (!config.scheduledTasks?.enabled) return false;
  if (env.VITEST === "true") return false;
  return scheduleHostileReason(config, env, servePort) === null;
}

/** True when Run now / CLI run may create a task (still requires control-plane host). */
export function mayExecuteScheduleRun(
  config: RepoOSConfig,
  env: NodeJS.ProcessEnv = process.env,
  servePort?: number,
): boolean {
  return scheduleHostileReason(config, env, servePort) === null;
}

export function scheduleRunRefusalMessage(reason: ScheduleHostileReason): string {
  switch (reason) {
    case "disabled":
      return "Scheduled task automation is disabled in Settings";
    case "vitest":
      return "Scheduled tasks do not run under the test harness";
    case "preview-child":
      return "Scheduled tasks do not run on preview servers";
    case "preview-overrides":
      return "Scheduled tasks do not run while preview configuration overrides are active";
    case "linked-worktree":
      return "Scheduled tasks do not run from a linked task worktree";
    case "ephemeral-port":
      return "Scheduled tasks do not run on ephemeral test servers";
    default:
      return "Scheduled tasks cannot run in this environment";
  }
}
