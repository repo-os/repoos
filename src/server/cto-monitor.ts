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
 * logged and visible to the human. The sole automatic action is one bounded
 * completion nudge to an active engineer after five minutes of real inactivity.
 */
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";
import type { CTOManager } from "./cto.js";
import { resolveAgentForTask, type AgentRunner } from "./agents.js";
import { hasRecentWorktreeActivity } from "./task-watchdog.js";

const AUTOMATIC_NUDGE_IDLE_MS = 5 * 60 * 1000;
const AUTOMATIC_NUDGE_COOLDOWN_MS = 60 * 60 * 1000;
const AUTOMATIC_NUDGE_MARKER = "CTO nudge: sent engineer a completion reminder";

/** A built board digest plus the structural verdict used to gate model calls. */
interface BuiltDigest {
  /** Rendered digest handed to the CTO prompt. */
  text: string;
  /** Structural, minute-free signal compared for idempotence. */
  material: string;
  /** True when nothing in the digest needs the model's attention. */
  healthy: boolean;
}

/** One health check's verdict: a boolean plus the human-readable label. */
interface HealthSignal {
  healthy: boolean;
  label: string;
}

/** Simple hash for idempotence checks (not cryptographic). */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export class CTOMonitor {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private cto: CTOManager;
  private runner?: AgentRunner;
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventQueue: string[] = [];
  private eventDebounce: ReturnType<typeof setTimeout> | null = null;
  /**
   * Hash of the last *material* board signal we ran (or deliberately skipped)
   * on. Structural, not rendered: idle-minute counters change every minute but
   * are not material, so they must not retrigger a run (#0649).
   */
  private lastMaterialHash: string = "";
  /** Cleared as soon as the worktree becomes active again: one nudge per idle stretch. */
  private nudgedIdleTasks = new Set<string>();
  /** Optional allowlisted recovery pass (#0688), wired from the server boot. */
  private safeActions: (() => Promise<void>) | null = null;

  constructor(config: RepoOSConfig, index: LiveIndex, cto: CTOManager, runner?: AgentRunner) {
    this.config = config;
    this.index = index;
    this.cto = cto;
    this.runner = runner;
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
      const detail = this.eventQueue.join("; ");
      this.eventQueue = [];
      void this.checkNow("event", detail);
    }, 2000);
  }

  /**
   * `kind` names the trigger (timer | event | manual); `detail` carries the
   * event reason(s). Both are recorded on the run so the Tokens view shows why
   * a CTO pass happened, not just that it did (#0649).
   */
  async checkNow(kind: string = "manual", detail?: string): Promise<void> {
    if (!this.cto.enabled()) return;

    // This is deliberately independent of the CTO's longer report turn: an
    // engineer nudge should still be timely if a report is in progress.
    this.nudgeIdleActiveTasks();
    if (this.safeActions) {
      await this.safeActions();
    }

    if (this.cto.isRunning()) return;

    const built = this.buildDigest();
    if (!built) return;

    const materialHash = simpleHash(built.material);

    // Deterministic pre-check: a healthy board costs a tick, never a model
    // call. Record the material hash so the next material change re-runs.
    if (this.shouldSkipHealthy() && built.healthy) {
      this.lastMaterialHash = materialHash;
      return;
    }

    // Idempotence on the structural signal (task ids + stuck kinds + counts),
    // not the rendered text: an unchanged board with an idle-minute counter
    // ticking must not rerun the model. This replaces the old
    // identical-within-60s check, which both reran on cosmetic text changes
    // and gave up on a genuinely unchanged board after a minute.
    if (materialHash === this.lastMaterialHash) return;

    this.lastMaterialHash = materialHash;
    await this.cto.run(built.text, this.triggerLabel(kind, detail));
  }

  wireSafeActions(fn: () => Promise<void>): void {
    this.safeActions = fn;
  }

  private shouldSkipHealthy(): boolean {
    // Default on; an explicit false is the only way to opt out.
    return this.config.ctoSkipHealthy !== false;
  }

  private triggerLabel(kind: string, detail?: string): string {
    const trimmed = detail?.trim();
    return kind === "event" && trimmed ? `event: ${trimmed}` : kind;
  }

  /**
   * Resume a session only after durable evidence says its worktree has been
   * quiet for five minutes. AgentRunner rejects a busy turn, so this can never
   * interrupt an engineer who is merely thinking or running a long command.
   */
  private nudgeIdleActiveTasks(): void {
    const now = Date.now();
    const activeIds = new Set<string>();
    for (const task of this.index.getTasks("active")) {
      // Archived tasks are parked (#0657): never nudge them, even if their
      // underlying status is active.
      if (task.isArchived) continue;
      if (this.runner?.isPaused(task.id)) continue;
      activeIds.add(task.id);
      if (!this.runner?.isRunning(task.id)) continue;
      if (hasRecentWorktreeActivity(this.config.root, task.branch, AUTOMATIC_NUDGE_IDLE_MS, now)) {
        this.nudgedIdleTasks.delete(task.id);
        continue;
      }
      if (!this.isIdleLongEnough(task, now) || this.nudgedIdleTasks.has(task.id)) continue;
      if (this.runner?.isHandoffInFlight(task.id) || this.runner?.hasPendingHandoff(task.id)) {
        continue;
      }
      if (this.wasRecentlyNudged(task, now)) {
        this.nudgedIdleTasks.add(task.id);
        continue;
      }

      const engineer = resolveAgentForTask(this.config, task);
      // #0507: this nudge used to say "commit and hand off to review", which
      // engineers reasonably read as `repoos mv <id> review` — a bare
      // frontmatter write that skipped the checks and, because it moved the
      // task out of `active`, got the asking agent killed and booked as a dev
      // error (#0505, #0499). Name the command that actually records a handoff,
      // and say plainly that it does not move the task.
      const message =
        "CTO check-in: this task has been idle for five minutes. Please finish the current step, " +
        "run the relevant verification, then hand off — either run `repoos mv <this task's id> review` " +
        "or finish your reply with the `::repoos-handoff-ready::` signal. Both ask RepoOS to run the " +
        "checks and move the task; neither sets the status yourself. Or clearly report the blocker.";
      if (!this.cto.sendTaskMessage(task.id, message, engineer)) continue;

      // The write emits an SSE task.corrected event for the human. Apply it
      // immediately too; relying solely on the file watcher makes the board
      // lag on some filesystems.
      if (this.cto.recordAutomaticNudge(task)) {
        this.nudgedIdleTasks.add(task.id);
        void this.index.applyFileChange(task.absPath);
      }
    }
    for (const id of this.nudgedIdleTasks) {
      if (!activeIds.has(id)) this.nudgedIdleTasks.delete(id);
    }
  }

  private isIdleLongEnough(task: Task, now: number): boolean {
    const updated = task.updated_at ? Date.parse(task.updated_at) : NaN;
    return Number.isFinite(updated) && now - updated >= AUTOMATIC_NUDGE_IDLE_MS;
  }

  /** Cooldown survives a server reload, while the in-memory set handles normal idle stretches. */
  private wasRecentlyNudged(task: Task, now: number): boolean {
    const marker = new RegExp(`- ([^\\n]+) · ${AUTOMATIC_NUDGE_MARKER}`, "g");
    let match: RegExpExecArray | null;
    let last = 0;
    while ((match = marker.exec(task.body)) !== null) {
      const at = Date.parse(match[1]);
      if (Number.isFinite(at)) last = Math.max(last, at);
    }
    return last > 0 && now - last < AUTOMATIC_NUDGE_COOLDOWN_MS;
  }

  private buildDigest(): BuiltDigest | null {
    // Archived tasks are parked (#0657): they must not appear in the digest's
    // stuck list or count as work in progress. The status counts below come
    // from `index.counts()`, which already excludes them.
    const tasks = this.index.getTasks().filter((task) => !task.isArchived);
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

    const build = this.buildHealth();
    const processes = this.processHealth();
    lines.push("## Build and Process Health");
    lines.push("");
    lines.push(`- Build marker: ${build.label}`);
    lines.push(`- Zombie processes: ${processes.label}`);
    lines.push("");

    const healthy = stuckTasks.length === 0 && build.healthy && processes.healthy;

    // The material signal is what a run is *for*: task identities and why
    // each is stuck, the board counts, and a boolean build/process verdict.
    // It deliberately excludes the rendered text — including the per-minute
    // idle counters in describeStuckSignal — so a board that is unchanged in
    // substance never re-triggers a model call (#0649).
    const material = [
      `counts=${counts.inbox},${counts.ready},${counts.active},${counts.review},${counts.done}`,
      ...stuckTasks.map((t) => `${t.id}:${this.stuckKind(t)}`),
      `build=${build.healthy ? "ok" : "bad"}`,
      `proc=${processes.healthy ? "ok" : "bad"}`,
    ].join("|");

    return { text: lines.join("\n"), material, healthy };
  }

  /**
   * A stable, minute-free stuck classification — the structural reason a task
   * is stuck, not how long it has been that way.
   */
  private stuckKind(task: Task): string {
    if (task.status === "active") return "active-idle";
    if (task.status === "review") return "review-stale";
    if (task.body.includes("::handoff::") && task.status !== "done") return "handoff-no-done";
    return "unknown";
  }

  private buildHealth(): HealthSignal {
    try {
      const srcDir = join(this.config.root, "src");
      const distDir = join(this.config.root, "dist");

      if (!existsSync(srcDir) || !existsSync(distDir)) {
        return {
          healthy: false,
          label: "src or dist directory missing — cannot check staleness",
        };
      }

      const srcStat = statSync(srcDir);
      const distStat = statSync(distDir);
      const srcTime = srcStat.mtimeMs;
      const distTime = distStat.mtimeMs;

      if (distTime < srcTime) {
        const staleSec = Math.round((srcTime - distTime) / 1000);
        return {
          healthy: false,
          label: `⚠️ stale — src updated ${staleSec}s ago, dist needs rebuild`,
        };
      }
      return { healthy: true, label: "✓ fresh" };
    } catch {
      return { healthy: false, label: "? unable to check staleness" };
    }
  }

  private processHealth(): HealthSignal {
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
        return { healthy: false, label: "? unable to check processes" };
      }

      const lines = psOutput
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      if (lines.length === 0) {
        return { healthy: true, label: "✓ no stale processes detected" };
      }

      // Simple heuristic: if we have more than 2 serve/node processes running,
      // there may be zombies. This is a conservative check.
      const staleCount = Math.max(0, lines.length - 2);
      if (staleCount > 0) {
        return {
          healthy: false,
          label: `⚠️ possibly stale — ${staleCount} extra process(es) running`,
        };
      }
      return { healthy: true, label: "✓ processes look normal" };
    } catch {
      return { healthy: false, label: "? unable to check processes" };
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
