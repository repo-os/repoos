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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaskCard stuck-agent detection", () => {
  it("shows 'coding' while output keeps arriving, then flips to 'stuck' after 5 minutes of silence", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
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
      id: "0001",
      at: new Date().toISOString(),
    });
    await flush();

    let hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-coding");
    expect(hint.text()).toContain("coding");

    // Silence for 5+ minutes: no further agent.output events, just time passing.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000);
    await flush();

    hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-stuck");
    expect(hint.text()).toContain("stuck");
    expect(hint.classes()).not.toContain("tc-coding");
  });

  it("stays 'coding' when output keeps arriving past the 5-minute mark", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
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
      id: "0001",
      at: new Date().toISOString(),
    });
    await flush();

    // Keep emitting real output every minute for 6 minutes — never silent
    // long enough to trip the 5-minute threshold.
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
      FakeEventSource.instances[0].emit("agent.output", {
        type: "agent.output",
        id: "0001",
        entry: { s: "out", d: "still going", t: Date.now() },
      });
      await flush();
    }

    const hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-coding");
    expect(hint.classes()).not.toContain("tc-stuck");
  });
});
