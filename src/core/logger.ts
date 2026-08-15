/**
 * Centralized logging for RepoOS system, tasks, and agents.
 * Logs are stored as newline-delimited JSON (NDJSON) in .repoos/logs/
 * Structure:
 *   .repoos/logs/system.log       - System-wide errors and critical events
 *   .repoos/logs/tasks/<id>.log   - Per-task lifecycle and state changes
 *   .repoos/logs/agents/<id>.log  - Per-agent activity and errors
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: "system" | "task" | "agent" | "integration";
  message: string;
  context?: Record<string, unknown>;
}

interface LoggerOptions {
  root: string;
}

/**
 * Central logger for RepoOS. Creates and manages log files in .repoos/logs/
 */
export class Logger {
  private root: string;
  private logsDir: string;

  constructor(opts: LoggerOptions) {
    this.root = opts.root;
    this.logsDir = join(opts.root, ".repoos", "logs");
  }

  /**
   * Log a system-wide event or error. Includes fatal crashes and critical failures.
   */
  system(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.write("system.log", {
      timestamp: new Date().toISOString(),
      level,
      component: "system",
      message,
      context,
    });
  }

  /**
   * Log a task lifecycle event: state changes, errors, transitions through pipeline.
   */
  task(taskId: string, level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.write(`tasks/${taskId}.log`, {
      timestamp: new Date().toISOString(),
      level,
      component: "task",
      message,
      context,
    });
  }

  /**
   * Log agent activity: startup, completion, errors, output streams.
   */
  agent(agentId: string, level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.write(`agents/${agentId}.log`, {
      timestamp: new Date().toISOString(),
      level,
      component: "agent",
      message,
      context,
    });
  }

  /**
   * Log integration/merge job activity (phase transitions, errors).
   */
  integration(
    taskId: string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.write(`tasks/${taskId}.log`, {
      timestamp: new Date().toISOString(),
      level,
      component: "integration",
      message,
      context,
    });
  }

  /**
   * Read up to `limit` log entries for a specific task or agent, in
   * chronological order (oldest first). Callers that want most-recent-first
   * (`getTaskLogs`, `getAgentLogs`, `getSystemLogs`) reverse the result.
   */
  readLogs(logPath: string, limit: number = 1000): LogEntry[] {
    const fullPath = join(this.logsDir, logPath);
    if (!existsSync(fullPath)) return [];

    try {
      const content = readFileSync(fullPath, "utf8");
      const lines = content.split("\n").filter((line) => line.trim());
      const entries: LogEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }
      return entries.slice(Math.max(0, entries.length - limit));
    } catch {
      return [];
    }
  }

  /**
   * Get task logs in reverse order (most recent first).
   */
  getTaskLogs(taskId: string, limit: number = 1000): LogEntry[] {
    const entries = this.readLogs(`tasks/${taskId}.log`, limit);
    return entries.reverse();
  }

  /**
   * Get agent logs in reverse order (most recent first).
   */
  getAgentLogs(agentId: string, limit: number = 1000): LogEntry[] {
    const entries = this.readLogs(`agents/${agentId}.log`, limit);
    return entries.reverse();
  }

  /**
   * Get system logs in reverse order (most recent first).
   */
  getSystemLogs(limit: number = 1000): LogEntry[] {
    const entries = this.readLogs("system.log", limit);
    return entries.reverse();
  }

  /**
   * Write a log entry as NDJSON to the appropriate log file.
   */
  private write(logPath: string, entry: LogEntry): void {
    try {
      const fullPath = join(this.logsDir, logPath);
      const dir = dirname(fullPath);
      mkdirSync(dir, { recursive: true });
      appendFileSync(fullPath, JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      // Logging should never crash the system. Silent failure.
      console.error(`Failed to write log: ${err}`);
    }
  }
}

/**
 * Create a logger for a repository root.
 */
export function createLogger(root: string): Logger {
  return new Logger({ root });
}
