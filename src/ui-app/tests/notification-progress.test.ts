import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Task } from "../../core/types";
import { progressFailureNotification } from "../../server/notifications/progress.js";

function task(root: string, status: Task["status"]): Task {
  return {
    id: "0042",
    title: "Fix",
    type: "feature",
    status,
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    created_at: null,
    updated_at: null,
    releasedAt: null,
    path: "work/0042.md",
    absPath: join(root, "work/0042.md"),
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
  };
}

describe("progressFailureNotification", () => {
  const root = mkdtempSync(join(tmpdir(), "repoos-notif-progress-"));

  it("maps handoff:failed to server_failed", () => {
    const n = progressFailureNotification(task(root, "active"), "handoff:failed", "check failed");
    expect(n?.kind).toBe("task.server_failed");
    expect(n?.spec.headline).toBe("🛑 Server failed");
    expect(n?.summary).toBe("check failed");
  });

  it("maps bare failed on an active task to server_failed", () => {
    const n = progressFailureNotification(task(root, "active"), "failed", "check failed");
    expect(n?.kind).toBe("task.server_failed");
  });

  it("maps bare failed on a review task to integration_failed", () => {
    const n = progressFailureNotification(task(root, "review"), "failed", "merge conflict");
    expect(n?.kind).toBe("task.integration_failed");
    expect(n?.spec.headline).toBe("⚠️ Merge failed");
  });
});
