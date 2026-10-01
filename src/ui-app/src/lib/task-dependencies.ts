import type { DependencyBlocker } from "../types";

export function dependencyBlockerLabel(blocker: DependencyBlocker): string {
  return blocker.state === "cancelled"
    ? `Blocked by cancelled task #${blocker.id}; needs a human`
    : `Blocked by #${blocker.id}`;
}

export function confirmDependencyOverride(blockers: DependencyBlocker[] | undefined): boolean {
  if (!blockers?.length) return false;
  const reason = blockers.map(dependencyBlockerLabel).join("\n");
  return window.confirm(`${reason}\n\nStart anyway? The required changes may not be on main yet.`);
}
