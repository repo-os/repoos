/**
 * Whether a handoff finalization slot is genuinely in flight (#1085).
 * Lives outside handoff-status.ts to avoid a load cycle through handoff.ts.
 */
import type { RepoOSConfig } from "../core/types.js";
import type { AgentRunner } from "./agents.js";
import { isPostHandoffCheckpointRecoveryActive } from "./post-handoff-checkpoint-recovery.js";

export function handoffProcessLive(
  config: RepoOSConfig,
  taskId: string,
  runner: Pick<AgentRunner, "isHandoffInFlight" | "hasPendingHandoff">,
): boolean {
  return (
    runner.isHandoffInFlight(taskId) ||
    runner.hasPendingHandoff(taskId) ||
    isPostHandoffCheckpointRecoveryActive(config, taskId)
  );
}
