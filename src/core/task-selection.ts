/**
 * Deterministic task selection for auto-engineering (#0690).
 *
 * When the dependency graph is explicit, "which ready task next?" is almost
 * mechanical: priority first, then how much downstream work a task unblocks
 * (its critical-path weight), then creation order. This module owns that
 * ordering as a PURE function so it can be unit-tested without git, the
 * filesystem or a model, and so the default dispatch path costs nothing and
 * never becomes non-deterministic.
 *
 * The judgment that is genuinely worth a model — planning the graph, and
 * avoiding two tasks that touch the same files — is the optional PM veto in
 * `src/server/auto-engineering.ts`, layered on top of this ordering.
 */
import type { Priority, Status, Task } from "./types.js";
import { PRIORITIES } from "./types.js";

/** A pair of candidates that would probably collide if started together. */
export interface TaskConflict {
  a: string;
  b: string;
  /** Human-readable reason, e.g. `share area "web"` or `share path "src/x.ts"`. */
  reason: string;
}

/** Why one task outranks another, for decision records and tests. */
export interface SelectionResult {
  /** Every eligible task id, in deterministic order (all candidates). */
  eligible: string[];
  /** The top `availableSlots` ids — the deterministic default selection. */
  selected: string[];
  /** Conflicts among the eligible candidates (empty when none collide). */
  conflicts: TaskConflict[];
}

export interface SelectionOptions {
  /** How many tasks may be started now. */
  availableSlots: number;
  /**
   * Ids that are NOT yet eligible because a `dependsOn` prerequisite has not
   * merged. The orchestrator computes this with the git-aware
   * `taskDependencyBlockers`; the selection itself stays pure.
   */
  blockedIds?: ReadonlySet<string>;
}

/** Numeric rank of a priority (p0 highest). Unknown values sort last. */
export function priorityRank(priority: Priority | string): number {
  const index = (PRIORITIES as readonly string[]).indexOf(priority);
  return index === -1 ? PRIORITIES.length : index;
}

/**
 * A task's areas, normalized to a lower-cased set. Reads the canonical `areas`
 * list when present and falls back to the comma-joined `area` string, so a
 * partially-constructed Task still conflicts correctly. `general` (the
 * unspecified default) is dropped — two tasks with no declared area are not in
 * conflict just because both say "general".
 */
export function taskAreaSet(task: Task): Set<string> {
  const raw = task.areas?.length ? task.areas : (task.area ?? "").split(",");
  const areas = new Set<string>();
  for (const value of raw) {
    const area = value.trim().toLowerCase();
    if (area && area !== "general") areas.add(area);
  }
  return areas;
}

/**
 * A task is parked out of auto-start by a `hold` flag OR a `hold` tag — the
 * "flag/label" spelling lets a human hold work without editing frontmatter
 * directly. Held tasks keep their status; they are only skipped by the picker.
 */
export function taskIsHeld(task: Task): boolean {
  if (task.isHeld === true) return true;
  return task.tags.some((tag) => tag.trim().toLowerCase() === "hold");
}

/** Ready candidates eligible for auto-start, before slot/conflict ordering. */
export function isSelectableReady(task: Task): boolean {
  return task.status === "ready" && !task.isArchived && !task.needsInput && !taskIsHeld(task);
}

/**
 * Number of transitive dependents per task: the critical-path weight. A task
 * that unblocks three other tasks (directly or through them) has weight 3, so
 * starting it first drains the board fastest. Counts each dependent once, and
 * tolerates cycles in the graph (a cycle contributes no extra weight rather
 * than looping forever).
 */
export function criticalPathWeights(tasks: readonly Task[]): Map<string, number> {
  const directDependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const upstream of task.dependsOn ?? []) {
      const list = directDependents.get(upstream);
      if (list) list.push(task.id);
      else directDependents.set(upstream, [task.id]);
    }
  }

  const weights = new Map<string, number>();
  for (const task of tasks) {
    // Collect every id reachable by following dependents from `task`.
    const seen = new Set<string>();
    const stack = [...(directDependents.get(task.id) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === task.id || seen.has(id)) continue;
      seen.add(id);
      for (const next of directDependents.get(id) ?? []) stack.push(next);
    }
    weights.set(task.id, seen.size);
  }
  return weights;
}

/** The declared areas/paths two tasks share, or null when they don't collide. */
export function taskConflict(a: Task, b: Task): TaskConflict | null {
  for (const area of taskAreaSet(a)) {
    if (taskAreaSet(b).has(area)) return { a: a.id, b: b.id, reason: `share area "${area}"` };
  }
  const bPaths = new Set((b.paths ?? []).map((p) => p.trim()).filter(Boolean));
  for (const path of a.paths ?? []) {
    const clean = path.trim();
    if (clean && bPaths.has(clean)) return { a: a.id, b: b.id, reason: `share path "${clean}"` };
  }
  return null;
}

/** Every conflicting pair among the given tasks, in stable id order. */
export function conflictingPairs(tasks: readonly Task[]): TaskConflict[] {
  const conflicts: TaskConflict[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const conflict = taskConflict(tasks[i], tasks[j]);
      if (conflict) conflicts.push(conflict);
    }
  }
  return conflicts;
}

/**
 * Order eligible tasks deterministically: priority, then critical-path weight
 * (descending), then creation time (oldest first), then id. Returns the full
 * eligible order — `selected` is just its head.
 *
 * Order is total and stable: two tasks that differ in none of these keys are
 * separated by id, so the same board always yields the same pick.
 */
export function orderReadyTasks(
  tasks: readonly Task[],
  /** When set, critical-path weights use this full task list (e.g. all board tasks). */
  weightContext?: readonly Task[],
): Task[] {
  const weights = criticalPathWeights(weightContext ?? tasks);
  return [...tasks].sort((a, b) => {
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority !== 0) return priority;
    const weight = (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0);
    if (weight !== 0) return weight;
    const createdA = a.created_at ?? "";
    const createdB = b.created_at ?? "";
    if (createdA !== createdB) return createdA < createdB ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * The deterministic default picker. Filters `tasks` to eligible ready work
 * (excluding archived, needsInput, held and `blockedIds`), orders them, and
 * takes the first `availableSlots`. Pure: no git, no clock, no model.
 */
export function selectReadyTasks(
  tasks: readonly Task[],
  options: SelectionOptions,
): SelectionResult {
  const blocked = options.blockedIds ?? new Set<string>();
  const eligible = tasks.filter((task) => isSelectableReady(task) && !blocked.has(task.id));
  const eligibleTasks = orderReadyTasks(eligible, tasks);
  const slots = Math.max(0, options.availableSlots);
  return {
    eligible: eligibleTasks.map((task) => task.id),
    selected: eligibleTasks.slice(0, slots).map((task) => task.id),
    conflicts: conflictingPairs(eligibleTasks),
  };
}

/**
 * True when a PM veto pass is worth its cost: there are more eligible tasks
 * than slots AND at least one pair of candidates would collide (same area or a
 * declared shared path). Everything else is mechanical, so the deterministic
 * picker already has the answer.
 */
export function shouldRunPmVeto(
  result: Pick<SelectionResult, "eligible" | "conflicts">,
  slots: number,
): boolean {
  return result.eligible.length > slots && result.conflicts.length > 0;
}

/** The status values a selection may draw from; re-exported for callers/tests. */
export const SELECTABLE_STATUS: Status = "ready";
