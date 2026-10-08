/**
 * Serialize handoff UI verification so only one run holds the single preview
 * slot at a time (#0743). Concurrent handoffs queue instead of evicting each
 * other's preview mid-capture.
 */
import type { LogLevel } from "../core/logger.js";

type TaskLog = (taskId: string, level: LogLevel, message: string) => void;

let holder: string | null = null;
const waiters: Array<{ taskId: string; resolve: () => void }> = [];

/** Test hook: reset queue state between unit tests. */
export function resetPreviewVerificationSlot(): void {
  holder = null;
  waiters.splice(0);
}

async function acquire(taskId: string, log: TaskLog): Promise<void> {
  if (holder === null || holder === taskId) {
    holder = taskId;
    return;
  }
  log(taskId, "info", `ui verification: waiting for the preview slot (held by task #${holder})`);
  await new Promise<void>((resolve) => {
    waiters.push({ taskId, resolve });
  });
  holder = taskId;
}

function release(taskId: string): void {
  if (holder !== taskId) return;
  const next = waiters.shift();
  holder = next?.taskId ?? null;
  next?.resolve();
}

export async function withPreviewVerificationSlot<T>(
  taskId: string,
  log: TaskLog,
  fn: () => Promise<T>,
): Promise<T> {
  await acquire(taskId, log);
  try {
    return await fn();
  } finally {
    release(taskId);
  }
}
