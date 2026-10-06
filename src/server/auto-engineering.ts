/**
 * Auto-engineering mode: automatically selects and starts ready tasks up to a
 * configured maximum.
 *
 * Selection is DETERMINISTIC by default (#0690): when the dependency graph is
 * explicit, choosing the next task is mechanical — priority, then the amount
 * of downstream work a task unblocks (its critical-path weight), then creation
 * order. `selectReadyTasks` (src/core/task-selection.ts) owns that ordering and
 * costs nothing. An optional PM pass (`autoEngineering.pmVeto`) runs ONLY when
 * there are more eligible tasks than open slots AND two candidates would
 * collide (same area or a declared shared path); it may reorder or defer, never
 * invent work. A PM failure never stalls dispatch — the deterministic pick
 * already has the answer.
 *
 * Orchestration remains server-owned with proper safeguards against
 * oversubscription and stale state.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { resolvePmAgent, runPrompt, recordOneShotSession } from "./agents.js";
import { taskDependencyBlockers } from "../core/task-dependencies.js";
import {
  selectReadyTasks,
  shouldRunPmVeto,
  type SelectionResult,
  type TaskConflict,
} from "../core/task-selection.js";

/** Which picker produced a decision. */
export type PickerKind = "deterministic" | "pm-veto";

/** Result of a reconciliation attempt. */
export interface ReconciliationResult {
  triggered: boolean;
  outcome?: "selected" | "no-capacity" | "no-ready-work" | "pm-failed";
  picker?: PickerKind;
  candidateIds?: string[];
  selectedIds?: string[];
  deferredIds?: string[];
  rationale?: string;
  error?: string;
}

/** Persisted decision record for Control page hydration. */
export interface AutoEngineeringDecision {
  timestamp: string;
  trigger:
    | "active-to-review"
    | "inbox-to-ready"
    | "dependency-merged"
    | "config-change"
    | "startup";
  outcome: ReconciliationResult["outcome"];
  /** Which picker ran: the deterministic default, or the optional PM veto pass. */
  picker?: PickerKind;
  activeCount: number;
  maxActiveTasks: number;
  availableSlots: number;
  candidateIds: string[];
  selectedIds: string[];
  /** Eligible tasks left for a later slot, in pick order. */
  deferredIds?: string[];
  /** Candidate pairs that would collide if started together. */
  conflicts?: TaskConflict[];
  rationale?: string;
  error?: string;
}

/**
 * Render the PM veto prompt. The candidate list is already ordered by the
 * deterministic picker; the PM may only reorder it or move a task later, to
 * avoid two candidates that touch the same area/paths running in parallel.
 * It can never add a task outside the candidate list.
 */
function pmVetoPrompt(
  candidates: Task[],
  availableSlots: number,
  conflicts: TaskConflict[],
): string {
  const tasksList = candidates
    .map(
      (t, index) =>
        `${index + 1}. **#${t.id}** ${t.title}\n   Type: ${t.type}, Priority: ${t.priority}, Area: ${
          t.area || "unspecified"
        }, Paths: ${(t.paths ?? []).join(", ") || "—"}`,
    )
    .join("\n");

  const conflictList = conflicts.length
    ? conflicts.map((c) => `- #${c.a} and #${c.b} ${c.reason}`).join("\n")
    : "- (none detected)";

  return [
    "You are the PM agent for RepoOS auto-engineering mode. The deterministic picker has",
    `already ordered the eligible ready tasks. There are ${availableSlots} open slot(s) and`,
    "some candidates would collide if started together.",
    "",
    "Your ONLY job is to reorder or defer the candidates below so that tasks which share an",
    "area or a declared path do not run in parallel. You may not add, remove, or rename any",
    "task — the candidate id list is fixed. Return the full list in the order RepoOS should",
    "start them; tasks beyond the slot count are deferred.",
    "",
    "Detected collisions:",
    "",
    conflictList,
    "",
    "Candidates (already in the default order):",
    "",
    tasksList,
    "",
    "Respond with ONLY a JSON object (no preamble, no code fences):",
    '{"ordered": ["0123", "0124", "0125"], "rationale": "Deferred #0124 below #0125 so the two web tasks do not run in parallel"}',
    "",
    "- `ordered`: every candidate id, in the order to start them (reorder/defer only)",
    "- `rationale`: one sentence explaining the reordering or deferral",
  ].join("\n");
}

/**
 * Parse the PM veto response. Never throws: anything unparseable yields an
 * error description so the caller can fall back to the deterministic order.
 */
function parsePmVetoOrdering(output: string): {
  ordered: string[];
  rationale: string;
  error?: string;
} {
  try {
    const obj = JSON.parse(output.trim()) as unknown;
    if (typeof obj === "object" && obj !== null) {
      const record = obj as Record<string, unknown>;
      if (Array.isArray(record.ordered) && typeof record.rationale === "string") {
        return {
          ordered: record.ordered.map(String),
          rationale: record.rationale.trim(),
        };
      }
    }
  } catch {
    // Fall through to error response
  }
  return {
    ordered: [],
    rationale: "",
    error: "PM veto response was not valid JSON or missing required fields",
  };
}

/**
 * Reorder the deterministic candidate list by the PM's ordering, tolerating a
 * partial or stale response: ids the PM omitted keep their deterministic
 * position at the end, and ids not in the candidate set are dropped. This is
 * the "reorder or defer, never invent" guarantee, enforced in code.
 */
export function applyPmVetoOrdering(eligible: string[], pmOrdered: string[]): string[] {
  const eligibleSet = new Set(eligible);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of pmOrdered) {
    if (!eligibleSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  for (const id of eligible) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

/**
 * Orchestrator for auto-engineering mode. Singleton per server lifetime;
 * tracks mode state and decision history for Control page display.
 * Decisions persist to disk for browser refresh recovery.
 */
export class AutoEngineeringOrchestrator {
  private lastDecision: AutoEngineeringDecision | null = null;
  private reconciling = false;
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? ".repoos";
  }

  getLastDecision(): AutoEngineeringDecision | null {
    return this.lastDecision;
  }

  /** Store the latest decision for recovery after server restart. */
  private persistDecision(decision: AutoEngineeringDecision): void {
    try {
      const filePath = join(this.cacheDir, "auto-engineering-decision.json");
      mkdirSync(this.cacheDir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(decision, null, 2));
    } catch {
      // Persistence is best-effort — failures don't block reconciliation
    }
  }

  /** Load the last persisted decision from disk (for browser refresh recovery). */
  loadPersistedDecision(): void {
    try {
      const filePath = join(this.cacheDir, "auto-engineering-decision.json");
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, "utf8");
        this.lastDecision = JSON.parse(data) as AutoEngineeringDecision;
      }
    } catch {
      // Load failure is silent — just start with no persisted state
    }
  }

  /**
   * Check if auto-engineering should trigger: mode enabled, available capacity,
   * and at least one ready task. Returns early if already reconciling (single-flight).
   */
  async reconcile(
    config: RepoOSConfig,
    allTasks: Task[],
    trigger: AutoEngineeringDecision["trigger"],
  ): Promise<ReconciliationResult> {
    if (this.reconciling) {
      return { triggered: false };
    }

    const enabled = config.autoEngineeringMode ?? false;
    if (!enabled) {
      return { triggered: false };
    }

    this.reconciling = true;
    try {
      return await this.reconcileImpl(config, allTasks, trigger);
    } finally {
      this.reconciling = false;
    }
  }

  private async reconcileImpl(
    config: RepoOSConfig,
    allTasks: Task[],
    trigger: AutoEngineeringDecision["trigger"],
  ): Promise<ReconciliationResult> {
    const maxActiveTasks = config.maxActiveTasks ?? 3;
    // Archived tasks are parked (#0657): they hold no slot and are never
    // picked up, even if their underlying status is `active`.
    const activeCount = allTasks.filter((t) => t.status === "active" && !t.isArchived).length;
    const availableSlots = Math.max(0, maxActiveTasks - activeCount);

    // No capacity available.
    if (availableSlots === 0) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "no-capacity",
        picker: "deterministic",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: [],
        selectedIds: [],
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "no-capacity",
      };
    }

    // Eligibility lives in the pure selector; the git-aware blocker check is
    // the only impure input, computed once here.
    const blockedIds = new Set(
      allTasks
        .filter((task) => taskDependencyBlockers(config.root, task, allTasks).length > 0)
        .map((task) => task.id),
    );
    const selection = selectReadyTasks(allTasks, { availableSlots, blockedIds });

    // No ready tasks.
    if (selection.eligible.length === 0) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "no-ready-work",
        picker: "deterministic",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: [],
        selectedIds: [],
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "no-ready-work",
      };
    }

    const pmVetoEnabled = config.autoEngineering?.pmVeto ?? false;
    if (pmVetoEnabled && shouldRunPmVeto(selection, availableSlots)) {
      return this.reconcileWithPmVeto(
        config,
        allTasks,
        trigger,
        selection,
        availableSlots,
        activeCount,
        maxActiveTasks,
      );
    }

    return this.finishDeterministic(
      trigger,
      selection,
      availableSlots,
      activeCount,
      maxActiveTasks,
    );
  }

  /** Record and return the deterministic pick (no PM call). */
  private finishDeterministic(
    trigger: AutoEngineeringDecision["trigger"],
    selection: SelectionResult,
    availableSlots: number,
    activeCount: number,
    maxActiveTasks: number,
    pmError?: string,
  ): ReconciliationResult {
    this.lastDecision = {
      timestamp: new Date().toISOString(),
      trigger,
      outcome: "selected",
      picker: "deterministic",
      activeCount,
      maxActiveTasks,
      availableSlots,
      candidateIds: selection.eligible,
      selectedIds: selection.selected,
      deferredIds: selection.eligible.slice(selection.selected.length),
      conflicts: selection.conflicts,
      error: pmError,
    };
    this.persistDecision(this.lastDecision);
    return {
      triggered: true,
      outcome: "selected",
      picker: "deterministic",
      candidateIds: selection.eligible,
      selectedIds: selection.selected,
      deferredIds: this.lastDecision.deferredIds,
      error: pmError,
    };
  }

  /**
   * Run the optional PM veto pass. The PM may only reorder/defer the
   * deterministic candidate list; on any failure or unparseable output the
   * deterministic pick stands, so a flaky model can never stall dispatch.
   */
  private async reconcileWithPmVeto(
    config: RepoOSConfig,
    allTasks: Task[],
    trigger: AutoEngineeringDecision["trigger"],
    selection: SelectionResult,
    availableSlots: number,
    activeCount: number,
    maxActiveTasks: number,
  ): Promise<ReconciliationResult> {
    const pm = resolvePmAgent(config);
    if (!pm) {
      return this.finishDeterministic(
        trigger,
        selection,
        availableSlots,
        activeCount,
        maxActiveTasks,
        "PM veto is enabled but no PM agent is configured; used the deterministic picker",
      );
    }

    const candidates = selection.eligible
      .map((id) => allTasks.find((task) => task.id === id))
      .filter((task): task is Task => task !== undefined);
    const prompt = pmVetoPrompt(candidates, availableSlots, selection.conflicts);

    let pmResult;
    try {
      pmResult = await runPrompt(pm, prompt, { cwd: config.root });
    } catch (e) {
      return this.finishDeterministic(
        trigger,
        selection,
        availableSlots,
        activeCount,
        maxActiveTasks,
        `PM veto run failed (${e instanceof Error ? e.message : String(e)}); used the deterministic picker`,
      );
    }

    // Board-level PM spend — the dispatch pass belongs to no single task (0311).
    recordOneShotSession(config.root, pm, pmResult, { sessionType: "dispatch", taskId: null });

    if (!pmResult.ok || !pmResult.output) {
      return this.finishDeterministic(
        trigger,
        selection,
        availableSlots,
        activeCount,
        maxActiveTasks,
        `PM veto returned no output (${pmResult.error || "unknown"}); used the deterministic picker`,
      );
    }

    const veto = parsePmVetoOrdering(pmResult.output);
    if (veto.error) {
      return this.finishDeterministic(
        trigger,
        selection,
        availableSlots,
        activeCount,
        maxActiveTasks,
        `${veto.error}; used the deterministic picker`,
      );
    }

    const ordered = applyPmVetoOrdering(selection.eligible, veto.ordered);
    const selected = ordered.slice(0, availableSlots);
    this.lastDecision = {
      timestamp: new Date().toISOString(),
      trigger,
      outcome: "selected",
      picker: "pm-veto",
      activeCount,
      maxActiveTasks,
      availableSlots,
      candidateIds: selection.eligible,
      selectedIds: selected,
      deferredIds: ordered.slice(selected.length),
      conflicts: selection.conflicts,
      rationale: veto.rationale,
    };
    this.persistDecision(this.lastDecision);
    return {
      triggered: true,
      outcome: "selected",
      picker: "pm-veto",
      candidateIds: selection.eligible,
      selectedIds: selected,
      deferredIds: this.lastDecision.deferredIds,
      rationale: veto.rationale,
    };
  }
}
