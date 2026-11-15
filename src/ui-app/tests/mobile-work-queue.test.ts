import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import WorkView from "../src/views/WorkView.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import * as apiMod from "../src/api";
import type { Task } from "../src/types";

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string | string[]>,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => routeState.router,
}));

const api = vi.spyOn(apiMod, "api");
const buttonStub = {
  template: "<button v-bind='$attrs'><slot /></button>",
  inheritAttrs: false,
};
const selectStub = { template: "<div><slot /></div>" };

/** Stub the heavy desktop board pieces but keep both layout roots queryable. */
function workViewStubs() {
  return {
    BoardColumn: { template: "<div class='desktop-board-column' />", props: ["col"] },
    IntegrationStatusBar: { template: "<div class='integration-status-bar' />" },
    MobileTaskDetail: { template: "<div class='mobile-task-detail-stub' />" },
    RouterLink: { template: "<a><slot /></a>" },
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

function stubViewport(width: number, narrow: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal("innerWidth", width);
}

function task(
  id: string,
  status: Task["status"] = "ready",
  updated_at: string | null = null,
  extra: Partial<Task> = {},
): Task {
  return {
    id,
    title: `A wrapping task title for ${id}`,
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
    updated_at,
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
    ...extra,
  } as Task;
}

function mountQueue() {
  return mount(MobileWorkQueue, {
    global: {
      stubs: {
        Button: buttonStub,
        Select: selectStub,
        SelectTrigger: selectStub,
        SelectContent: selectStub,
        SelectItem: selectStub,
        SelectViewport: selectStub,
        SelectValue: selectStub,
      },
    },
  });
}

function cardIds(wrapper: ReturnType<typeof mountQueue>): string[] {
  return wrapper.findAll(".mobile-task-card").map((card) => {
    const id = card.element.closest("li")?.getAttribute("data-task-id");
    return id ?? "";
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  routeState.query = {};
  routeState.router.replace.mockReset();
  routeState.router.push.mockReset();
  api.mockReset();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
});

describe("mobile Work queue", () => {
  it("shows task number, wrapping title, type, priority, status and updated time", () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0042", "active", new Date(Date.now() - 60_000).toISOString())];
    const wrapper = mountQueue();
    expect(wrapper.text()).toContain("#0042");
    expect(wrapper.text()).toContain("A wrapping task title for 0042");
    expect(wrapper.text()).toContain("feature");
    expect(wrapper.text()).toContain("p1");
    expect(wrapper.text()).toContain("active");
    expect(wrapper.text()).toContain("ago");
  });

  it("renders loading, empty and filtered-empty states", async () => {
    const repo = useRepoStore();
    repo.loading = true;
    let wrapper = mountQueue();
    expect(wrapper.text()).toContain("Loading tasks");
    wrapper.unmount();
    repo.loading = false;
    repo.tasks = [];
    wrapper = mountQueue();
    expect(wrapper.text()).toContain("No tasks yet");
    wrapper.unmount();
    repo.tasks = [task("0001", "ready")];
    wrapper = mountQueue();
    await wrapper.get("[aria-label='Filter tasks by status']").trigger("click");
    // The compact select is a shared Radix control; empty-state behavior is
    // covered by setting its model through the component's public state below.
    (wrapper.vm as unknown as { status: string }).status = "done";
    await flushPromises();
    expect(wrapper.text()).toContain("No done tasks");
  });

  // #1138 C1: the default view is the grouped "needs attention" view. Review,
  // active, ready and inbox work comes before anything done, and done is not
  // rendered at all until its own filter is chosen.
  it("opens on a grouped needs-attention view and hides done tasks", () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [
      task("0001", "done"),
      task("0002", "active"),
      task("0003", "review"),
      task("0004", "ready"),
      task("0005", "inbox"),
      task("0006", "ready", null, { assignee: "human" }),
      task("0007", "active", null, { needsInput: true }),
      task("0008", "ready", null, { isHeld: true }),
    ];
    const wrapper = mountQueue();

    const order = wrapper.findAll(".mobile-queue-section").map((s) => s.attributes("data-section"));
    expect(order).toEqual(["needs", "review", "active", "ready", "inbox"]);
    expect(wrapper.find("[data-section='done']").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("#0001");
    expect(cardIds(wrapper)).not.toContain("0001");

    // Needs you holds the human, needs-input and held tasks — even though their
    // statuses are ready/active.
    expect(cardIds(wrapper).slice(0, 3).sort()).toEqual(["0006", "0007", "0008"]);
    expect(wrapper.get("[data-section='needs'] .mobile-section-count").text()).toBe("3");
    expect(wrapper.get("[data-section='review'] .mobile-section-count").text()).toBe("1");
    expect(wrapper.get("[data-testid='mobile-queue-count']").text()).toBe("7 tasks");
  });

  it("narrows the queue by id, title and area and keeps the count honest", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [
      task("0100", "ready", null, { title: "Alpha mobile queue", area: "web" }),
      task("0101", "ready", null, { title: "Beta server job", area: "server" }),
      task("0102", "ready", null, { title: "Gamma release", area: "core" }),
    ];
    const wrapper = mountQueue();
    expect(wrapper.get("[data-testid='mobile-queue-count']").text()).toBe("3 tasks");

    const input = wrapper.get("[data-testid='mobile-queue-search']");
    await input.setValue("server");
    expect(cardIds(wrapper)).toEqual(["0101"]);
    expect(wrapper.get("[data-testid='mobile-queue-count']").text()).toBe("1 task");
    expect(wrapper.get("[data-testid='mobile-queue-count']").text()).toBe(
      `${wrapper.findAll(".mobile-task-card").length} task`,
    );

    await input.setValue("#0102");
    expect(cardIds(wrapper)).toEqual(["0102"]);

    await input.setValue("core");
    expect(cardIds(wrapper)).toEqual(["0102"]);

    await input.setValue("");
    expect(cardIds(wrapper)).toEqual(["0100", "0101", "0102"]);
  });

  it("filters by priority, area, story and human assignment", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [
      task("0200", "ready", null, { priority: "p0", area: "web", story: "Mobile" }),
      task("0201", "ready", null, { priority: "p1", area: "web", story: "Mobile" }),
      task("0202", "ready", null, { priority: "p0", area: "server", story: "Server" }),
      task("0203", "ready", null, { priority: "p0", area: "web", assignee: "human" }),
    ];
    const wrapper = mountQueue();
    const vm = wrapper.vm as unknown as {
      priority: string;
      area: string;
      story: string;
      mine: boolean;
    };

    vm.priority = "p0";
    await flushPromises();
    // The human-assigned task sits in Needs you, ahead of the status sections.
    expect(cardIds(wrapper)).toEqual(["0203", "0200", "0202"]);

    vm.priority = "";
    vm.area = "web";
    await flushPromises();
    expect(cardIds(wrapper)).toEqual(["0203", "0200", "0201"]);

    vm.area = "any";
    vm.story = "Server";
    await flushPromises();
    expect(cardIds(wrapper)).toEqual(["0202"]);

    vm.story = "any";
    vm.mine = true;
    await flushPromises();
    expect(cardIds(wrapper)).toEqual(["0203"]);
  });

  // #1138 C2: held and human tasks (the old queue filtered them out forever)
  // are in the default view and have their own one-tap parked views.
  it("reaches held and human tasks from the default view in two taps or fewer", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [
      task("0300", "ready", null, {
        assignee: "human",
        isHeld: true,
        title: "Held human task",
      }),
    ];
    const wrapper = mountQueue();

    // One tap: it already sits in Needs you.
    expect(cardIds(wrapper)).toEqual(["0300"]);
    expect(wrapper.get("[data-section='needs']").text()).toContain("Held human task");

    const heldChip = wrapper.get("[data-testid='mobile-filter-held']");
    await heldChip.trigger("click");
    expect(wrapper.get("[data-section='held']").text()).toContain("Held human task");
    await wrapper.get("[data-testid='mobile-filter-human']").trigger("click");
    expect(wrapper.get("[data-section='human']").text()).toContain("Held human task");
  });

  it("honors ?status= and writes filter changes back to the URL", async () => {
    routeState.query = { status: "review" };
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0400", "review"), task("0401", "ready")];
    const wrapper = mountQueue();

    expect(wrapper.find("[data-section='review']").exists()).toBe(true);
    expect(wrapper.find("[data-section='ready']").exists()).toBe(false);

    (wrapper.vm as unknown as { status: string }).status = "ready";
    await flushPromises();
    expect(routeState.router.replace).toHaveBeenCalled();
    const lastQuery = routeState.router.replace.mock.calls.at(-1)?.[0]?.query;
    expect(lastQuery).toMatchObject({ status: "ready" });

    (wrapper.vm as unknown as { status: string }).status = "attention";
    await flushPromises();
    const backToDefault = routeState.router.replace.mock.calls.at(-1)?.[0]?.query;
    expect(backToDefault).not.toHaveProperty("status");
  });

  it("writes the search query to the URL and keeps unrelated params", async () => {
    routeState.query = { status: "review", task: "0400" };
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0400", "review")];
    const wrapper = mountQueue();

    await wrapper.get("[data-testid='mobile-queue-search']").setValue("mobile");
    const lastQuery = routeState.router.replace.mock.calls.at(-1)?.[0]?.query;
    expect(lastQuery).toMatchObject({ status: "review", task: "0400", q: "mobile" });
  });

  // #1138: about 1,000 tasks must not mean 1,000 cards or a 154,000px page.
  it("renders at most 100 cards for a 1,000-task board until expanded", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = Array.from({ length: 1_000 }, (_, i) => task(String(i).padStart(4, "0"), "ready"));
    const wrapper = mountQueue();

    const rendered = wrapper.findAll(".mobile-task-card").length;
    expect(rendered).toBeLessThanOrEqual(100);
    expect(wrapper.get("[data-section='ready'] .mobile-section-count").text()).toBe("1000");
    expect(wrapper.get("[data-testid='mobile-queue-count']").text()).toBe(
      `${rendered} of 1000 tasks`,
    );

    await wrapper.get(".mobile-section-more").trigger("click");
    expect(wrapper.findAll(".mobile-task-card").length).toBe(rendered + 12);
  });

  it("opens the shared new-task flow", async () => {
    const ui = useUiStore();
    const open = vi.spyOn(ui, "openNewTask");
    const wrapper = mountQueue();
    open.mockClear();
    await wrapper.get("[data-testid='mobile-new-task']").trigger("click");
    expect(open).toHaveBeenCalledOnce();
  });

  it("shows a refresh error and retries through the shared repo store", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0001")];
    api.mockRejectedValueOnce(new Error("Network unavailable"));
    const wrapper = mountQueue();
    await (wrapper.vm as unknown as { retryLoad(): Promise<void> }).retryLoad();
    await flushPromises();
    expect(wrapper.text()).toContain("Network unavailable");
    api.mockResolvedValueOnce({ tasks: [], counts: {} });
    await wrapper.get(".mobile-queue-error button").trigger("click");
    await flushPromises();
    expect(api).toHaveBeenCalledWith("/api/board");
  });

  it("keeps the desktop board composition when the responsive layout is wide", async () => {
    stubViewport(1280, false);
    const wrapper = mount(WorkView, { global: { stubs: workViewStubs() } });
    await flushPromises();
    expect(wrapper.find(".desktop-board-column").exists()).toBe(true);
    expect(wrapper.find("[data-testid='mobile-work-queue']").exists()).toBe(false);
    expect(wrapper.find(".integration-status-bar").exists()).toBe(true);
  });

  // #1130: the mobile queue and the desktop board used to be painted on top of
  // each other because `v-else` was chained to MobileTaskDetail rather than to
  // the narrow layout. These widths are the phone sizes from the report.
  it.each([360, 390, 412])("renders exactly one queue at %spx", async (width) => {
    stubViewport(width, true);
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0042", "review")];
    const wrapper = mount(WorkView, { global: { stubs: workViewStubs() } });
    await flushPromises();

    expect(wrapper.find("[data-testid='mobile-work-queue']").exists()).toBe(true);
    expect(wrapper.find(".work-page").exists()).toBe(false);
    expect(wrapper.find(".desktop-board-column").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Client board");
    // The integration bar belongs to Work, not to the desktop board: it stays
    // mounted (and floats clear of the tab bar) on a phone.
    expect(wrapper.find(".integration-status-bar").exists()).toBe(true);
  });

  it("shows only the task detail above the queue on a narrow task route", async () => {
    stubViewport(390, true);
    routeState.query = { task: "0042" };
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task("0042", "review")];
    api.mockResolvedValue(task("0042", "review"));
    const wrapper = mount(WorkView, { global: { stubs: workViewStubs() } });
    await flushPromises();

    expect(wrapper.find(".mobile-task-detail-stub").exists()).toBe(true);
    expect(wrapper.find("[data-testid='mobile-work-queue']").isVisible()).toBe(false);
    expect(wrapper.find(".work-page").exists()).toBe(false);
    expect(wrapper.find(".desktop-board-column").exists()).toBe(false);
  });
});
