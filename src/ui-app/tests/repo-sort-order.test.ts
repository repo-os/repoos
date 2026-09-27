import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  BOARD_SORT_ORDER_OPTIONS,
  SORT_ORDER_OPTIONS,
  STORIES_PAGE_SORT_ORDER_OPTIONS,
  sortTasks,
  useRepoStore,
} from "../src/stores/repo";
import type { Task } from "../src/types";

function makeTask(
  id: string,
  overrides: Partial<Pick<Task, "status" | "priority" | "updated_at">> = {},
): Task {
  return {
    id,
    title: `Task ${id}`,
    type: "feature",
    status: overrides.status ?? "inbox",
    needsInput: false,
    needsMerge: false,
    priority: overrides.priority ?? "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: `feature/${id}`,
    tags: [],
    created_at: null,
    updated_at: overrides.updated_at ?? null,
    path: `work/${id}-task.md`,
    absPath: `/tmp/repo/work/${id}-task.md`,
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
  };
}

describe("repo sort order", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("orders tasks by numeric task id newest and oldest on the work board", () => {
    const repo = useRepoStore();
    repo.tasks = [makeTask("0010"), makeTask("0002"), makeTask("0014"), makeTask("0001")];

    repo.setSortOrder("taskNumberNewest");
    expect(repo.byStatus("inbox").map((task) => task.id)).toEqual(["0014", "0010", "0002", "0001"]);

    repo.setSortOrder("taskNumberOldest");
    expect(repo.byStatus("inbox").map((task) => task.id)).toEqual(["0001", "0002", "0010", "0014"]);
  });

  it("keeps priority-level board sort as backend order per column", () => {
    const repo = useRepoStore();
    repo.tasks = [
      makeTask("0003", { priority: "p0" }),
      makeTask("0001", { priority: "p2" }),
      makeTask("0002", { priority: "p1" }),
    ];

    repo.setSortOrder("current");
    expect(repo.byStatus("inbox").map((task) => task.id)).toEqual(["0003", "0001", "0002"]);
  });

  it("persists board and story panel sort choices independently", () => {
    const repo = useRepoStore();
    repo.setSortOrder("taskNumberNewest");
    repo.setStorySortOrder("taskNumberOldest");

    expect(localStorage.getItem("repoos.board.sortOrder")).toBe(JSON.stringify("taskNumberNewest"));
    expect(localStorage.getItem("repoos.storyPanel.sortOrder")).toBe(
      JSON.stringify("taskNumberOldest"),
    );

    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    expect(reloaded.sortOrder).toBe("taskNumberNewest");
    expect(reloaded.storySortOrder).toBe("taskNumberOldest");
  });

  it("persists the story panel's Status sort choice across a reload (#0560)", () => {
    const repo = useRepoStore();
    repo.setStorySortOrder("status");
    expect(localStorage.getItem("repoos.storyPanel.sortOrder")).toBe(JSON.stringify("status"));

    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    expect(reloaded.storySortOrder).toBe("status");
  });

  it("offers Status on the story panel side but keeps it off the work board (#0560)", () => {
    expect(SORT_ORDER_OPTIONS.some((o) => o.value === "status")).toBe(true);
    expect(BOARD_SORT_ORDER_OPTIONS.some((o) => o.value === "status")).toBe(false);
    expect(BOARD_SORT_ORDER_OPTIONS).toEqual(
      SORT_ORDER_OPTIONS.filter((o) => o.value !== "status"),
    );
  });

  it("defaults the stories page to most recently updated and persists separately (#0536)", () => {
    const repo = useRepoStore();
    expect(repo.storiesPageSortOrder).toBe("recent");
    repo.setStoriesPageSortOrder("taskNumberOldest");
    expect(localStorage.getItem("repoos.storiesPage.sortOrder")).toBe(
      JSON.stringify("taskNumberOldest"),
    );
    expect(localStorage.getItem("repoos.board.sortOrder")).toBeNull();

    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    expect(reloaded.storiesPageSortOrder).toBe("taskNumberOldest");
  });

  it("offers three stories-page options without priority (#0536)", () => {
    expect(STORIES_PAGE_SORT_ORDER_OPTIONS).toHaveLength(3);
    expect(STORIES_PAGE_SORT_ORDER_OPTIONS.some((o) => o.label === "Priority level")).toBe(false);
    expect(STORIES_PAGE_SORT_ORDER_OPTIONS.map((o) => o.value)).toEqual([
      "recent",
      "taskNumberNewest",
      "taskNumberOldest",
    ]);
  });
});

describe("sortTasks", () => {
  it("orders by updated_at descending with missing values last", () => {
    const tasks = [
      makeTask("0001", { updated_at: "2026-01-01T00:00:00Z" }),
      makeTask("0002", { updated_at: null }),
      makeTask("0003", { updated_at: "2026-03-01T00:00:00Z" }),
      makeTask("0004", { updated_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortTasks(tasks, "recent").map((t) => t.id)).toEqual(["0003", "0004", "0001", "0002"]);
  });

  it("groups by priority p0 through p3 with stable order within a group", () => {
    const tasks = [
      makeTask("0001", { priority: "p2" }),
      makeTask("0002", { priority: "p0" }),
      makeTask("0003", { priority: "p2" }),
      makeTask("0004", { priority: "p1" }),
    ];
    expect(sortTasks(tasks, "current").map((t) => t.id)).toEqual(["0002", "0004", "0001", "0003"]);
  });

  it("orders numeric ids and places non-numeric ids last", () => {
    const tasks = [makeTask("legacy-tag"), makeTask("0099"), makeTask("0100"), makeTask("0001")];

    expect(sortTasks(tasks, "taskNumberNewest").map((t) => t.id)).toEqual([
      "0100",
      "0099",
      "0001",
      "legacy-tag",
    ]);
    expect(sortTasks(tasks, "taskNumberOldest").map((t) => t.id)).toEqual([
      "0001",
      "0099",
      "0100",
      "legacy-tag",
    ]);
  });

  it("sorts #100 above #99 numerically", () => {
    const tasks = [makeTask("0099"), makeTask("0100")];
    expect(sortTasks(tasks, "taskNumberNewest").map((t) => t.id)).toEqual(["0100", "0099"]);
  });
});

describe("sortTasks status mode (#0560)", () => {
  it("groups tasks by pipeline stage draft, inbox, ready, active, review, done", () => {
    const tasks = [
      makeTask("0001", { status: "review" }),
      makeTask("0002", { status: "draft" }),
      makeTask("0003", { status: "done" }),
      makeTask("0004", { status: "inbox" }),
      makeTask("0005", { status: "active" }),
      makeTask("0006", { status: "ready" }),
    ];
    expect(sortTasks(tasks, "status").map((t) => t.id)).toEqual([
      "0002",
      "0004",
      "0006",
      "0005",
      "0001",
      "0003",
    ]);
  });

  it("keeps the input order stable within a status group", () => {
    const tasks = [
      makeTask("0001", { status: "active" }),
      makeTask("0002", { status: "draft" }),
      makeTask("0003", { status: "active" }),
      makeTask("0004", { status: "draft" }),
    ];
    expect(sortTasks(tasks, "status").map((t) => t.id)).toEqual(["0002", "0004", "0001", "0003"]);
  });

  it("does not mutate the array it is given", () => {
    const tasks = [makeTask("0001", { status: "review" }), makeTask("0002", { status: "draft" })];
    const before = tasks.map((t) => t.id);
    sortTasks(tasks, "status");
    expect(tasks.map((t) => t.id)).toEqual(before);
  });

  it("sorts statuses the whitelist does not know after all known stages, without throwing", () => {
    const tasks = [
      makeTask("0001", { status: "mystery" as Task["status"] }),
      makeTask("0002", { status: "done" }),
      makeTask("0003", { status: "mystery" as Task["status"] }),
    ];
    expect(sortTasks(tasks, "status").map((t) => t.id)).toEqual(["0002", "0001", "0003"]);
  });
});
