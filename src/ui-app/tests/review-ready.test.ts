import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeReviewTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "review",
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

async function setupRepo(task: Task) {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/integration/pipeline")) return json({ ok: true, pipeline: null });
      if (url.includes("/diff-stats")) return json({ filesChanged: 0, additions: 0, deletions: 0 });
      throw new Error("unexpected fetch: " + url);
    }),
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  const repo = useRepoStore();
  await repo.init();
  return { pinia, repo };
}

function doneButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.find(".tc-actions button");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaskCard review-ready highlight (0270)", () => {
  it("highlights the Move to done button once review passed clean", async () => {
    const task = makeReviewTask();
    const { pinia } = await setupRepo(task);

    const wrapper = await mountCard(pinia, task);

    const card = wrapper.find(".task-card");
    expect(card.classes()).toContain("review-ready");

    const btn = doneButton(wrapper);
    expect(btn.exists()).toBe(true);
    expect(btn.classes()).toContain("review-ready");
    // The Move to done button uses the done-green footer treatment.
    expect(btn.classes()).toContain("text-[var(--green)]");
  });

  it("shows the 'ready to finish' card cue while review passed clean", async () => {
    const task = makeReviewTask();
    const { pinia } = await setupRepo(task);

    const wrapper = await mountCard(pinia, task);
    const hint = wrapper.find(".tc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.classes()).toContain("tc-human");
    expect(hint.text()).toContain("ready to finish");
  });

  it("does NOT highlight while the automatic review is still running", async () => {
    const task = makeReviewTask();
    const { pinia } = await setupRepo(task);

    FakeEventSource.instances[0].emit("review", {
      type: "review",
      id: task.id,
      state: "running",
    });
    await flush();

    const wrapper = await mountCard(pinia, task);
    const card = wrapper.find(".task-card");
    expect(card.classes()).not.toContain("review-ready");
    expect(doneButton(wrapper).classes()).not.toContain("review-ready");
    expect(doneButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("does NOT highlight while the engineer is still coding", async () => {
    const task = makeReviewTask();
    const { pinia } = await setupRepo(task);

    FakeEventSource.instances[0].emit("agent.running", {
      type: "agent.running",
      id: task.id,
      at: new Date().toISOString(),
    });
    await flush();

    const wrapper = await mountCard(pinia, task);
    const card = wrapper.find(".task-card");
    expect(card.classes()).not.toContain("review-ready");
    expect(doneButton(wrapper).classes()).not.toContain("review-ready");
  });

  it("does NOT highlight while the task is mid close-out (in pipeline)", async () => {
    const task = makeReviewTask();
    const { pinia } = await setupRepo(task);

    FakeEventSource.instances[0].emit("review", {
      type: "review",
      id: task.id,
      state: "ready",
    });
    FakeEventSource.instances[0].emit("integration", {
      type: "integration",
      pipeline: {
        empty: false,
        active: { taskId: task.id, stage: "merge", failed: false },
        queue: [],
        at: new Date().toISOString(),
      },
    });
    await flush();

    const wrapper = await mountCard(pinia, task);
    const card = wrapper.find(".task-card");
    expect(card.classes()).not.toContain("review-ready");
    const btn = doneButton(wrapper);
    expect(btn.classes()).not.toContain("review-ready");
    expect(btn.attributes("disabled")).toBeDefined();
  });
});
