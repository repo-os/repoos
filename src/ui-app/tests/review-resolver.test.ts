/**
 * `resolveReviewerForTask` (0287): layers per-task reviewer overrides on top of
 * the global Agents-page reviewer, and degrades exactly to the global resolution
 * when a task sets no override.
 */
import { describe, expect, it } from "vitest";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { resolveReviewer, resolveReviewerForTask } from "../../server/agents";

const baseReviewer: Agent = { name: "reviewer", cli: "claude code", model: "sonnet", enabled: true };
const codex: Agent = { name: "codex", cli: "codex", model: "gpt-5", enabled: true };

const config = (agents: Agent[]): RepoOSConfig => ({
  root: "/tmp/example-repo",
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  agents,
});

function task(overrides: Partial<Task>): Task {
  return {
    id: "0287",
    title: "Reviewer override",
    type: "feature",
    status: "review",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/reviewer-override",
    tags: [],
    created_at: null,
    updated_at: null,
    path: "work/0287.md",
    absPath: "/tmp/example-repo/work/0287.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    pmAgentOverride: null,
    pmCliOverride: null,
    pmModelOverride: null,
    reviewAgentOverride: null,
    reviewCliOverride: null,
    reviewModelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...overrides,
  };
}

describe("resolveReviewerForTask", () => {
  it("uses the global reviewer when the task sets no override", () => {
    const cfg = config([baseReviewer]);
    expect(resolveReviewerForTask(cfg, task({}))).toEqual(resolveReviewer(cfg));
  });

  it("returns null (like the global) when no reviewer is enabled and no override is set", () => {
    const cfg = config([{ ...baseReviewer, enabled: false }]);
    expect(resolveReviewerForTask(cfg, task({}))).toBeNull();
  });

  it("overrides only the model/CLI while keeping the base reviewer agent", () => {
    const cfg = config([baseReviewer, codex]);
    const resolved = resolveReviewerForTask(
      cfg,
      task({ reviewCliOverride: "codex", reviewModelOverride: "gpt-5" }),
    )!;
    expect(resolved.name).toBe("reviewer");
    expect(resolved.cli).toBe("codex");
    expect(resolved.model).toBe("gpt-5");
  });

  it("switches the agent via reviewAgentOverride and stays null when the named agent is disabled", () => {
    const cfg = config([baseReviewer, codex]);
    const resolved = resolveReviewerForTask(cfg, task({ reviewAgentOverride: "codex" }))!;
    expect(resolved.name).toBe("codex");

    const disabled = config([baseReviewer, { ...codex, enabled: false }]);
    expect(
      resolveReviewerForTask(disabled, task({ reviewAgentOverride: "codex" })),
    ).toBeNull();
  });
});
