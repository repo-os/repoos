/**
 * Engineer WIP checkpoint commits created during remote/managed self-checks (#0694).
 * Close-out treats post-handoff drift that is ONLY these commits as recoverable (#0834).
 */

/** Exact message `commitWipCheckpointForRemoteGate` uses — do not widen without a test. */
export function engineerSelfCheckCheckpointMessage(taskId: string): string {
  return `WIP: engineer self-check checkpoint (#${taskId})`;
}

/** True when `subject` is the managed engineer self-check checkpoint for this task. */
export function isEngineerSelfCheckCheckpointMessage(subject: string, taskId: string): boolean {
  return subject.trim() === engineerSelfCheckCheckpointMessage(taskId);
}
