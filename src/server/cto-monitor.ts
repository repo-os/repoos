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
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { CTOManager } from "./cto.js";

/** Simple hash for idempotence checks (not cryptographic). */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export class CTOMonitor {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private cto: CTOManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventQueue: string[] = [];
  private eventDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastDigestHash: string = "";
  private lastCheckTime: number = 0;

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

    // Idempotence: skip if digest is identical to last run and nothing new happened
    const digestHash = simpleHash(digest);
    const timeSinceLastCheck = Date.now() - this.lastCheckTime;
    if (digestHash === this.lastDigestHash && timeSinceLastCheck < 60_000) {
      // Same digest within 1 minute — no need to run again
      return;
    }

    this.lastDigestHash = digestHash;
    this.lastCheckTime = Date.now();
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
    lines.push(`- Build marker: ${this.checkBuildStaleness()}`);
    lines.push(`- Zombie processes: ${this.checkZombieProcesses()}`);
    lines.push("");

    return lines.join("\n") || null;
  }

  private checkBuildStaleness(): string {
    try {
      const srcDir = join(this.config.root, "src");
      const distDir = join(this.config.root, "dist");

      if (!existsSync(srcDir) || !existsSync(distDir)) {
        return "src or dist directory missing — cannot check staleness";
      }

      const srcStat = statSync(srcDir);
      const distStat = statSync(distDir);
      const srcTime = srcStat.mtimeMs;
      const distTime = distStat.mtimeMs;

      if (distTime < srcTime) {
        const staleSec = Math.round((srcTime - distTime) / 1000);
        return `⚠️ stale — src updated ${staleSec}s ago, dist needs rebuild`;
      }
      return "✓ fresh";
    } catch {
      return "? unable to check staleness";
    }
  }

  private checkZombieProcesses(): string {
    try {
      // Check for lingering serve processes or agent processes that should have exited
      // Use ps to find processes with "serve" or "bun" or "node" in their command
      let psOutput = "";
      try {
        psOutput = execSync("ps aux | grep -E '(serve|bun|node)' | grep -v grep || true", {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        return "? unable to check processes";
      }

      const lines = psOutput.trim().split("\n").filter((l) => l.length > 0);
      if (lines.length === 0) {
        return "✓ no stale processes detected";
      }

      // Simple heuristic: if we have more than 2 serve/node processes running,
      // there may be zombies. This is a conservative check.
      const staleCount = Math.max(0, lines.length - 2);
      if (staleCount > 0) {
        return `⚠️ possibly stale — ${staleCount} extra process(es) running`;
      }
      return "✓ processes look normal";
    } catch {
      return "? unable to check processes";
    }
  }

  private isTaskStuck(task: Task): boolean {
    // Active task with idle session for too long (no agent running)
    if (task.status === "active" && task.updated_at) {
      const lastActivity = Date.parse(task.updated_at);
      const staleness = Date.now() - lastActivity;
      if (staleness > 15 * 60 * 1000) return true; // 15 minutes
    }

    // Review task stuck with no action for too long
    if (task.status === "review" && task.updated_at) {
      const lastActivity = Date.parse(task.updated_at);
      const staleness = Date.now() - lastActivity;
      if (staleness > 30 * 60 * 1000) return true; // 30 minutes
    }

    // Check for handoff-but-no-done pattern (0172): task body has handoff marker
    // but status hasn't transitioned to done
    const hasHandoffMarker = task.body.includes("::handoff::");
    if (hasHandoffMarker && task.status !== ("done" as any)) {
      return true;
    }

    return false;
  }

  private describeStuckSignal(task: Task): string {
    if (task.status === "active") {
      const lastActivity = task.updated_at ? Date.parse(task.updated_at) : 0;
      const min = Math.round((Date.now() - lastActivity) / 60_000);
      return `active, idle session (${min}m with no output)`;
    }

    if (task.status === "review") {
      const lastActivity = task.updated_at ? Date.parse(task.updated_at) : 0;
      const min = Math.round((Date.now() - lastActivity) / 60_000);
      return `review stuck, no action taken (${min}m stale)`;
    }

    if (task.body.includes("::handoff::") && task.status !== "done") {
      return `handoff requested but not finalized — task still in ${task.status}, should be done`;
    }

    return "possibly stuck";
  }
}
