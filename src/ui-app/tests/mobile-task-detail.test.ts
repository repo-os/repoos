import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import MobileTaskDetail from "../src/components/MobileTaskDetail.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { LandableResult, Task } from "../src/types";

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
    expect(replace).toHaveBeenCalledWith({
      path: "/work",
      query: { status: "active", sort: "oldest" },
    });
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

  // #1130: a review task's primary touch action is Move to done, gated on the
  // same read-only landing pre-checks the desktop drawer uses.
  function landable(overrides: Partial<LandableResult> = {}): LandableResult {
    return {
      taskId: "0042",
      branch: "feat/mobile",
      headSha: "abc123",
      lockSha: "abc123",
      landable: true,
      checks: [
        { id: "review-verdict", label: "Review verdict", status: "pass", detail: "good to go" },
      ],
      summary: { pass: 1, warn: 0, fail: 0 },
      ...overrides,
    };
  }

  it("offers Move to done for a landable review task and returns to the queue", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    const review = { ...task, status: "review" as const };
    ui.open(review);
    vi.spyOn(repo, "loadLandable").mockResolvedValue(undefined);
    vi.spyOn(repo, "landableFor").mockReturnValue(landable());
    const complete = vi.spyOn(repo, "completeTask").mockResolvedValue({
      ok: true,
      merged: true,
      conflicts: [],
      ff: true,
    });
    const wrapper = mount(MobileTaskDetail, { global: { plugins: [pinia] } });
    await flushPromises();

    const button = wrapper.get(".mobile-detail-actions button");
    expect(button.text()).toContain("Move to done");
    expect(button.attributes("disabled")).toBeUndefined();
    await button.trigger("click");
    await flushPromises();

    expect(complete).toHaveBeenCalledWith(review);
    expect(replace).toHaveBeenCalledWith({
      path: "/work",
      query: { status: "active", sort: "oldest" },
    });
  });

  it("keeps Move to done disabled with the failing landing check", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const ui = useUiStore();
    ui.open({ ...task, status: "review" });
    vi.spyOn(repo, "loadLandable").mockResolvedValue(undefined);
    vi.spyOn(repo, "landableFor").mockReturnValue(
      landable({
        landable: false,
        checks: [
          {
            id: "review-verdict",
            label: "Review verdict",
            status: "fail",
            detail: "review says needs some work",
          },
        ],
        summary: { pass: 0, warn: 0, fail: 1 },
      }),
    );
    const complete = vi.spyOn(repo, "completeTask").mockResolvedValue({
      ok: true,
      merged: true,
      conflicts: [],
      ff: true,
    });
    const wrapper = mount(MobileTaskDetail, { global: { plugins: [pinia] } });
    await flushPromises();

    expect(wrapper.get(".mobile-detail-actions button").attributes("disabled")).toBeDefined();
    expect(wrapper.get(".mobile-detail-action-hint").text()).toContain(
      "Review verdict: review says needs some work",
    );
    await wrapper.get(".mobile-detail-actions button").trigger("click");
    expect(complete).not.toHaveBeenCalled();
  });
});
