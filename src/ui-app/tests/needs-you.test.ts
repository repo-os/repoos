import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { humanNeedsReasons, useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "inbox",
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
  }) as Task;

const reasons = (over: Partial<Task>): string[] =>
  humanNeedsReasons({
    assignee: over.assignee ?? "ai",
    status: over.status ?? "inbox",
    needsInput: over.needsInput ?? false,
    needsMerge: over.needsMerge ?? false,
  });

describe("humanNeedsReasons", () => {
  it("flags a human-assigned task (assigned_to set to any non-ai value)", () => {
    expect(reasons({ assignee: "human" })).toEqual(["assigned to you"]);
  });

  it("excludes done human-assigned tasks", () => {
    expect(reasons({ assignee: "human", status: "done" })).toEqual([]);
  });

  it("flags needs_input, needs_merge, and review regardless of assignee", () => {
    expect(reasons({ needsInput: true })).toEqual(["needs input"]);
    expect(reasons({ needsMerge: true })).toEqual(["merge needed"]);
    expect(reasons({ status: "review" })).toEqual(["awaiting sign-off"]);
  });

  it("returns no reason for an ai-assigned inbox task", () => {
    expect(reasons({})).toEqual([]);
  });

  it("lists a task once even when it matches several reasons", () => {
    expect(reasons({ assignee: "human", status: "review", needsInput: true })).toEqual([
      "assigned to you",
      "needs input",
      "awaiting sign-off",
    ]);
  });
});

describe("humanNeeds store computed", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("dedupes tasks matching several reasons", () => {
    const repo = useRepoStore();
    repo.tasks = [
      makeTask({ id: "1", assignee: "human", needsInput: true, needsMerge: true }),
      makeTask({ id: "2", status: "active", needsInput: false, needsMerge: false }),
      makeTask({ id: "3", status: "done" }),
    ];
    expect(repo.humanNeeds.map((item) => item.task.id)).toEqual(["1"]);
  });

  it("includes every reason for a deduped task", () => {
    const repo = useRepoStore();
    repo.tasks = [makeTask({ id: "1", assignee: "human", status: "review", needsInput: true })];
    expect(repo.humanNeeds[0].reasons).toEqual([
      "assigned to you",
      "needs input",
      "awaiting sign-off",
    ]);
  });

  it("excludes ai-assigned tasks with nothing to do", () => {
    const repo = useRepoStore();
    repo.tasks = [makeTask({ id: "1" }), makeTask({ id: "2", status: "active" })];
    expect(repo.humanNeeds).toEqual([]);
  });

  it("sorts by priority first, then recency", () => {
    const repo = useRepoStore();
    repo.tasks = [
      makeTask({
        id: "p1-old",
        priority: "p1",
        status: "review",
        updated_at: "2026-01-01T00:00:00Z",
      }),
      makeTask({
        id: "p2-new",
        priority: "p2",
        status: "review",
        updated_at: "2026-03-01T00:00:00Z",
      }),
      makeTask({
        id: "p0-newer",
        priority: "p0",
        status: "review",
        updated_at: "2026-04-01T00:00:00Z",
      }),
      makeTask({
        id: "p2-old",
        priority: "p2",
        status: "review",
        updated_at: "2026-02-01T00:00:00Z",
      }),
    ];
    expect(repo.humanNeeds.map((item) => item.task.id)).toEqual([
      "p0-newer",
      "p1-old",
      "p2-new",
      "p2-old",
    ]);
  });
});
