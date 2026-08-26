/**
 * BoardColumn drag-drop now performs the real action for ready -> active
 * (Start work, dirty-worktree dialog included) instead of leaving that edge
 * blocked, and blocks active -> review while the agent is still running
 * (mirrors the drawer's Review button). See src/ui-app/src/lib/taskTransitions.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import BoardColumn from "../src/components/BoardColumn.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
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
  ...over,
});

const COL = { id: "active" as const, label: "Active", color: "#000" };
const REVIEW_COL = { id: "review" as const, label: "Review", color: "#000" };

function fakeDrop(id: string) {
  return { dataTransfer: { getData: () => id } as unknown as DataTransfer };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await nextTick();
}

function mountColumn(col: typeof COL | typeof REVIEW_COL, pinia: Pinia) {
  return mount(BoardColumn, {
    props: { col },
    global: { plugins: [pinia], stubs: { TaskCard: true, RestartTaskDialog: true } },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BoardColumn drop: ready -> active", () => {
  it("calls Start work for a clean worktree instead of a bare status write", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "ready" });
    repo.tasks = [task];
    const startWork = vi.spyOn(repo, "startWork").mockResolvedValue(undefined);
    const setStatus = vi.spyOn(repo, "setStatus").mockResolvedValue(undefined);

    const wrapper = mountColumn(COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    expect(startWork).toHaveBeenCalledWith(task);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("redirects to the restart dialog instead of starting directly when the worktree is dirty", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "ready", git: { ...makeTask().git, dirty: true } });
    repo.tasks = [task];
    const startWork = vi.spyOn(repo, "startWork").mockResolvedValue(undefined);

    const wrapper = mountColumn(COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    expect(startWork).not.toHaveBeenCalled();
    const dialog = wrapper.findComponent({ name: "RestartTaskDialog" });
    expect((dialog.props() as { task: Task | null }).task).toEqual(task);
  });
});

describe("BoardColumn drop: active -> review", () => {
  it("still moves a paused (not running) active task via a bare status write", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    const setStatus = vi.spyOn(repo, "setStatus").mockResolvedValue(undefined);

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    expect(setStatus).toHaveBeenCalledWith(task, "review");
  });

  it("rejects (and never calls setStatus) when the agent is still running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    repo.runningIds = ["0001"];
    const setStatus = vi.spyOn(repo, "setStatus").mockResolvedValue(undefined);
    const onError = vi.spyOn(repo, "onError");

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    expect(setStatus).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0]![0] as Error;
    expect(err.message).toMatch(/still coding/);
  });
});
