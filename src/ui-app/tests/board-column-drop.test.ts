/**
 * BoardColumn drag-drop now performs the real action for ready -> active
 * (Start work, dirty-worktree dialog included) instead of leaving that edge
 * blocked, and blocks active -> review while the agent is still running
 * (mirrors the drawer's Review button). See src/ui-app/src/lib/taskTransitions.ts.
 *
 * #0507 adds: a drop into `review` is no longer a bare status write either. It
 * asks the same confirm modal the drawer's Review button uses, because moving
 * to `review` starts the handoff finalization (scoped `repoos check` → commit
 * gate → `review`) and the human should be told that a check is starting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import BoardColumn from "../src/components/BoardColumn.vue";
import ReviewConfirmDialog from "../src/components/ReviewConfirmDialog.vue";
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
    // ReviewConfirmDialog stays real: the test asserts the modal opens with the
    // right props and emits the two distinct choices.
    global: {
      plugins: [pinia],
      stubs: { TaskCard: true, RestartTaskDialog: true, Teleport: true },
      components: { ReviewConfirmDialog },
    },
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
  it("asks for confirmation instead of writing the status outright (0507)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    const setStatus = vi.spyOn(repo, "setStatus").mockResolvedValue(undefined);
    const requestReview = vi.spyOn(repo, "requestReview").mockResolvedValue(undefined);

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    // A drop must not be the one route that starts a `repoos check` without
    // saying so, and it must not be a bare status write either.
    expect(setStatus).not.toHaveBeenCalled();
    expect(requestReview).not.toHaveBeenCalled();
    const dialog = wrapper.findComponent({ name: "ReviewConfirmDialog" });
    expect(dialog.exists()).toBe(true);
    expect((dialog.props() as { open: boolean }).open).toBe(true);
  });

  it("performs the handoff request once the human chooses to run checks", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    const requestReview = vi.spyOn(repo, "requestReview").mockResolvedValue(undefined);

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();
    await wrapper.findComponent({ name: "ReviewConfirmDialog" }).vm.$emit("run-checks");
    await flush();

    expect(requestReview).toHaveBeenCalledWith(task, { skipChecks: false, origin: "board-drag" });
  });

  it("forwards the Skip checks override distinctly", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    const requestReview = vi.spyOn(repo, "requestReview").mockResolvedValue(undefined);

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();
    await wrapper.findComponent({ name: "ReviewConfirmDialog" }).vm.$emit("skip-checks");
    await flush();

    expect(requestReview).toHaveBeenCalledWith(task, { skipChecks: true, origin: "board-drag" });
  });

  it("rejects (and never asks) when the agent is still running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ status: "active" });
    repo.tasks = [task];
    repo.runningIds = ["0001"];
    const requestReview = vi.spyOn(repo, "requestReview").mockResolvedValue(undefined);
    const onError = vi.spyOn(repo, "onError");

    const wrapper = mountColumn(REVIEW_COL, pinia);
    await wrapper.find(".board-col").trigger("drop", fakeDrop("0001"));
    await flush();

    expect(requestReview).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0]![0] as Error;
    expect(err.message).toMatch(/still coding/);
  });
});
