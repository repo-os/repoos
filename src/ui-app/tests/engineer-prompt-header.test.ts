/**
 * The first lines of every managed engineer prompt must state the absolute
 * working directory and — for an ordinary worktree task — mark the main
 * checkout off-limits, so an agent does not quietly read or edit the wrong
 * tree (#0654). A hotfix runs in the main checkout itself and must not get
 * that warning nor be described as a git worktree.
 */
import { describe, expect, it } from "vitest";
import { missionFor, workingDirectoryHeader } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const ROOT = "/Users/nick/code/nick/repoos";
const WORKDIR = "/Users/nick/code/nick/repoos-worktrees/feat/0654-task";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0654",
    title: "Test task",
    type: "improvement",
    status: "active",
    priority: "p2",
    area: "core",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/0654-task",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/0654-test.md",
    absPath: "/tmp/work/0654-test.md",
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
    ...overrides,
  };
}

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

describe("workingDirectoryHeader", () => {
  it("states the worktree path and marks the main checkout off-limits for a normal task", () => {
    const header = workingDirectoryHeader(task(), "feat/0654-task", WORKDIR, config(ROOT));
    const lines = header.split("\n");

    expect(lines[0]).toContain(`Working directory: ${WORKDIR}`);
    expect(lines[0]).toContain("a git worktree");
    expect(lines[0]).toContain("feat/0654-task");
    expect(header).toContain(`Use absolute paths under ${WORKDIR}`);
    expect(header).toContain(`The main checkout at ${ROOT} is off-limits`);
  });

  it("describes a branch-target hotfix as the main checkout without the off-limits line", () => {
    const hotfix = task({ hotfix: true, hotfixTarget: "branch" });
    const header = workingDirectoryHeader(hotfix, "hotfix/0654-task", ROOT, config(ROOT));

    expect(header).toContain(`Working directory: ${ROOT}`);
    expect(header).toContain("the main checkout");
    expect(header).toContain("hotfix/0654-task");
    expect(header).not.toContain("git worktree");
    expect(header).not.toContain("off-limits");
  });

  it("states branch main for a main-target hotfix and never claims a worktree", () => {
    const hotfix = task({ hotfix: true, hotfixTarget: "main" });
    const header = workingDirectoryHeader(hotfix, "hotfix/0654-task", ROOT, config(ROOT));

    expect(header).toContain(`Working directory: ${ROOT}`);
    expect(header).toContain("the main checkout");
    expect(header).toContain("on branch main");
    expect(header).not.toContain("git worktree");
    expect(header).not.toContain("off-limits");
  });
});

describe("missionFor header ordering", () => {
  it("puts the header before the context pack, instructions, and skills", () => {
    const mission = missionFor(
      task(),
      "feat/0654-task",
      WORKDIR,
      agent,
      config(ROOT),
      "CONTEXT PACK",
      undefined,
      [],
    );
    const header = workingDirectoryHeader(task(), "feat/0654-task", WORKDIR, config(ROOT));

    expect(mission.startsWith(header)).toBe(true);
    expect(mission.indexOf(WORKDIR)).toBeLessThan(mission.indexOf("CONTEXT PACK"));
    expect(mission.indexOf(`off-limits`)).toBeLessThan(mission.indexOf("CONTEXT PACK"));
  });

  it("keeps the header first on a resume turn, ahead of the resume preamble", () => {
    const mission = missionFor(
      task(),
      "feat/0654-task",
      WORKDIR,
      agent,
      config(ROOT),
      "CONTEXT PACK",
      "RESUME PREAMBLE",
    );
    const header = workingDirectoryHeader(task(), "feat/0654-task", WORKDIR, config(ROOT));

    expect(mission.startsWith(header)).toBe(true);
    expect(mission.indexOf(WORKDIR)).toBeLessThan(mission.indexOf("RESUME PREAMBLE"));
    expect(mission.indexOf("off-limits")).toBeLessThan(mission.indexOf("RESUME PREAMBLE"));
  });

  it("uses the hotfix wording in the mission when the task is a main-checkout hotfix", () => {
    const hotfix = task({ hotfix: true, hotfixTarget: "branch" });
    const mission = missionFor(hotfix, "hotfix/0654-task", ROOT, agent, config(ROOT));
    const header = workingDirectoryHeader(hotfix, "hotfix/0654-task", ROOT, config(ROOT));

    expect(mission.startsWith(header)).toBe(true);
    expect(mission).not.toContain("a git worktree checked out");
  });
});
