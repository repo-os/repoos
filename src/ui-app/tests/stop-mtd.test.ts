/**
 * #0459 — Stop MTD button in the task drawer.
 *
 * While a task is in the close-out pipeline (`inPipeline`), the drawer offers
 * a Stop MTD control that POSTs `/api/tasks/:id/done/cancel` and drops the task
 * from the pipeline snapshot so Move to done becomes actionable again.
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { IntegrationPipelineSnapshot, Task } from "../src/types";

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
  branch: "feat/t",
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
    branchExists: true,
    worktreeExists: true,
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
  close(): void {
    /* noop */
  }
}

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
}

function pipeline(taskId: string): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: { taskId, stage: "check", failed: false, startedAt: "2026-09-20T00:00:00Z" },
    queue: [],
    at: "2026-09-20T00:00:00Z",
  };
}

describe("Stop MTD (#0459)", () => {
  it("shows Stop MTD while in the pipeline and cancels on click", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        calls.push(`${opts?.method ?? "GET"} ${url}`);
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.includes("/done/cancel") && opts?.method === "POST") return json({ ok: true });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    // The server snapshot says this task is mid-close-out.
    repo.integration = pipeline("0001");

    const ui = useUiStore();
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    const stopButtons = wrapper.findAll("button").filter((b) => b.text().includes("Stop MTD"));
    expect(stopButtons).toHaveLength(1);

    await stopButtons[0].trigger("click");
    await flush();

    expect(calls.some((c) => c === "POST /api/tasks/0001/done/cancel")).toBe(true);
    // The task is back out of the pipeline: no Stop button, Move to done again.
    expect(wrapper.findAll("button").filter((b) => b.text().includes("Stop MTD"))).toHaveLength(0);
    expect(wrapper.findAll("button").some((b) => b.text().includes("Move to done"))).toBe(true);
    expect(ui.active?.id).toBe("0001");
  });
});
