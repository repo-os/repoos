/**
 * #1137: a phone has ONE task detail, whichever entry point opened it. The
 * shared TaskDrawer is mounted by App.vue for every route; queue cards, Search
 * and ?task= deep links all feed the same `ui.openTask` / `?tab=` path.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { defineComponent } from "vue";
import App from "../src/App.vue";
import WorkView from "../src/views/WorkView.vue";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import NoticeBell from "../src/components/NoticeBell.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import * as apiMod from "../src/api";
import type { Task } from "../src/types";
import { EMPTY_COUNTS, FakeEventSource, flush, json } from "./component-test-helpers";

const api = vi.spyOn(apiMod, "api");

const buttonStub = {
  template: "<button v-bind='$attrs'><slot /></button>",
  inheritAttrs: false,
};
const selectStub = { template: "<div><slot /></div>" };

function workViewStubs() {
  return {
    BoardColumn: { template: "<div class='desktop-board-column' />", props: ["col"] },
    IntegrationStatusBar: { template: "<div class='integration-status-bar' />" },
    Button: buttonStub,
    Select: selectStub,
    SelectTrigger: selectStub,
    SelectContent: selectStub,
    SelectItem: selectStub,
    SelectViewport: selectStub,
    SelectValue: selectStub,
    PipelineView: true,
  };
}

function stubPhoneViewport(width = 390): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal("innerWidth", width);
}

async function phoneRouter(path = "/work"): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/work", component: { template: "<div />" } },
      { path: "/search", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

function task(id: string, status: Task["status"] = "ready"): Task {
  return {
    id,
    title: `Shared mobile detail for ${id}`,
    type: "feature",
    status,
    priority: "p1",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "tester",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: `work/${id}-task.md`,
    absPath: `/work/${id}-task.md`,
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
  } as Task;
}

beforeEach(() => {
  setActivePinia(createPinia());
  api.mockReset();
  api.mockResolvedValue(task("0042"));
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  api.mockReset();
});

describe("phone task detail entry points (#1137)", () => {
  it("opens the shared detail from a queue card tap", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.loading = false;
    repo.tasks = [task("0042", "review")];

    const wrapper = mount(WorkView, {
      global: { plugins: [router], stubs: workViewStubs() },
    });
    await flushPromises();

    const card = wrapper.get(".mobile-task-card");
    await card.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query.task).toBe("0042");
    // The same watcher that serves ?task= deep links opened the shared detail.
    expect(ui.active?.id).toBe("0042");
    // A review task lands on the same default tab as the desktop drawer.
    expect(ui.activeTab).toBe("review");
    wrapper.unmount();
  });

  it("opens the shared detail from a Search result", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/search");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.tasks = [task("0042", "ready")];

    const wrapper = mount(SearchOverlay, {
      props: { open: true, scope: "work" },
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    input.value = "Shared mobile detail";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const row = document.body.querySelector(".search-row") as HTMLElement;
    expect(row).toBeTruthy();
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(ui.active?.id).toBe("0042");
    // Queue cards, Search and the notices bell all use the same openTask path.
    expect(ui.activeTab).toBe("details");
    wrapper.unmount();
  });

  it("opens the shared detail from the notices bell", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.tasks = [task("0042", "review")];

    const wrapper = mount(NoticeBell, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await wrapper.get(".notice-bell-trigger").trigger("click");
    await flushPromises();

    const row = document.body.querySelector(".notice-pop .notice-body") as HTMLElement;
    expect(row).toBeTruthy();
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(ui.active?.id).toBe("0042");
    expect(ui.activeTab).toBe("review");
    wrapper.unmount();
  });

  it("lands on the tab a ?task=<id>&tab= deep link names", async () => {
    stubPhoneViewport(360);
    const router = await phoneRouter("/work?task=0042&tab=changes");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.loading = false;
    repo.tasks = [task("0042", "review")];

    const wrapper = mount(WorkView, {
      global: { plugins: [router], stubs: workViewStubs() },
    });
    await flushPromises();

    expect(ui.active?.id).toBe("0042");
    expect(ui.activeTab).toBe("changes");
    // The phone route keeps the param so browser Back returns to the queue.
    expect(router.currentRoute.value.query.task).toBe("0042");
    wrapper.unmount();
  });

  it("shows the phone loading shell while a deep-linked task is still resolving", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work?task=0999");
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [];
    api.mockReturnValue(new Promise(() => {}) as never);

    const wrapper = mount(WorkView, {
      global: { plugins: [router], stubs: workViewStubs() },
    });
    await flushPromises();

    const state = wrapper.get("[data-testid='mobile-task-detail-state']");
    expect(state.text()).toContain("Loading task…");
    // The queue is covered by a real surface, not left blank.
    expect(wrapper.find("[data-testid='mobile-work-queue']").isVisible()).toBe(false);
    wrapper.unmount();
  });

  it("shows a not-found shell with Return to Work when a deep-linked task cannot load", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work?task=4040");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.loading = false;
    repo.tasks = [];
    api.mockRejectedValue(new Error("404"));

    const wrapper = mount(WorkView, {
      global: { plugins: [router], stubs: workViewStubs() },
    });
    await flushPromises();

    const state = wrapper.get("[data-testid='mobile-task-detail-state']");
    expect(state.text()).toContain("Task unavailable");
    expect(wrapper.find("[data-testid='mobile-work-queue']").isVisible()).toBe(false);

    await state.get("button").trigger("click");
    await flushPromises();

    expect(ui.active).toBeNull();
    expect(router.currentRoute.value.query.task).toBeUndefined();
    expect(wrapper.find("[data-testid='mobile-task-detail-state']").exists()).toBe(false);
    expect(
      (wrapper.find("[data-testid='mobile-work-queue']").element as HTMLElement).style.display,
    ).not.toBe("none");
    wrapper.unmount();
  });

  it("ignores a stale deep-link fetch after the user returns to the queue", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work?task=0999");
    const repo = useRepoStore();
    const ui = useUiStore();
    repo.loading = false;
    repo.tasks = [];
    let resolveFetch: (value: Task) => void = () => {};
    api.mockReturnValue(
      new Promise<Task>((resolve) => {
        resolveFetch = resolve;
      }) as never,
    );

    const wrapper = mount(WorkView, {
      global: { plugins: [router], stubs: workViewStubs() },
    });
    await flushPromises();
    expect(wrapper.find("[data-testid='mobile-task-detail-state']").exists()).toBe(true);

    // Return to Work before the fetch settles (same path as clearing the URL).
    await router.replace({ path: "/work", query: {} });
    resolveFetch(task("0999"));
    await flushPromises();

    expect(ui.active).toBeNull();
    expect(wrapper.find("[data-testid='mobile-task-detail-state']").exists()).toBe(false);
    expect(
      (wrapper.find("[data-testid='mobile-work-queue']").element as HTMLElement).style.display,
    ).not.toBe("none");
    wrapper.unmount();
  });

  it("drops the phone ?task= route when the shared detail is closed", async () => {
    stubPhoneViewport(390);
    const router = await phoneRouter("/work?task=0042");
    const repo = useRepoStore();
    const ui = useUiStore();
    const active = task("0042", "active");
    repo.tasks = [active];
    ui.open(active);
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [active], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        return json({ ok: true, lines: [], stats: {} });
      }),
    );

    const wrapper = mount(TaskDrawer, {
      global: { plugins: [router], stubs: { teleport: true, Transition: true } },
    });
    await flush();
    await wrapper.get(".close-x").trigger("click");
    await flushPromises();

    expect(ui.active).toBeNull();
    expect(router.currentRoute.value.path).toBe("/work");
    expect(router.currentRoute.value.query.task).toBeUndefined();
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    wrapper.unmount();
  });

  it("mounts the same TaskDrawer on a phone and hides only the tab bar behind it", async () => {
    stubPhoneViewport(412);
    const router = await phoneRouter("/work");
    const ui = useUiStore();
    ui.open(task("0042", "review"));

    const TaskDrawerStub = defineComponent({
      setup() {
        const store = useUiStore();
        return { store };
      },
      template: "<div v-if='store.active' class='task-drawer-stub' />",
    });
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        stubs: {
          TopBar: true,
          Sidebar: true,
          MobileTabs: { template: "<div class='mobile-tabs-stub' />" },
          TaskDrawer: TaskDrawerStub,
          TunnelDrawer: true,
          RemoteValidationDrawer: true,
          ToastPanel: true,
          FloatingHeads: true,
          NewInputPanel: true,
          UiRecoveryBanner: true,
          CopyInspectorOverlay: true,
          ReleaseUpdateNotification: true,
          DependencyOverrideDialog: true,
        },
      },
    });
    await flushPromises();

    // App no longer swaps in a read-only mobile stub; the real drawer is the
    // one task detail and the phone tab bar steps out from behind it.
    expect(wrapper.find(".task-drawer-stub").exists()).toBe(true);
    expect(wrapper.find(".mobile-tabs-stub").exists()).toBe(false);
    expect(wrapper.find("[data-testid='mobile-task-detail']").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("phone task detail layout guards (#1137)", () => {
  const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
  const drawerSource = readFileSync(resolve(__dirname, "../src/components/TaskDrawer.vue"), "utf8");

  it("scrolls the tab strip instead of clipping tabs and the expand control", () => {
    expect(drawerSource).toContain("'drawer-tabs-scroll': isNarrow");
    expect(css).toMatch(/\.drawer-tabs-scroll\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.drawer-tabs-scroll \.tab-btn\s*\{[^}]*flex:\s*none/s);
  });

  it("keeps the close and back controls on-screen and at least 44x44", () => {
    expect(drawerSource).toContain('aria-label="Close task detail"');
    expect(drawerSource).toContain('aria-label="Back to Work queue"');
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-head \.close-x\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-mobile-back\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-tabs \.tab-btn\s*\{[^}]*min-height:\s*44px/s,
    );
  });

  it("keeps phone inputs at 16px so iOS does not zoom on focus", () => {
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-wrap input[^{]*\{[^}]*font-size:\s*16px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-wrap \.ai-chat-compose textarea\s*\{[^}]*font-size:\s*16px/s,
    );
  });

  it("makes the drawer full width below the 720px phone breakpoint", () => {
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.drawer-wrap\s*\{[^}]*left:\s*0;[^}]*width:\s*100vw !important/s,
    );
  });
});
