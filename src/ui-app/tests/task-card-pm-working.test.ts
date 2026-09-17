/**
 * 0381: a PM run in progress (chat turn or draft flesh-out) shows on the task
 * card in ANY status, not just drafts — the chip with the violet pulsing
 * language, the violet card border, and it clears when the run finishes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "active",
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
  automaticReview: { running: false, enabled: true },
  ...over,
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
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

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

async function mountCard(pinia: Pinia, task: Task) {
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  await flush();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskCard PM-working indicator (0381)", () => {
  it("shows the chip and violet border on a non-draft task, then clears on pmFinished", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ id: "0007", status: "inbox" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, inbox: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/diff-stats"))
          return json({ filesChanged: 0, additions: 0, deletions: 0 });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    // Idle: no chip at all.
    const idle = await mountCard(pinia, task);
    expect(idle.find(".tc-hint").exists()).toBe(false);
    expect(idle.find("article").classes()).not.toContain("pm-working");

    // The PM chat turn starts (task.pmWorking from the server).
    FakeEventSource.instances[0].emit("task.pmWorking", {
      type: "task.pmWorking",
      id: "0007",
      at: new Date().toISOString(),
    });
    await flush();

    const working = await mountCard(pinia, task);
    const hint = working.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-pm-working");
    expect(hint.text()).toContain("PM is working");
    expect(working.find("article").classes()).toContain("pm-working");

    // The run ends (success or failure) — the chip and border clear.
    FakeEventSource.instances[0].emit("task.pmFinished", {
      type: "task.pmFinished",
      id: "0007",
      at: new Date().toISOString(),
    });
    await flush();

    const done = await mountCard(pinia, task);
    expect(done.find(".tc-hint").exists()).toBe(false);
    expect(done.find("article").classes()).not.toContain("pm-working");
  });

  it("shows on an active (paused) task too, under needs-input", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ id: "0008", status: "active", needsInput: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/diff-stats"))
          return json({ filesChanged: 0, additions: 0, deletions: 0 });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountCard(pinia, task);
    FakeEventSource.instances[0].emit("task.pmWorking", {
      type: "task.pmWorking",
      id: "0008",
      at: new Date().toISOString(),
    });
    await flush();

    const hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-pm-working");
    expect(hint.classes()).not.toContain("tc-stalled");
  });

  it("keeps the coding hint while the engineer runs, even with the PM working", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ id: "0009", status: "active" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/diff-stats"))
          return json({ filesChanged: 0, additions: 0, deletions: 0 });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountCard(pinia, task);
    FakeEventSource.instances[0].emit("agent.running", {
      type: "agent.running",
      id: "0009",
      at: new Date().toISOString(),
    });
    FakeEventSource.instances[0].emit("task.pmWorking", {
      type: "task.pmWorking",
      id: "0009",
      at: new Date().toISOString(),
    });
    await flush();

    const hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-coding");
    expect(hint.classes()).not.toContain("tc-pm-working");
  });
});
