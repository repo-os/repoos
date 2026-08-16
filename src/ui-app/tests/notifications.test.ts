import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  useNotificationsStore,
  playBell,
  ensurePushPermission,
  sendPush,
  NOTIFICATION_TYPE_LABELS,
} from "../src/stores/notifications";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "inbox",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-test.md",
    absPath: "/tmp/repo/work/0001-test.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    ...over,
  }) as Task;

/** A working AudioContext stub that records created oscillators. */
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createOscillator(): { type: string; frequency: { value: number } } {
    return { type: "sine", frequency: { value: 0 } };
  }
  createGain(): { gain: { setValueAtTime: () => void; exponentialRampToValueAtTime: () => void } } {
    return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } };
  }
}

/** A Notification stub that records what got created. */
class FakeNotification {
  static permission = "granted";
  static instances: { title: string; body: string }[] = [];
  static requestPermission: (() => Promise<string>) | null = null;
  static __prompt__: (() => Promise<string>) | null = null;
  title: string;
  body: string;
  constructor(title: string, opts: { body?: string }) {
    this.title = title;
    this.body = opts.body ?? "";
    FakeNotification.instances.push({ title, body: this.body });
  }
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  FakeNotification.instances = [];
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission = null;
  FakeNotification.__prompt__ = null;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifications store defaults + persistence", () => {
  it("defaults everything to off", () => {
    const n = useNotificationsStore();
    expect(n.soundEnabled).toBe(false);
    expect(n.pushEnabled).toBe(false);
    expect(n.types).toEqual({ review: false, paused: false, stuck: false, needsInput: false });
    expect(n.isActive).toBe(false);
  });

  it("persists choices across reloads (localStorage)", () => {
    const n = useNotificationsStore();
    n.setSoundEnabled(true);
    n.setTypeEnabled("review", true);
    expect(n.soundEnabled).toBe(true);
    expect(n.types.review).toBe(true);

    // A "fresh" store instance must read the persisted values back.
    setActivePinia(createPinia());
    const reloaded = useNotificationsStore();
    expect(reloaded.soundEnabled).toBe(true);
    expect(reloaded.types.review).toBe(true);
    expect(reloaded.types.stuck).toBe(false);
  });
});

describe("bell sound (playBell)", () => {
  it("silently no-ops without an AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playBell()).not.toThrow();
  });

  it("synthesises oscillators when audio is available and returns", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    expect(() => playBell()).not.toThrow();
  });
});

describe("push permission + delivery", () => {
  it("requests permission when not granted", async () => {
    FakeNotification.permission = "default";
    FakeNotification.__prompt__ = vi.fn(async () => "granted");
    const stubbed = Object.assign(
      class extends FakeNotification {
        static override permission = "default";
        static override __prompt__: (() => Promise<string>) | null = null;
      },
      {
        requestPermission() {
          return FakeNotification.__prompt__?.() ?? Promise.resolve("denied");
        },
      },
    );
    vi.stubGlobal("Notification", stubbed);
    expect(await ensurePushPermission()).toBe(true);
  });

  it("does not send without granted permission", () => {
    FakeNotification.permission = "denied";
    sendPush("t", "b");
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("sends when permission is granted", () => {
    FakeNotification.permission = "granted";
    sendPush("Title", "Body");
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]).toEqual({ title: "Title", body: "Body" });
  });
});

describe("notify() gating", () => {
  it("does nothing when only the type is enabled but no master channel", async () => {
    const n = useNotificationsStore();
    n.setTypeEnabled("review", true);
    await n.notify("review", "t", "b");
    expect(FakeNotification.instances).toHaveLength(0);
    expect(n.isActive).toBe(false);
  });

  it("sends a push only when the push master + type are enabled", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("review", true);
    await n.notify("review", "Title", "Body");
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it("does nothing when the type is disabled even if masters are on", async () => {
    const n = useNotificationsStore();
    n.setSoundEnabled(true);
    n.setPushEnabled(true);
    await n.notify("stuck", "t", "b");
    expect(FakeNotification.instances).toHaveLength(0);
    expect(n.isActive).toBe(false);
  });
});

describe("NOTIFICATION_TYPE_LABELS", () => {
  it("covers all four types", () => {
    expect(Object.keys(NOTIFICATION_TYPE_LABELS).sort()).toEqual([
      "needsInput",
      "paused",
      "review",
      "stuck",
    ]);
  });
});

/** Minimal EventSource stub so the repo store's SSE wiring runs in tests. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }
  emit(t: string, data: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ data: JSON.stringify(data) });
  }
  close(): void {
    /* noop */
  }
}

function mockFetch(): void {
  const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/api/health")) {
      return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work", board: {} });
    }
    if (url.includes("/api/board") || url.includes("/api/index")) {
      return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
    }
    if (url.includes("/api/agents/running")) return json({ tasks: [] });
    throw new Error("unexpected fetch: " + url);
  });
  vi.stubGlobal("fetch", fetchMock);
}

/** Boot a repo store connected to a fake EventSource (fully awaited). */
async function bootRepo(): Promise<{ es: FakeEventSource }> {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  mockFetch();
  const repo = useRepoStore();
  await repo.init();
  return { es: FakeEventSource.instances[0] };
}

/** Flush pending microtasks so fire-and-forget async notify() settles. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("transition detection (repo store)", () => {
  beforeEach(() => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("Notification", FakeNotification);
  });

  it("fires review notification on active -> review when enabled", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("review", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      task: makeTask({ status: "review" }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task ready for review");
  });

  it("fires needsInput when the flag flips true", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("needsInput", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active", needsInput: false }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { needsInput: false },
      task: makeTask({ status: "active", needsInput: true }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task needs attention");
  });

  it("does not notify for a pre-existing review state without a transition", async () => {
    const n = useNotificationsStore();
    n.setSoundEnabled(true);
    n.setPushEnabled(true);
    n.setTypeEnabled("review", true);
    await bootRepo();
    // A task.updated with an empty prev (no status change, e.g. hydration or a
    // body edit) on a task already in review must not fire.
    const { es } = await bootRepo();
    es.emit("task.updated", { type: "task.updated", prev: {}, task: makeTask({ status: "review" }) });
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("fires stuck when the watchdog surfaces a stuck task to `ready`", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("stuck", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      // The watchdog safely lands a stuck task in `ready` (no work to review)
      // and writes its own marker into the body.
      task: makeTask({
        status: "ready",
        needsInput: false,
        body: "watchdog: auto-surfaced stuck task · status active→ready",
      }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task looks stuck");
  });

  it("fires stuck (not \"review ready\") when a stuck task is surfaced to `review`", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    // Only the *stuck* type is enabled; a misclassification would gate the
    // notification behind the review toggle and never fire it.
    n.setTypeEnabled("stuck", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      // The watchdog surfaces a stuck task with work into `review`; its marker
      // is the only thing distinguishing it from a genuine review handoff.
      task: makeTask({
        status: "review",
        needsInput: false,
        body: "watchdog: auto-surfaced stuck task · status active→review",
      }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task looks stuck");
  });

  it("still fires \"review ready\" for a genuine active -> review handoff", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("stuck", true);
    n.setTypeEnabled("review", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      // No watchdog marker — a normal handoff, reported as review-ready.
      task: makeTask({ status: "review", needsInput: false }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task ready for review");
  });

  it("does not fire stuck on a manual active -> ready rollback", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("stuck", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      // A human moves the active task back to ready — no watchdog marker, so
      // it must not be reported as "stuck".
      task: makeTask({ status: "ready", needsInput: false }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("fires stuck (not needs-attention) for a watchdog escalation to needsInput", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("stuck", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active", needsInput: false }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { needsInput: false },
      // watchdog.autoTransition off -> escalated to needsInput, still active.
      task: makeTask({
        status: "active",
        needsInput: true,
        body: "watchdog: escalated to needs_input",
      }),
    });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task looks stuck");
  });

  it("fires paused on agent.exited for an active task", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("paused", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("agent.running", { type: "agent.running", id: "0001" });
    es.emit("agent.exited", { type: "agent.exited", id: "0001" });
    await flush();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].title).toBe("Task paused");
  });

  it("does not fire paused when the active task handed off to review first", async () => {
    const n = useNotificationsStore();
    n.setPushEnabled(true);
    n.setTypeEnabled("paused", true);
    const { es } = await bootRepo();
    es.emit("task.created", { type: "task.created", task: makeTask({ status: "active" }) });
    es.emit("task.updated", {
      type: "task.updated",
      prev: { status: "active", needsInput: false },
      task: makeTask({ status: "review" }),
    });
    es.emit("agent.exited", { type: "agent.exited", id: "0001" });
    await flush();
    // Status is review by the time the agent exits — not a pause.
    expect(FakeNotification.instances).toHaveLength(0);
  });
});
