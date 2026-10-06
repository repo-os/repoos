import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import { reviewMission } from "../../server/review.js";

const reviewer: Agent = {
  name: "reviewer",
  cli: "cursor",
  model: "default",
  enabled: true,
};

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    agents: [reviewer],
  } as RepoOSConfig;
}

function task(body: string): Task {
  return {
    id: "0697",
    title: "t",
    type: "feature",
    status: "review",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "core",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/x",
    tags: [],
    created_at: null,
    updated_at: null,
    path: "work/0697.md",
    absPath: "/tmp/work/0697.md",
    body,
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  };
}

describe("reviewMission check outcome (#0697)", () => {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-prompt-"));

  it("states passed and keeps the no full re-run guidance", () => {
    const mission = reviewMission(task("## Problem\n\nx"), reviewer, root, "main", config(root), {
      handoffCheck: "passed",
    });
    expect(mission).toContain("Handoff check outcome: **passed**");
    expect(mission).toContain("do NOT");
    expect(mission).toContain("re-run the full build");
    expect(mission).toContain("authoritative");
    expect(mission).not.toContain("already ran `repoos check` green");
  });

  it("states skipped and asks for proof commands when named", () => {
    const mission = reviewMission(
      task("## Proof\n\n```bash\nbun run test\n```"),
      reviewer,
      root,
      "main",
      config(root),
      { handoffCheck: "skipped: no check plan" },
    );
    expect(mission).toContain("Handoff check outcome: **skipped: no check plan**");
    expect(mission).toContain("Do NOT assume `repoos check` passed");
    expect(mission).toContain("`bun run test`");
    expect(mission).not.toContain("re-run the full build or test suite unless");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});
