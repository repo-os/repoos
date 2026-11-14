import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MobileTaskDetail from "../src/components/MobileTaskDetail.vue";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const nav = vi.hoisted(() => ({
  route: { path: "/work", query: {} as Record<string, string | string[]> },
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("vue-router", () => ({ useRoute: () => nav.route, useRouter: () => nav }));

const buttonStub = { template: "<button v-bind='$attrs'><slot /></button>", inheritAttrs: false };
const selectStub = { template: "<div><slot /></div>" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0042",
    title: "A task title that wraps on a phone",
    type: "feature",
    status: "active",
    priority: "p1",
    area: "web,core",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "tester",
    branch: "feat/mobile",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: "2026-11-14T00:00:00.000Z",
    path: "work/0042-task.md",
    absPath: "/work/0042-task.md",
    body: "A readable task description.",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    ...overrides,
  } as Task;
}

function mountDetail() {
  return mount(MobileTaskDetail, { global: { stubs: { Button: buttonStub } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  nav.route.path = "/work";
  nav.route.query = { task: "0042", status: "active" };
  nav.push.mockReset();
  nav.replace.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("mobile task details", () => {
  it("renders task content and returns to the same Work query without dropping queue state", async () => {
    const ui = useUiStore();
    ui.open(task());
    const wrapper = mountDetail();
    expect(wrapper.text()).toContain("A task title that wraps on a phone");
    expect(wrapper.text()).toContain("web,core");
    expect(wrapper.text()).toContain("Description");
    expect(wrapper.text()).toContain("A readable task description.");
    await wrapper.get(".mobile-detail-back").trigger("click");
    expect(nav.replace).toHaveBeenCalledWith({ path: "/work", query: { status: "active" } });
  });

  it("opens a task by pushing a detail query onto the queue route", async () => {
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [task()];
    const wrapper = mount(MobileWorkQueue, {
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
    await wrapper.get('[data-task-id="0042"] .mobile-task-card').trigger("click");
    expect(nav.push).toHaveBeenCalledWith({
      path: "/work",
      query: { task: "0042", status: "active" },
    });
  });

  it("shows shared mutation failures in the page and keeps the error actionable", async () => {
    const ui = useUiStore();
    ui.open(task());
    const repo = useRepoStore();
    vi.spyOn(repo, "pauseWork").mockRejectedValue(new Error("Server refused the pause"));
    const wrapper = mountDetail();
    await wrapper.get(".mobile-detail-actions button").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Server refused the pause");
    expect(wrapper.text()).toContain("Pause work");
  });

  it("shows a loading or unavailable state when the route task is not yet active", () => {
    const wrapper = mountDetail();
    expect(wrapper.text()).toContain("Task unavailable");
  });
});
