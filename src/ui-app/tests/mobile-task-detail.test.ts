import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import MobileTaskDetail from "../src/components/MobileTaskDetail.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const route = { query: { task: "0042", status: "active", sort: "oldest" } };
const push = vi.fn();
const replace = vi.fn();
vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}));

const task: Task = {
  id: "0042",
  title: "Keep the queue position",
  type: "feature",
  status: "ready",
  priority: "p1",
  area: "web",
  assignee: "ai",
  assignedTo: "Nick",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-02T00:00:00.000Z",
  path: "work/0042-task.md",
  absPath: "/tmp/work/0042-task.md",
  body: "A readable description.",
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
};

describe("mobile task detail", () => {
  beforeEach(() => {
    route.query = { task: "0042", status: "active", sort: "oldest" };
    push.mockReset();
    replace.mockReset();
  });

  it("renders task details and returns in-app to the same queue query", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const ui = useUiStore();
    ui.open(task);
    const wrapper = mount(MobileTaskDetail, { global: { plugins: [pinia] } });

    expect(wrapper.find('[data-testid="mobile-task-detail"]').exists()).toBe(true);
    expect(wrapper.text()).toContain(task.title);
    expect(wrapper.text()).toContain("A readable description.");
    expect(wrapper.text()).toContain("Start work");
    await wrapper.get(".mobile-detail-back").trigger("click");
    expect(replace).toHaveBeenCalledWith({ path: "/work", query: { status: "active", sort: "oldest" } });
  });

  it("shows mutation errors and keeps the task available for retry", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    ui.open(task);
    vi.spyOn(repo, "startWork").mockRejectedValue(new Error("Work could not start"));
    const wrapper = mount(MobileTaskDetail, { global: { plugins: [pinia] } });

    await wrapper.get(".mobile-detail-actions button").trigger("click");
    await nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain("Work could not start");
    expect(wrapper.text()).toContain("Start work");
  });
});
