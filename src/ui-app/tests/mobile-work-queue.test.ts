import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import WorkView from "../src/views/WorkView.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import * as apiMod from "../src/api";
import type { Task } from "../src/types";

const routeState = vi.hoisted(() => ({ query: {} as Record<string, string | string[]> }));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const api = vi.spyOn(apiMod, "api");
const buttonStub = {
  template: "<button v-bind='$attrs'><slot /></button>",
  inheritAttrs: false,
};
const selectStub = { template: "<div><slot /></div>" };

function task(
  id: string,
  status: Task["status"] = "ready",
  updated_at: string | null = null,
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

beforeEach(() => {
  setActivePinia(createPinia());
  routeState.query = {};
  api.mockReset();
});

afterEach(() => api.mockReset());

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
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    const wrapper = mount(WorkView, {
      global: {
        stubs: {
          BoardColumn: { template: "<div class='desktop-board-column' />", props: ["col"] },
          IntegrationStatusBar: true,
          RouterLink: { template: "<a><slot /></a>" },
          Button: buttonStub,
          Select: selectStub,
          SelectTrigger: selectStub,
          SelectContent: selectStub,
          SelectItem: selectStub,
          SelectViewport: selectStub,
          SelectValue: selectStub,
          PipelineView: true,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find(".desktop-board-column").exists()).toBe(true);
    expect(wrapper.find("[data-testid='mobile-work-queue']").exists()).toBe(false);
  });
});
