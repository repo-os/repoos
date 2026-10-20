import { fireDueReminders } from "../core/reminders.js";
import type { RepoOSConfig } from "../core/types.js";
import type { RepoEvent } from "./live-index.js";
import { scheduleHostileReason } from "./schedule-automation.js";

export function shouldRunReminderAutomation(
  config: RepoOSConfig,
  env: NodeJS.ProcessEnv = process.env,
  port?: number,
): boolean {
  return env.VITEST !== "true" && scheduleHostileReason(config, env, port) === null;
}

export function runReminderTick(
  config: RepoOSConfig,
  emit: (event: RepoEvent) => void,
  env: NodeJS.ProcessEnv = process.env,
  port?: number,
): void {
  if (!shouldRunReminderAutomation(config, env, port)) return;
  if (fireDueReminders(config).length)
    emit({ type: "reminder.changed", at: new Date().toISOString() });
}
