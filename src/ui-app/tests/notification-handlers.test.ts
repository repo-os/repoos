/**
 * Lifecycle notification handler subscribers (#0542): the agent-completed
 * notification (a turn ended and nothing took over) and the needsMerge merge
 * conflict notification — plus the flag-edge discipline both rely on, since
 * the index's `prev` payload is a diff of changed fields.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import type { RepoEvent } from "../../server/live-index.js";
import type { LiveIndex } from "../../server/live-index.js";
import {
  attachTaskNotificationHandlers,
  notificationContextFromConfig,
} from "../../server/notifications/index.js";
import type {
  NotificationPayload,
  NotificationProvider,
} from "../../server/notifications/types.js";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    telegram: { enabled: false },
    ntfyEnabled: false,
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-notification-handlers-"));
});

afterEach(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function taskFixture(over: Partial<Task> = {}): Task {
  return {
    id: "0042",
    title: "Fix the widget",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/fix-the-widget",
    tags: [],
    created_at: null,
    updated_at: null,
    releasedAt: null,
    path: "work/0042-fix.md",
    absPath: join(root, "work/0042-fix.md"),
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...over,
  };
}

/** Minimal index double: listener registry + task map. */
class FakeIndex {
  listeners = new Set<(e: RepoEvent) => void>();
  tasks = new Map<string, Task>();

  getTask(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  on(fn: (e: RepoEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: RepoEvent): void {
    for (const fn of [...this.listeners]) fn(e);
  }
}

interface Captured {
  payload: NotificationPayload;
}

function captureProvider(captured: Captured[]): NotificationProvider {
  return {
    id: "capture",
    isEnabled: () => true,
    deliver: (_ctx, payload) => {
      captured.push({ payload });
    },
  };
}

const idleRunner = (): {
  isRunning: () => boolean;
  isQueued: () => boolean;
  isHandoffInFlight: () => boolean;
  isPaused: () => boolean;
} => ({
  isRunning: () => false,
  isQueued: () => false,
  isHandoffInFlight: () => false,
  isPaused: () => false,
});

const at = (): string => new Date().toISOString();

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 15));
}

describe("agent-completed notification (#0542)", () => {
  it("notifies when a turn ended and the task is left active with nothing running", async () => {
    const index = new FakeIndex();
    const task = taskFixture();
    index.tasks.set(task.id, task);
    const captured: Captured[] = [];
    const dispose = attachTaskNotificationHandlers(
      index as unknown as LiveIndex,
      notificationContextFromConfig(config(root), null),
      { providers: [captureProvider(captured)], runner: idleRunner(), completedGraceMs: 0 },
    );
    index.emit({ type: "agent.exited", id: task.id, at: at() });
    await settle();
    const kinds = captured.map((c) => c.payload.kind);
    expect(kinds).toContain("task.agent_completed");
    const payload = captured.find((c) => c.payload.kind === "task.agent_completed")?.payload;
    expect(payload?.summary).toContain("/msg 0042");
    expect(payload?.severity).toBe("low");
    dispose();
  });

  it("stays silent when the task needs input, is paused, is queued again, or a handoff is in flight", async () => {
    const captured: Captured[] = [];
    const base = taskFixture();

    const withTask = (over: Partial<Task>, runner = idleRunner()): LiveIndex => {
      const index = new FakeIndex();
      const task = taskFixture(over);
      index.tasks.set(task.id, task);
      attachTaskNotificationHandlers(
        index as unknown as LiveIndex,
        notificationContextFromConfig(config(root), null),
        { providers: [captureProvider(captured)], runner, completedGraceMs: 0 },
      );
      index.emit({ type: "agent.exited", id: task.id, at: at() });
      return index as unknown as LiveIndex;
    };

    withTask({ needsInput: true });
    withTask({ needsMerge: true });
    withTask({}, { ...idleRunner(), isRunning: () => true });
    withTask({}, { ...idleRunner(), isQueued: () => true });
    withTask({}, { ...idleRunner(), isPaused: () => true });
    withTask({}, { ...idleRunner(), isHandoffInFlight: () => true });
    await settle();
    expect(captured.map((c) => c.payload.kind)).toEqual([]);
  });

  it("ignores non-task session exits (review:, pm chats) and re-fires only after a new exit", async () => {
    const index = new FakeIndex();
    const task = taskFixture();
    index.tasks.set(task.id, task);
    const captured: Captured[] = [];
    const dispose = attachTaskNotificationHandlers(
      index as unknown as LiveIndex,
      notificationContextFromConfig(config(root), null),
      { providers: [captureProvider(captured)], runner: idleRunner(), completedGraceMs: 0 },
    );
    // Review sessions run under `review:<taskId>` keys; getTask resolves
    // neither that shape nor unknown ids.
    index.emit({ type: "agent.exited", id: `review:${task.id}`, at: at() });
    index.emit({ type: "agent.exited", id: "pm-task-v2:0042::user@test.com", at: at() });
    await settle();
    expect(captured).toEqual([]);
    index.emit({ type: "agent.exited", id: task.id, at: at() });
    await settle();
    expect(captured.map((c) => c.payload.kind)).toEqual(["task.agent_completed"]);
    dispose();
  });
});

describe("needsMerge + needsInput flag-edge notifications (#0542)", () => {
  it("notifies a merge conflict exactly once, when the flag flips on", async () => {
    const index = new FakeIndex();
    const task = taskFixture({ needsMerge: false });
    index.tasks.set(task.id, task);
    const captured: Captured[] = [];
    const dispose = attachTaskNotificationHandlers(
      index as unknown as LiveIndex,
      notificationContextFromConfig(config(root), null),
      { providers: [captureProvider(captured)] },
    );

    const emitted = (over: Partial<Task>, prev: Partial<Task>): void => {
      index.tasks.set(task.id, taskFixture(over));
      index.emit({ type: "task.updated", task: taskFixture(over), prev, at: at() });
    };

    // false → true fires.
    emitted({ needsMerge: true }, { needsMerge: false });
    expect(captured.map((c) => c.payload.kind)).toEqual(["task.integration_failed"]);
    expect(captured[0].payload.headline).toContain("Merge conflict");
    // Held flag with an unrelated write (prev lacks the key) is silent.
    emitted({ needsMerge: true, title: "Renamed" }, { title: "Fix the widget", updated_at: "x" });
    expect(captured).toHaveLength(1);
    // Cleared then re-flagged fires again.
    emitted({ needsMerge: false }, { needsMerge: true });
    emitted({ needsMerge: true }, { needsMerge: false });
    expect(captured).toHaveLength(2);
    dispose();
  });

  it("does not duplicate the needs-input push while the flag is held", async () => {
    const index = new FakeIndex();
    const task = taskFixture({ needsInput: true, needsInputReason: "review-failed" });
    index.tasks.set(task.id, task);
    const captured: Captured[] = [];
    const dispose = attachTaskNotificationHandlers(
      index as unknown as LiveIndex,
      notificationContextFromConfig(config(root), null),
      { providers: [captureProvider(captured)] },
    );

    // An unrelated write (title/updated_at) while the flag is held must not
    // re-fire "Needs you" — the prev diff does not contain needsInput.
    index.tasks.set(task.id, taskFixture({ ...task, title: "Renamed" }));
    index.emit({
      type: "task.updated",
      task: taskFixture({ ...task, title: "Renamed" }),
      prev: { title: "Fix the widget", updated_at: "2026-09-28T00:00:01Z" },
      at: at(),
    });
    expect(captured).toEqual([]);

    // The actual off → on edge still fires.
    index.emit({
      type: "task.updated",
      task: taskFixture({ needsInput: true, needsInputReason: "dev-error" }),
      prev: { needsInput: false },
      at: at(),
    });
    expect(captured.map((c) => c.payload.kind)).toEqual(["task.agent_failed"]);
    dispose();
  });
});
