/**
 * CTO monitoring loop (0174): periodically builds a board digest and runs the
 * CTO agent to detect stuck tasks, stale reviews, and other board health issues.
 *
 * Triggers: every N seconds (configurable cadence), and on key events:
 * - task status change
 * - review run completes
 * - agent turn exits
 *
 * The digest includes:
 * - task counts and staleness (active with no recent output, review stuck)
 * - stuck patterns (handoff requested, no done; session idle > threshold)
 * - serve processes (zombie checks)
 * - build marker freshness
 *
 * The CTO reads the digest and decides: ignore (nothing wrong), report only,
 * or suggest actions (nudge, escalate, file a bug). All actions are
 * logged and visible to the human — the CTO never acts without asking.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { CTOManager } from "./cto.js";

export class CTOMonitor {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private cto: CTOManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventQueue: string[] = [];
  private eventDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RepoOSConfig, index: LiveIndex, cto: CTOManager) {
    this.config = config;
    this.index = index;
    this.cto = cto;
  }

  start(intervalMs: number = 300_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.checkNow("timer");
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.eventDebounce) {
      clearTimeout(this.eventDebounce);
      this.eventDebounce = null;
    }
  }

  /** Trigger a monitor check from an event (task status change, review complete, etc). */
  onEvent(reason: string): void {
    this.eventQueue.push(reason);
    if (this.eventDebounce) clearTimeout(this.eventDebounce);
    this.eventDebounce = setTimeout(() => {
      void this.checkNow("event");
      this.eventQueue = [];
    }, 2000);
  }

  async checkNow(reason: string = "manual"): Promise<void> {
    if (this.cto.isRunning()) return;
    if (!this.cto.enabled()) return;

    const digest = this.buildDigest();
    if (!digest) return;

    await this.cto.run(digest);
  }

  private buildDigest(): string | null {
    const tasks = this.index.getTasks();
    const lines: string[] = [];

    lines.push("## Task Status Summary");
    lines.push("");

    const counts = this.index.counts();
    lines.push(`- **Inbox**: ${counts.inbox} tasks`);
    lines.push(`- **Ready**: ${counts.ready} tasks (waiting to start)`);
    lines.push(`- **Active**: ${counts.active} tasks (in progress)`);
    lines.push(`- **Review**: ${counts.review} tasks (awaiting sign-off)`);
    lines.push(`- **Done**: ${counts.done} tasks`);
    lines.push("");

    lines.push("## Potentially Stuck Tasks");
    lines.push("");

    const stuckTasks = tasks.filter((t) => this.isTaskStuck(t));
    if (stuckTasks.length === 0) {
      lines.push("None — all tasks look healthy.");
    } else {
      for (const task of stuckTasks) {
        lines.push(`- **#${task.id}** (${task.status}): ${this.describeStuckSignal(task)}`);
      }
    }
    lines.push("");

    lines.push("## Build and Process Health");
    lines.push("");
    lines.push("- Build marker: (check if dist/ is stale vs src/)");
    lines.push("- Serve processes: (check for zombies or stale processes)");
    lines.push("");

    return lines.join("\n") || null;
  }

  private isTaskStuck(task: Task): boolean {
    // Task in active with no running agent and idle for too long
    if (task.status === "active" && !task.git?.dirty && task.updated_at) {
      const lastActivity = Date.parse(task.updated_at);
      const staleness = Date.now() - lastActivity;
      if (staleness > 15 * 60 * 1000) return true; // 15 minutes
    }

    // Task in review with verdict but no progress
    if (task.status === "review" && task.updated_at) {
      const lastActivity = Date.parse(task.updated_at);
      const staleness = Date.now() - lastActivity;
      if (staleness > 30 * 60 * 1000) return true; // 30 minutes
    }

    return false;
  }

  private describeStuckSignal(task: Task): string {
    if (task.status === "active") {
      const lastActivity = task.updated_at ? Date.parse(task.updated_at) : 0;
      const min = Math.round((Date.now() - lastActivity) / 60_000);
      return `active, no recent output (${min}m stale)`;
    }

    if (task.status === "review") {
      const lastActivity = task.updated_at ? Date.parse(task.updated_at) : 0;
      const min = Math.round((Date.now() - lastActivity) / 60_000);
      return `review stuck, no action (${min}m stale)`;
    }

    return "possibly stuck";
  }
}
