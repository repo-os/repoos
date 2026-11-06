/**
 * #1034 — clamp long check-wait / needs-input diagnostics on the card and
 * drawer; full text lives in Debug → Status details.
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const LONG_WAIT =
  "waiting: waiting for a local check slot (3 ahead, position 4); waiting behind #1030 check (pid 50649, alive), #1024 check (pid 70210, alive), #1024 check (pid 57029, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 11s";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "1034",
  title: "Check wait clamp fixture",
  type: "bug",
  status: "active",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: true,
  needsInputReason: "check-wait",
  needsInputDetail: LONG_WAIT,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/1034-fixture.md",
  absPath: "/tmp/repo/work/1034-fixture.md",
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
    worktreePath: "/tmp/wt",
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

function stubDrawerApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(pinia: Pinia, task: Task) {
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

describe("check-wait diagnostic clamp (#1034)", () => {
  it("clamps the card detail line and keeps the full text in Status details", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {};
    const task = makeTask();
    const wrapper = mount(TaskCard, { props: { task, dragEnabled: false } });

    const detail = wrapper.get('[data-test-id="task-card-needs-input-detail"]');
    expect(detail.classes()).not.toContain("tc-needs-detail--clamp");
    const clampedText = detail.get(".tc-needs-detail-text");
    expect(clampedText.classes()).toContain("tc-needs-detail-text--clamp");
    expect(detail.text()).toContain("waiting for a local check slot");
    // #1040 E1: the blurb alone is the affordance — no separate Details link.
    expect(detail.text()).not.toContain("Details");

    FakeEventSource.instances = [];
    stubDrawerApi(task);
    const drawer = await mountDrawer(pinia, task);
    const ui = useUiStore();
    ui.activeTab = "debug";
    ui.debugView = "status";
    await flush();

    const panelDetail = drawer.get('[data-test-id="drawer-needs-input-detail"]');
    expect(panelDetail.classes()).not.toContain("agent-waiting-detail--clamp");
    expect(panelDetail.get(".agent-waiting-detail-text").classes()).toContain(
      "agent-waiting-detail-text--clamp",
    );

    const statusBlock = drawer.find('[aria-label="Task status details"]');
    expect(statusBlock.exists()).toBe(true);
    expect(statusBlock.text()).toContain(LONG_WAIT);
  });

  it("opens Status details when a queued check hint is clicked", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {};
    const task = makeTask({
      needsInput: false,
      needsInputReason: undefined,
      needsInputDetail: undefined,
    });
    repo.resourceQueueMarkers = [
      {
        taskId: task.id,
        kind: "local-check",
        position: 2,
        ahead: 1,
        message: "waiting for a local check slot (1 ahead, position 2)",
        since: new Date().toISOString(),
      },
    ];
    const ui = useUiStore();
    const opened = vi.spyOn(ui, "openTask").mockResolvedValue();
    const wrapper = mount(TaskCard, { props: { task, dragEnabled: false } });

    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.classes()).toContain("tc-queued");
    await hint.trigger("click");
    expect(opened).toHaveBeenCalledWith(task);
    expect(ui.activeTab).toBe("debug");
    expect(ui.debugView).toBe("status");
  });

  it("opens the Debug tab when the clamped card detail is clicked", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {};
    const task = makeTask();
    const ui = useUiStore();
    const opened = vi.spyOn(ui, "openTask").mockResolvedValue();
    const wrapper = mount(TaskCard, { props: { task, dragEnabled: false } });

    await wrapper.get('[data-test-id="task-card-needs-input-detail"]').trigger("click");
    expect(opened).toHaveBeenCalledWith(task);
    expect(ui.activeTab).toBe("debug");
    expect(ui.debugView).toBe("status");
  });
});
