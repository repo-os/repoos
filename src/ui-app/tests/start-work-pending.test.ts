/**
 * Start work pending state (#0822): one click disables the action, shows
 * Starting… until the task reaches active, and a second click does not
 * re-post; failures clear the pending state.
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
  status: "ready",
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

describe("Start work pending (#0822)", () => {
  it("disables the button and shows Starting… until the task becomes active", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ status: "ready" });
    let resolveStart: (() => void) | undefined;
    const startPromise = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/diff-stats"))
          return json({ filesChanged: 0, additions: 0, deletions: 0 });
        if (url.includes("/start")) {
          await startPromise;
          return json({ ok: true });
        }
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountCard(pinia, task);
    const btn = wrapper.get('[data-test-id="task-card-action-footer"] button');
    expect(btn.text()).toContain("Start work");
    await btn.trigger("click");
    await flush();

    expect(repo.isStartWorkPending(task.id)).toBe(true);
    expect(btn.attributes("disabled")).toBeDefined();
    expect(btn.text()).toContain("Starting…");
    expect(wrapper.get('[data-test-id="task-card-agent-hint"]').text()).toContain("Starting…");

    const fetchMock = vi.mocked(fetch);
    const startCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/start"));
    expect(startCalls).toHaveLength(1);
    await btn.trigger("click");
    await flush();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/start"))).toHaveLength(1);

    resolveStart!();
    await flush();
    expect(repo.isStartWorkPending(task.id)).toBe(true);

    const es = FakeEventSource.instances[0];
    es.emit("task.updated", {
      type: "task.updated",
      task: { ...task, status: "active" },
      prev: { status: "ready" },
    });
    await flush();
    expect(repo.isStartWorkPending(task.id)).toBe(false);
  });

  it("clears pending and surfaces the error when start fails", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ status: "ready" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/start")) return json({ ok: false, reason: "already working" });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    await expect(repo.startWork(task)).rejects.toThrow("already working");
    expect(repo.isStartWorkPending(task.id)).toBe(false);
    expect(repo.toasts.some((t) => t.message === "already working")).toBe(true);
  });
});
