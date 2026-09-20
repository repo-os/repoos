import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
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

function stubApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

describe("critical task status placement in the drawer (#0456)", () => {
  it("renders the needs-input banner above the tab strip, outside every tab body", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({
      status: "review",
      needsInput: true,
      needsInputReason: "review-failed",
      needsInputDetail: "the opencode agent exited without output: no output produced",
    });
    stubApi(task);

    const wrapper = await mountDrawer(pinia, task);

    const banner = wrapper.find(".drawer-critical .agent-waiting");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("waiting for you");
    // "reviewer crashed" is exactly the review-failed reason (#0456).
    expect(banner.text()).toContain(
      "The reviewer crashed or timed out without producing a report.",
    );

    // It sits above the tabs, not inside any tab body — so no tab switch can
    // hide it.
    const tabs = wrapper.find(".drawer-tabs");
    expect(tabs.exists()).toBe(true);
    expect(banner.element.closest(".drawer-tabs")).toBeNull();
    expect(banner.element.closest(".drawer-body")).toBeNull();
    const relation = banner.element.compareDocumentPosition(tabs.element);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Visible on every tab, including the Dev tab where it used to be buried.
    const ui = useUiStore();
    for (const tab of ["details", "agent", "review", "changes"] as const) {
      ui.activeTab = tab;
      await flush();
      expect(wrapper.find(".drawer-critical .agent-waiting").exists()).toBe(true);
    }
  });
});
