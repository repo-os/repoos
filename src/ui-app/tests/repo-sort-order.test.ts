import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

function makeTask(id: string, status: Task["status"] = "inbox"): Task {
  return {
    id,
    title: `Task ${id}`,
    type: "feature",
    status,
    needsInput: false,
    needsMerge: false,
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: `feature/${id}`,
    tags: [],
    created_at: null,
    updated_at: null,
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

  it("orders tasks by numeric task id newest and oldest", () => {
    const repo = useRepoStore();
    repo.tasks = [makeTask("0010"), makeTask("0002"), makeTask("0014"), makeTask("0001")];

    repo.setSortOrder("taskNumberNewest");
    expect(repo.byStatus("inbox").map((task) => task.id)).toEqual(["0014", "0010", "0002", "0001"]);

    repo.setSortOrder("taskNumberOldest");
    expect(repo.byStatus("inbox").map((task) => task.id)).toEqual(["0001", "0002", "0010", "0014"]);
  });
});
