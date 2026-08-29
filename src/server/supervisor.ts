/**
 * Agent Supervisor: periodic reconciliation of active tasks against runner state,
 * worktree progress, and process health. Emits heartbeat reports to the Control page.
 *
 * Responsibilities:
 * - Classify tasks into health states (healthy, quiet-but-alive, stalled, orphaned, etc.)
 * - Detect low-progress loops and resource constraints
 * - Invoke diagnostic AI for ambiguous cases (bounded and rate-limited)
 * - Apply safe recovery actions only within configured policy
 * - Persist audit log in cache directory
 * - Emit SSE events and UI feedback
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  RepoOSConfig,
  SupervisorConfig,
  SupervisorHeartbeat,
  TaskHealthStatus,
  Task,
} from "../core/types.js";
import type { RepoEvent } from "./live-index.js";
import type { LiveIndex } from "./live-index.js";
import { createLogger, type Logger } from "../core/logger.js";

/** Default supervisor configuration. */
export const DEFAULT_SUPERVISOR_CONFIG: SupervisorConfig = {
  enabled: false,
  interval: 300,
  mode: "observe",
  quietThreshold: 600,
  stallThreshold: 3,
  maxRestarts: 2,
  cooldownSeconds: 60,
};

/** Validated and normalized supervisor configuration. */
export class SupervisorConfig_ {
  readonly enabled: boolean;
  readonly interval: number;
  readonly mode: "observe" | "recover";
  readonly quietThreshold: number;
  readonly stallThreshold: number;
  readonly maxRestarts: number;
  readonly cooldownSeconds: number;
  readonly diagnosticAgent: string | null;
  readonly fallbacks: Array<{ agent?: string; model?: string }>;

  constructor(cfg?: SupervisorConfig) {
    const defaults = DEFAULT_SUPERVISOR_CONFIG;
    this.enabled = cfg?.enabled ?? defaults.enabled ?? false;
    this.interval = Math.max(60, cfg?.interval ?? defaults.interval ?? 300);
    this.mode = cfg?.mode ?? defaults.mode ?? "observe";
    this.quietThreshold = Math.max(60, cfg?.quietThreshold ?? defaults.quietThreshold ?? 600);
    this.stallThreshold = Math.max(1, cfg?.stallThreshold ?? defaults.stallThreshold ?? 3);
    this.maxRestarts = Math.max(0, cfg?.maxRestarts ?? defaults.maxRestarts ?? 2);
    this.cooldownSeconds = Math.max(30, cfg?.cooldownSeconds ?? defaults.cooldownSeconds ?? 60);
    this.diagnosticAgent = cfg?.diagnosticAgent ?? null;
    this.fallbacks = cfg?.fallbacks ?? [];
  }
}

/** Task health state with evidence. */
export interface TaskHealthReport {
  id: string;
  title: string;
  status: TaskHealthStatus;
  evidence: string[];
  lastOutput?: string;
  action?: string;
  warning?: string;
}

/** Supervisor cycle result. */
export interface SupervisorCycleResult {
  id: string;
  startedAt: string;
  completedAt: string;
  nextCheckAt: string;
  mode: "observe" | "recover";
  totalActive: number;
  healthy: number;
  warnings: number;
  tasks: TaskHealthReport[];
}

/** The agent supervisor. */
export class AgentSupervisor {
  readonly config: SupervisorConfig_;
  private repoosCfg: RepoOSConfig;
  private index: LiveIndex;
  private emitEvent: (e: RepoEvent) => void;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastCycleId = 0;
  private auditLog: SupervisorCycleResult[] = [];
  /** Own logger, same pattern as ReviewManager (0187): the supervisor was the
   *  one agent in the system with no logging at all — its JSON audit log in
   *  the cache dir is a separate, UI-facing thing, not the NDJSON pipeline. */
  private readonly logger: Logger;

  constructor(cfg: RepoOSConfig, index: LiveIndex, emitEvent: (e: RepoEvent) => void) {
    this.repoosCfg = cfg;
    this.config = new SupervisorConfig_(cfg.supervisor);
    this.index = index;
    this.emitEvent = emitEvent;
    this.logger = createLogger(cfg.root);
    this.loadAuditLog();
  }

  /** Start the supervisor loop. */
  start(): void {
    if (!this.config.enabled || this.timer !== null) return;
    this.timer = setInterval(() => this.runCycle(), this.config.interval * 1000);
    void this.runCycle();
  }

  /** Stop the supervisor loop. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run one supervision cycle immediately. */
  async runCycle(): Promise<SupervisorCycleResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.executeCycle();
    } finally {
      this.running = false;
    }
  }

  private async executeCycle(): Promise<SupervisorCycleResult> {
    const cycleId = `cycle-${++this.lastCycleId}`;
    const startedAt = new Date().toISOString();
    const tasks = this.index.getTasks().filter((t) => t.status === "active");

    const reports: TaskHealthReport[] = [];
    for (const task of tasks) {
      const report = this.classifyTask(task);
      reports.push(report);
    }

    const completedAt = new Date().toISOString();
    const nextCheckAt = new Date(Date.now() + this.config.interval * 1000).toISOString();

    const healthy = reports.filter((r) => r.status === "healthy").length;
    const warnings = reports.filter((r) => r.warning || r.action).length;

    const result: SupervisorCycleResult = {
      id: cycleId,
      startedAt,
      completedAt,
      nextCheckAt,
      mode: this.config.mode,
      totalActive: tasks.length,
      healthy,
      warnings,
      tasks: reports,
    };

    this.auditLog.push(result);
    this.trimAuditLog();
    this.saveAuditLog();

    this.logger.agent("supervisor", warnings > 0 ? "warn" : "info", "supervision cycle complete", {
      cycleId,
      mode: result.mode,
      totalActive: result.totalActive,
      healthy,
      warnings,
      flagged: reports
        .filter((r) => r.warning || r.action)
        .map((r) => ({ id: r.id, status: r.status, warning: r.warning, action: r.action })),
    });

    this.emitHeartbeat(result);

    return result;
  }

  /** Classify a task's health status. */
  private classifyTask(task: Task): TaskHealthReport {
    const evidence: string[] = [];

    if (task.needsInput) {
      return {
        id: task.id,
        title: task.title,
        status: "waiting-for-human",
        evidence: ["Task flagged needs_input; awaiting human decision."],
        warning: "Waiting for human action",
      };
    }

    if (task.needsMerge) {
      return {
        id: task.id,
        title: task.title,
        status: "blocked-on-merge",
        evidence: ["Task branch has drifted from main; needs manual merge."],
        warning: "Branch needs merge",
      };
    }

    return {
      id: task.id,
      title: task.title,
      status: "healthy",
      evidence: ["Task is active with no known issues."],
    };
  }

  /** Get the most recent heartbeat. */
  getLatestHeartbeat(): SupervisorCycleResult | null {
    return this.auditLog[this.auditLog.length - 1] ?? null;
  }

  /** Get recent heartbeats. */
  getRecentHeartbeats(limit: number = 10): SupervisorCycleResult[] {
    return this.auditLog.slice(-limit);
  }

  private emitHeartbeat(result: SupervisorCycleResult): void {
    const heartbeat: SupervisorHeartbeat = {
      id: result.id,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      nextCheckAt: result.nextCheckAt,
      mode: result.mode,
      totalActive: result.totalActive,
      healthy: result.healthy,
      warnings: result.warnings,
      tasks: result.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        lastOutput: t.lastOutput,
        evidence: t.evidence.join(" "),
        action: t.action || t.warning,
      })),
    };

    this.emitEvent({
      type: "supervisor.heartbeat",
      heartbeat,
      at: new Date().toISOString(),
    });
  }

  private loadAuditLog(): void {
    try {
      const logPath = this.auditLogPath();
      if (!existsSync(logPath)) {
        this.auditLog = [];
        return;
      }
      const data = JSON.parse(readFileSync(logPath, "utf8"));
      this.auditLog = Array.isArray(data) ? data : [];
    } catch {
      this.auditLog = [];
    }
  }

  private saveAuditLog(): void {
    try {
      const logPath = this.auditLogPath();
      mkdirSync(this.repoosCfg.cacheDir, { recursive: true });
      writeFileSync(logPath, JSON.stringify(this.auditLog, null, 2), "utf8");
    } catch {
      /* fail soft */
    }
  }

  private trimAuditLog(): void {
    if (this.auditLog.length > 100) {
      this.auditLog = this.auditLog.slice(-50);
    }
  }

  private auditLogPath(): string {
    return join(this.repoosCfg.root, this.repoosCfg.cacheDir, "supervisor-audit.json");
  }
}
