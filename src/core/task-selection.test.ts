import { describe, expect, it } from "vitest";
import type { Task } from "./types.js";
import {
  conflictingPairs,
  criticalPathWeights,
  isSelectableReady,
  orderReadyTasks,
  priorityRank,
  selectReadyTasks,
  shouldRunPmVeto,
  taskConflict,
  taskIsHeld,
} from "./task-selection.js";

function task(partial: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: `Task ${partial.id}`,
    type: "feature",
    status: "ready",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "general",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "test",
    branch: `feat/${partial.id}`,
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    path: `work/${partial.id}.md`,
    absPath: `/repo/work/${partial.id}.md`,
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
    ...partial,
  };
}

describe("priorityRank", () => {
  it("orders p0 before p3", () => {
    expect(priorityRank("p0")).toBeLessThan(priorityRank("p3"));
  });
});

describe("taskIsHeld", () => {
  it("respects isHeld frontmatter", () => {
    expect(taskIsHeld(task({ id: "1", isHeld: true }))).toBe(true);
    expect(taskIsHeld(task({ id: "2", isHeld: false }))).toBe(false);
  });

  it("treats a hold tag as equivalent", () => {
    expect(taskIsHeld(task({ id: "3", tags: ["hold"] }))).toBe(true);
    expect(taskIsHeld(task({ id: "4", tags: ["HOLD"] }))).toBe(true);
  });
});

describe("isSelectableReady", () => {
  it("excludes archived, needsInput, and held ready tasks", () => {
    expect(isSelectableReady(task({ id: "1" }))).toBe(true);
    expect(isSelectableReady(task({ id: "2", isArchived: true }))).toBe(false);
    expect(isSelectableReady(task({ id: "3", needsInput: true }))).toBe(false);
    expect(isSelectableReady(task({ id: "4", isHeld: true }))).toBe(false);
    expect(isSelectableReady(task({ id: "5", status: "active" }))).toBe(false);
  });
});

describe("criticalPathWeights", () => {
  it("counts transitive dependents once", () => {
    const tasks = [
      task({ id: "1", dependsOn: [] }),
      task({ id: "2", dependsOn: ["1"] }),
      task({ id: "3", dependsOn: ["2"] }),
      task({ id: "4", dependsOn: ["1"] }),
    ];
    const weights = criticalPathWeights(tasks);
    expect(weights.get("1")).toBe(3);
    expect(weights.get("2")).toBe(1);
    expect(weights.get("3")).toBe(0);
    expect(weights.get("4")).toBe(0);
  });
});

describe("orderReadyTasks", () => {
  it("sorts by priority, then critical-path weight, then age, then id", () => {
    const tasks = [
      task({ id: "010", priority: "p2", created_at: "2026-01-03T00:00:00Z" }),
      task({ id: "011", priority: "p1", created_at: "2026-01-01T00:00:00Z" }),
      task({ id: "012", priority: "p2", created_at: "2026-01-01T00:00:00Z", dependsOn: ["099"] }),
      task({ id: "099", priority: "p2", created_at: "2026-01-02T00:00:00Z" }),
    ];
    const ordered = orderReadyTasks(tasks).map((t) => t.id);
    // p1 first; among p2, higher critical-path weight (099 unblocks 012) wins; then older created_at.
    expect(ordered).toEqual(["011", "099", "012", "010"]);
  });

  it("breaks ties on id when priority, weight, and created_at match", () => {
    const a = task({ id: "002", priority: "p2", created_at: "2026-01-01T00:00:00Z" });
    const b = task({ id: "001", priority: "p2", created_at: "2026-01-01T00:00:00Z" });
    expect(orderReadyTasks([a, b]).map((t) => t.id)).toEqual(["001", "002"]);
  });
});

describe("taskConflict", () => {
  it("detects shared non-general areas", () => {
    const webA = task({ id: "1", area: "web" });
    const webB = task({ id: "2", area: "web" });
    expect(taskConflict(webA, webB)?.reason).toContain('share area "web"');
    expect(taskConflict(webA, task({ id: "3", area: "general" }))).toBeNull();
  });

  it("detects shared declared paths", () => {
    const a = task({ id: "1", paths: ["src/foo.ts"] });
    const b = task({ id: "2", paths: ["src/foo.ts", "src/bar.ts"] });
    expect(taskConflict(a, b)?.reason).toContain('share path "src/foo.ts"');
  });
});

describe("selectReadyTasks", () => {
  it("takes the first N slots in deterministic order", () => {
    const tasks = [
      task({ id: "003", priority: "p2" }),
      task({ id: "001", priority: "p0" }),
      task({ id: "002", priority: "p1" }),
    ];
    const result = selectReadyTasks(tasks, { availableSlots: 2 });
    expect(result.selected).toEqual(["001", "002"]);
    expect(result.eligible).toEqual(["001", "002", "003"]);
  });

  it("skips held tasks and blocked ids", () => {
    const tasks = [
      task({ id: "001", priority: "p0" }),
      task({ id: "002", priority: "p1", isHeld: true }),
      task({ id: "003", priority: "p2" }),
    ];
    const result = selectReadyTasks(tasks, {
      availableSlots: 5,
      blockedIds: new Set(["003"]),
    });
    expect(result.selected).toEqual(["001"]);
    expect(result.eligible).toEqual(["001"]);
  });

  it("lists conflicts among eligible candidates", () => {
    const tasks = [
      task({ id: "001", area: "web" }),
      task({ id: "002", area: "web" }),
      task({ id: "003", area: "core" }),
    ];
    const result = selectReadyTasks(tasks, { availableSlots: 1 });
    expect(conflictingPairs(tasks.filter((t) => result.eligible.includes(t.id)))).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
  });
});

describe("shouldRunPmVeto", () => {
  it("is false without oversubscription or conflicts", () => {
    const base = { eligible: ["1", "2"], conflicts: [] };
    expect(shouldRunPmVeto(base, 2)).toBe(false);
    expect(
      shouldRunPmVeto({ eligible: ["1"], conflicts: [{ a: "1", b: "2", reason: "x" }] }, 1),
    ).toBe(false);
  });

  it("is true when more eligible than slots and a pair collides", () => {
    const result = {
      eligible: ["1", "2", "3"],
      conflicts: [{ a: "1", b: "2", reason: 'share area "web"' }],
    };
    expect(shouldRunPmVeto(result, 1)).toBe(true);
  });
});
