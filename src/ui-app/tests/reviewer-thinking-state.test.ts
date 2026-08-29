import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
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
  automaticReview: { running: true, enabled: true },
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

const REPORT = {
  id: "0001",
  at: "2026-08-15T00:00:00Z",
  agent: "reviewer",
  cli: "opencode",
  model: "default",
  branch: "feat/test",
  state: "ok" as const,
  markdown: "## Verdict\n`good to go` — the change is correct.",
};

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

async function mountDrawer(pinia: Pinia, task: Task): Promise<ReturnType<typeof mount>> {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true },
    },
  });
  await flush();
  return wrapper;
}

describe("reviewer thinking state in the task panel (#0209)", () => {
  it("shows a visible working indicator while the reviewer is running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({
            tasks: [makeTask()],
            counts: { ...EMPTY_COUNTS, review: 1 },
            taskCount: 1,
          });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: true, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, makeTask());

    // Quickbar: prominent animated status with spinner + status text.
    const working = wrapper.find(".drawer-run.reviewing");
    expect(working.exists()).toBe(true);
    expect(working.text()).toContain("Reviewer is reviewing this task…");
    expect(working.find(".ai").exists()).toBe(true);

    // Reviewer tab (default for a task in review): banner + thinking placeholder.
    expect(wrapper.find(".review-running").exists()).toBe(true);
    expect(wrapper.find(".review-thinking").exists()).toBe(true);
    expect(wrapper.find(".review-thinking").text()).toContain("The reviewer is thinking…");

    // The report has not landed yet — no report card, and the indicator is live.
    expect(wrapper.find(".review-card").exists()).toBe(false);
    expect(repo.reviewFor("0001")?.running).toBe(true);
  });

  it("clears the indicator and shows the report when the review completes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    let reviewReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review")) {
          reviewReads++;
          // First hydration happens while the review is still running; the
          // second happens after the ready event and returns the report.
          return reviewReads > 1
            ? json({ ok: true, running: false, enabled: true, review: REPORT, lines: [] })
            : json({ ok: true, running: true, enabled: true, review: null, lines: [] });
        }
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();

    const wrapper = await mountDrawer(pinia, task);
    expect(wrapper.find(".drawer-run.reviewing").exists()).toBe(true);

    // The review finishes: SSE marks it ready and the report is loaded.
    FakeEventSource.instances[0].emit("review", {
      type: "review",
      id: "0001",
      state: "ready",
      at: "2026-08-15T00:00:00Z",
    });
    await flush();
    await flush();

    expect(repo.reviewFor("0001")?.running).toBe(false);
    expect(wrapper.find(".drawer-run.reviewing").exists()).toBe(false);
    expect(wrapper.find(".review-running").exists()).toBe(false);
    expect(wrapper.find(".review-thinking").exists()).toBe(false);
    // The report now appears as usual.
    expect(wrapper.find(".review-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("good to go");
  });
});
