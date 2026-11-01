import { describe, expect, it } from "vitest";
import { COLUMNS, sortTasks } from "../src/stores/repo";
import type { Task } from "../src/types";

const doneTask = (id: string, body: string, updated_at: string): Task =>
  ({
    id,
    status: "done",
    body,
    updated_at,
    created_at: updated_at,
    title: id,
    type: "feature",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    path: "",
    absPath: "",
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
    automaticReview: { running: false, enabled: true },
  }) as Task;

describe("Done column sort (#0995 E3)", () => {
  it("orders by last done transition, not updated_at, when column is done", () => {
    const olderDone = doneTask(
      "0970",
      `- 2026-10-28T12:40:39Z · status ready→done`,
      "2026-10-31T20:00:00Z",
    );
    const newerDone = doneTask(
      "0988",
      [
        "- 2026-10-31T11:23:20Z · status active→review",
        "- 2026-10-31T11:30:00Z · status review→done",
        "- 2026-10-31T11:34:39Z · status done→done, release:success",
      ].join("\n"),
      "2026-10-31T10:00:00Z",
    );
    const sorted = sortTasks([olderDone, newerDone], "recent", "done");
    expect(sorted.map((t) => t.id)).toEqual(["0988", "0970"]);
  });

  it("falls back to updated_at when no done line exists", () => {
    const a = doneTask("1", "", "2026-10-01T00:00:00Z");
    const b = doneTask("2", "", "2026-10-02T00:00:00Z");
    expect(sortTasks([a, b], "recent", "done").map((t) => t.id)).toEqual(["2", "1"]);
  });

  it("keeps updated_at sort for non-done columns", () => {
    const a = { ...doneTask("1", "", "2026-10-01T00:00:00Z"), status: "review" as const };
    const b = { ...doneTask("2", "", "2026-10-02T00:00:00Z"), status: "review" as const };
    expect(sortTasks([a, b], "recent", "review").map((t) => t.id)).toEqual(["2", "1"]);
  });
});

describe("work board skeleton columns (#0995 E2)", () => {
  it("matches draft plus pipeline columns", () => {
    expect(1 + COLUMNS.length).toBe(6);
  });
});
