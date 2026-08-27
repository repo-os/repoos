/**
 * Auto-engineering mode: automatically selects and starts ready tasks up to a
 * configured maximum. The PM agent decides which tasks are most suitable;
 * orchestration remains server-owned with proper safeguards against
 * oversubscription and stale state.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Status, Task } from "../core/types.js";
import { resolvePmAgent, runPrompt, recordOneShotSession } from "./agents.js";

/** Result of a reconciliation attempt. */
export interface ReconciliationResult {
  triggered: boolean;
  outcome?: "selected" | "no-capacity" | "no-ready-work" | "pm-unavailable" | "pm-failed";
  candidateIds?: string[];
  selectedIds?: string[];
  rationale?: string;
  error?: string;
}

/** Persisted decision record for Control page hydration. */
export interface AutoEngineeringDecision {
  timestamp: string;
  trigger: "active-to-review" | "inbox-to-ready" | "config-change" | "startup";
  outcome: ReconciliationResult["outcome"];
  activeCount: number;
  maxActiveTasks: number;
  availableSlots: number;
  candidateIds: string[];
  selectedIds: string[];
  rationale?: string;
  error?: string;
}

/**
 * Render the PM prompt for auto-engineering task selection. Receives all
 * ready tasks and the number of available slots, returns selected task IDs
 * and brief rationale. The PM never selects more tasks than slots available.
 */
function autoEngineeringPrompt(readyTasks: Task[], availableSlots: number): string {
  const tasksList = readyTasks
    .map(
      (t) =>
        `- **#${t.id}** ${t.title}\n  Type: ${t.type}, Priority: ${t.priority}, Area: ${t.area || "unspecified"}`,
    )
    .join("\n");

  return [
    "You are the PM agent for RepoOS auto-engineering mode. The engineering team has capacity for",
    `${availableSlots} more task(s). Choose which ready task(s) to start now based on priority,`,
    "impact, and dependencies.",
    "",
    "Ready tasks available:",
    "",
    tasksList,
    "",
    "Respond with ONLY a JSON object (no preamble, no code fences):",
    '{"selected": ["0123", "0124"], "rationale": "Starting the most impactful high-priority tasks"}',
    "",
    "- `selected`: array of task IDs to start (must not exceed available slots)",
    '- `rationale`: one-sentence explanation of why these were chosen',
  ].join("\n");
}

/**
 * Parse the PM agent's structured JSON response. Never throws: anything
 * unparseable yields an empty selection with an error description.
 */
function parseAutoEngineeringSelection(output: string): {
  selected: string[];
  rationale: string;
  error?: string;
} {
  try {
    const trimmed = output.trim();
    const obj = JSON.parse(trimmed) as unknown;
    if (
      typeof obj === "object" &&
      obj !== null &&
      Array.isArray((obj as Record<string, unknown>).selected) &&
      typeof (obj as Record<string, unknown>).rationale === "string"
    ) {
      return {
        selected: (obj as Record<string, unknown>).selected as string[],
        rationale: ((obj as Record<string, unknown>).rationale as string).trim(),
      };
    }
  } catch (e) {
    // Fall through to error response
  }
  return {
    selected: [],
    rationale: "",
    error: "PM response was not valid JSON or missing required fields",
  };
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
    const activeCount = allTasks.filter((t) => t.status === "active").length;
    const availableSlots = Math.max(0, maxActiveTasks - activeCount);

    // No capacity available.
    if (availableSlots === 0) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "no-capacity",
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

    const readyTasks = allTasks.filter((t) => t.status === "ready");

    // No ready tasks.
    if (readyTasks.length === 0) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "no-ready-work",
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

    const pm = resolvePmAgent(config);
    if (!pm) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "pm-unavailable",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: readyTasks.map((t) => t.id),
        selectedIds: [],
        error: "PM agent is not configured or enabled",
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "pm-unavailable",
        error: "PM agent is not configured or enabled",
      };
    }

    // Invoke PM agent to select which ready tasks to start.
    const prompt = autoEngineeringPrompt(readyTasks, availableSlots);
    let pmResult;
    try {
      pmResult = await runPrompt(pm, prompt, {
        cwd: config.root,
      });
    } catch (e) {
      const error = `PM agent failed: ${e instanceof Error ? e.message : String(e)}`;
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "pm-failed",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: readyTasks.map((t) => t.id),
        selectedIds: [],
        error,
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "pm-failed",
        error,
      };
    }

    // Board-level PM spend — the dispatch pass belongs to no single task (0311).
    recordOneShotSession(config.root, pm, pmResult, { sessionType: "dispatch", taskId: null });

    if (!pmResult.ok || !pmResult.output) {
      const error = pmResult.error || "PM agent returned no output";
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "pm-failed",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: readyTasks.map((t) => t.id),
        selectedIds: [],
        error,
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "pm-failed",
        error,
      };
    }

    const selection = parseAutoEngineeringSelection(pmResult.output);
    if (selection.error) {
      this.lastDecision = {
        timestamp: new Date().toISOString(),
        trigger,
        outcome: "pm-failed",
        activeCount,
        maxActiveTasks,
        availableSlots,
        candidateIds: readyTasks.map((t) => t.id),
        selectedIds: [],
        error: selection.error,
      };
      this.persistDecision(this.lastDecision);
      return {
        triggered: true,
        outcome: "pm-failed",
        error: selection.error,
      };
    }

    // Validate selection: ensure all IDs exist in ready pool and don't exceed slots.
    const readySet = new Set(readyTasks.map((t) => t.id));
    const validated = selection.selected.filter((id) => readySet.has(id)).slice(0, availableSlots);

    this.lastDecision = {
      timestamp: new Date().toISOString(),
      trigger,
      outcome: "selected",
      activeCount,
      maxActiveTasks,
      availableSlots,
      candidateIds: readyTasks.map((t) => t.id),
      selectedIds: validated,
      rationale: selection.rationale,
    };
    this.persistDecision(this.lastDecision);

    return {
      triggered: true,
      outcome: "selected",
      candidateIds: readyTasks.map((t) => t.id),
      selectedIds: validated,
      rationale: selection.rationale,
    };
  }
}
