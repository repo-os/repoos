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

describe("Move to done (#0202-adjacent UX): closes the drawer and expands the integration bar", () => {
  it("closes the task drawer and un-collapses the integration bar on success", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/done") && opts?.method === "POST")
          return json({ ok: true, merged: true, conflicts: [], ff: true });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();

    // Start with the integration bar collapsed, as it would be after a user
    // previously folded it — the whole point of this feature is to force it
    // back open when a close-out kicks off.
    ui.setIntegrationBarCollapsed(true);
    expect(ui.integrationBarCollapsed).toBe(true);

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    expect(ui.active?.id).toBe("0001");

    const buttons = wrapper.findAll("button").filter((b) => b.text().includes("Move to done"));
    expect(buttons).toHaveLength(1);
    await buttons[0].trigger("click");
    await flush();
    await flush();

    expect(ui.active).toBeNull();
    expect(ui.integrationBarCollapsed).toBe(false);
  });

  it("does NOT close the drawer or expand the bar when the close-out fails", async () => {
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (url.endsWith("/done") && opts?.method === "POST")
          return {
            ok: false,
            status: 500,
            json: async () => ({ ok: false, error: "check failed" }),
          };
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    ui.setIntegrationBarCollapsed(true);

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    ui.open(task);
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    const buttons = wrapper.findAll("button").filter((b) => b.text().includes("Move to done"));
    await buttons[0].trigger("click");
    await flush();
    await flush();

    expect(ui.active?.id).toBe("0001"); // drawer stays open on failure
    expect(ui.integrationBarCollapsed).toBe(true); // bar stays as the user left it
  });
});
