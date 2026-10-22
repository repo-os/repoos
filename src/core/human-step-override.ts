import type { RepoOSConfig, Task } from "./types.js";
import { needsHumanStepFingerprint } from "./task-underspecified.js";

/** Default reason recorded when a human clears the flag without a custom override. */
export const HUMAN_STEP_CLEARED_OVERRIDE_REASON =
  "Cleared needs-human-step flag (sticky until acceptance criteria change)";

/** True when sticky overrides are enabled (default on). */
export function humanStepStickyEnabled(config: RepoOSConfig): boolean {
  return config.modelRouting?.humanStepSticky !== false;
}

/**
 * Whether a stored human-step override still suppresses the keyword/model flag
 * for this body (#0909). Legacy overrides without a fingerprint keep working.
 */
export function humanStepOverrideSuppresses(
  config: RepoOSConfig,
  task: Pick<Task, "body" | "humanStepOverride" | "humanStepOverrideKey">,
): boolean {
  if (!task.humanStepOverride && !task.humanStepOverrideKey) return false;
  if (!humanStepStickyEnabled(config)) {
    return Boolean(task.humanStepOverride);
  }
  const fingerprint = needsHumanStepFingerprint(task.body);
  if (!task.humanStepOverrideKey) {
    return Boolean(task.humanStepOverride);
  }
  return task.humanStepOverrideKey === fingerprint;
}

/** Frontmatter fields to write when a human clears a `needs-human-step` flag. */
export function stickyHumanStepClearFields(
  config: RepoOSConfig,
  task: Pick<Task, "body" | "humanStepOverride">,
  actor?: string,
): {
  humanStepOverride: string;
  humanStepOverrideKey: string;
  humanStepOverrideBy?: string;
} | null {
  if (!humanStepStickyEnabled(config)) return null;
  const fingerprint = needsHumanStepFingerprint(task.body);
  return {
    humanStepOverride: task.humanStepOverride ?? HUMAN_STEP_CLEARED_OVERRIDE_REASON,
    humanStepOverrideKey: fingerprint,
    ...(actor ? { humanStepOverrideBy: actor } : {}),
  };
}
