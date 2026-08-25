/**
 * `resolveReviewerForTask` (0287): layers per-task reviewer overrides on top of
 * the global Agents-page reviewer, and degrades exactly to the global resolution
 * when a task sets no override.
 */
import { describe, expect, it } from "vitest";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { resolveReviewer, resolveReviewerForTask, resolveAgentForTask } from "../../server/agents";

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

  it(
    "#0271 follow-up: reviewModelOverride: \"default\" keeps the configured reviewer model, " +
      "never overwrites it with the literal string \"default\"",
    () => {
      // AGENT_MODELS offers "default" in the per-task model dropdown to mean
      // "use whatever's configured on the Agents page" — confirmed live bug:
      // bare truthiness treated that sentinel as a real pin and force-set
      // model to the STRING "default", which then skips --model entirely
      // (agents.ts's modelArgs) and silently falls back to the CLI's own raw
      // default instead of the configured "big pickle"/etc.
      const cfg = config([baseReviewer]);
      const resolved = resolveReviewerForTask(cfg, task({ reviewModelOverride: "default" }))!;
      expect(resolved.model).toBe(baseReviewer.model);
      expect(resolved.model).not.toBe("default");
    },
  );

  it(
    "#0271 follow-up: reviewModelOverride: \"default\" still lets reviewAgentOverride switch agents",
    () => {
      // A real override (agent name) alongside the "default" model sentinel
      // must still take effect — only the model half of hasOverride is
      // special-cased, not the whole override mechanism.
      const cfg = config([baseReviewer, codex]);
      const resolved = resolveReviewerForTask(
        cfg,
        task({ reviewAgentOverride: "codex", reviewModelOverride: "default" }),
      )!;
      expect(resolved.name).toBe("codex");
      expect(resolved.model).toBe(codex.model);
    },
  );
});

describe("resolveAgentForTask (#0271 follow-up)", () => {
  const engineer: Agent = { name: "engineer", cli: "opencode", model: "big pickle", enabled: true };

  it('modelOverride: "default" keeps the configured engineer model, never the literal string "default"', () => {
    const cfg = config([engineer]);
    const resolved = resolveAgentForTask(cfg, task({ modelOverride: "default" }), "engineer")!;
    expect(resolved.model).toBe("big pickle");
    expect(resolved.model).not.toBe("default");
  });

  it("a real modelOverride still pins the model as before", () => {
    const cfg = config([engineer]);
    const resolved = resolveAgentForTask(cfg, task({ modelOverride: "gpt-5" }), "engineer")!;
    expect(resolved.model).toBe("gpt-5");
  });
});
