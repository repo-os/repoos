import type { DependencyBlocker } from "../types";
import { shallowRef } from "vue";

export function dependencyBlockerLabel(blocker: DependencyBlocker): string {
  return blocker.state === "cancelled"
    ? `Blocked by cancelled task #${blocker.id}; needs a human`
    : `Blocked by #${blocker.id}`;
}

/** One app-level dialog serves every route that can start blocked work. */
export const dependencyOverrideBlockers = shallowRef<DependencyBlocker[] | null>(null);
let resolveOverride: ((confirmed: boolean) => void) | null = null;

export function confirmDependencyOverride(
  blockers: DependencyBlocker[] | undefined,
): Promise<boolean> {
  if (!blockers?.length) return Promise.resolve(false);
  // A new request supersedes an older one without leaving its caller waiting.
  resolveDependencyOverride(false);
  dependencyOverrideBlockers.value = [...blockers];
  return new Promise((resolve) => {
    resolveOverride = resolve;
  });
}

export function resolveDependencyOverride(confirmed: boolean): void {
  dependencyOverrideBlockers.value = null;
  const resolve = resolveOverride;
  resolveOverride = null;
  resolve?.(confirmed);
}
