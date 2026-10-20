/**
 * #0872 — the built-in role prompts every project gets carry the lessons
 * RepoOS learned driving itself, split into a general part and project-specific
 * parts. These assertions are the contract: each general instruction lands in
 * the right role, the review mission's verdict/section format is unchanged,
 * and no RepoOS-only rule leaks into the defaults.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_AGENTS,
  getConfigSchema,
  loadConfig,
  SUPPORTED_TOML_KEYS,
} from "../../core/config.js";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import { reviewHumanFlagThreshold, reviewMission, reviewPassesSoFar } from "../../server/review.js";
import {
  needsInputClearsOnNewEngineerRun,
  needsInputClearsOnSuccessfulReview,
} from "../../core/needs-input.js";

const promptFor = (name: string): string => {
  const agent = DEFAULT_AGENTS.find((a) => a.name === name);
  expect(agent, `built-in ${name} role exists`).toBeTruthy();
  return agent!.instructions ?? "";
};

describe("built-in role prompts (#0872)", () => {
  it("gives the reviewer the class-enumeration, earlier-report, evidence and merge checks", () => {
    const reviewer = promptFor("reviewer");
    expect(reviewer).toContain("WHOLE CLASS");
    expect(reviewer).toMatch(/grep the diff and the files it touches/);
    expect(reviewer).toMatch(/newest earlier review reports/);
    expect(reviewer).toMatch(/never re-report a fixed item as new/i);
    expect(reviewer).toContain("EVIDENCE-GAP-ONLY");
    expect(reviewer).toContain("STALE-EVIDENCE-ONLY");
    expect(reviewer).toMatch(/declared shot's target and route/);
    expect(reviewer).toMatch(/merges cleanly with its base/);
    expect(reviewer).toMatch(/name the conflicting files/);
    expect(reviewer).toMatch(/repeated classes/);
  });

  it("gives the engineer the shot, fix-the-class, check and handoff rules", () => {
    const engineer = promptFor("engineer");
    expect(engineer).toContain("repoos update <id> --shots");
    expect(engineer).toContain("never a full `--body`");
    expect(engineer).toMatch(/a `route` that really serves that screen/);
    expect(engineer).toMatch(/`highlight` selector that exists/);
    expect(engineer).toMatch(/open the captured PNG/);
    expect(engineer).toMatch(/newest review report/);
    expect(engineer).toMatch(/find its whole class/);
    expect(engineer).toMatch(/table-driven test/);
    expect(engineer).toMatch(/Settings control/);
    expect(engineer).toContain("getConfigSchema()");
    expect(engineer).toMatch(/supported-keys list/);
    expect(engineer).toMatch(/scoped check once/);
    expect(engineer).toMatch(/handoff signal/);
    expect(engineer).toMatch(/base branch's copy of the task file/);
    expect(engineer).toMatch(/Never move your own task out of `active`/);
    expect(engineer).toMatch(/split into a held human task/);
  });

  it("gives the PM the task-body, board, story, dependency, bundle and human-step rules", () => {
    const pm = promptFor("pm");
    expect(pm).toMatch(/Create and change tasks only through `repoos` commands or the HTTP API/);
    for (const heading of [
      "## Problem",
      "## Desired UX",
      "## Acceptance criteria",
      "## Notes for AI",
    ]) {
      expect(pm).toContain(heading);
    }
    expect(pm).toMatch(/Search the board first/);
    expect(pm).toMatch(/area from the repo's vocabulary/);
    expect(pm).toMatch(/priority that matches the cost of waiting/);
    expect(pm).toContain("--story");
    expect(pm).toMatch(/only leave a task without a story when none fits/);
    expect(pm).toContain("--depends-on");
    expect(pm).toMatch(/never create a cycle/);
    expect(pm).toMatch(/ONE open easter-eggs bundle/);
    expect(pm).toMatch(/--assigned-to human/);
    expect(pm).toContain("--hold true");
    expect(pm).toContain("--screenshot path");
    expect(pm).toMatch(/file the class as one task/);
  });

  it("gives the CTO the quiet-monitor, stuck-vs-busy, loop and escalation rules", () => {
    const cto = promptFor("cto");
    expect(cto).toMatch(/one nudge or one escalation per event/);
    expect(cto).toMatch(/heavy pressure/);
    expect(cto).toMatch(/non-RepoOS processes/);
    expect(cto).toMatch(/phantom runner/);
    expect(cto).toMatch(/crashed or exited with an error/);
    expect(cto).toMatch(/never replace a human-set override/);
    expect(cto).toMatch(/review loop/);
    expect(cto).toMatch(/evidence-only findings/);
    expect(cto).toMatch(/blocked by uncommitted or untracked files/);
    expect(cto).toMatch(/never delete or commit them yourself/);
    expect(cto).toMatch(/Escalate to a human, with the evidence/);
    expect(cto).toMatch(/about five review passes/);
  });

  it("keeps project-specific rules out of every built-in default", () => {
    const banned = [
      /\bBun\b/,
      /\bNode(?:\.js)?\b/,
      /repoos\.toml/,
      /\bdist\//,
      /Copilot/i,
      /runtime dependenc/i,
    ];
    for (const agent of DEFAULT_AGENTS) {
      for (const pattern of banned) {
        expect(agent.instructions ?? "", `${agent.name} must not carry ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});

function config(root: string, review?: RepoOSConfig["review"]): RepoOSConfig {
  return {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    ...(review ? { review } : {}),
  } as RepoOSConfig;
}

function task(extra: Record<string, unknown> = {}): Task {
  return {
    id: "0872",
    title: "t",
    type: "chore",
    status: "review",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p1",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/x",
    tags: [],
    created_at: null,
    updated_at: null,
    path: "work/0872.md",
    absPath: "/tmp/work/0872.md",
    body: "## Problem\n\nx",
    extra,
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

const reviewer: Agent = {
  name: "reviewer",
  cli: "opencode",
  model: "default",
  enabled: true,
};

describe("shared review mission prompt (#0872)", () => {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-classes-"));

  it("names the earlier-report directory, the whole-class grep, evidence gaps and the merge check", () => {
    const mission = reviewMission(task(), reviewer, root, "main", config(root));
    expect(mission).toContain(join(root, ".repoos", "reviews", "0872"));
    expect(mission).toContain("Read the newest ones before judging this pass");
    expect(mission).toMatch(/WHOLE CLASS/);
    expect(mission).toMatch(/Never hold an\s+instance back for a later pass/);
    expect(mission).toContain("EVIDENCE-GAP-ONLY");
    expect(mission).toContain("git merge-tree --write-tree main HEAD");
    expect(mission).toMatch(/name the conflicting files/);
  });

  it("keeps the verdict and section format guarantees unchanged", () => {
    const mission = reviewMission(task(), reviewer, root, "main", config(root));
    for (const section of [
      "## Verdict",
      "## Relevance",
      "## Evidence",
      "## Bugs",
      "## Edge cases",
      "## Suggestions",
    ]) {
      expect(mission).toContain(section);
    }
    expect(mission).toContain("`good to go`");
    expect(mission).toContain("`needs some work`");
    expect(mission).toContain("`back to the drawing board`");
  });

  it("does not ask for the repeated-class summary before the pass budget is spent", () => {
    const mission = reviewMission(task({ review_passes: 4 }), reviewer, root, "main", config(root));
    expect(mission).not.toContain("Repeated review classes (required on this pass)");
  });

  it("asks for the repeated-class summary once the pass budget is spent", () => {
    const mission = reviewMission(
      task({ review_passes: 5 }),
      reviewer,
      root,
      "main",
      config(root, { humanFlagAfterPasses: 5 }),
    );
    expect(mission).toContain("Repeated review classes (required on this pass)");
    expect(mission).toContain("This is pass 6");
    expect(mission).toMatch(/BEFORE `## Verdict`/);
  });

  it("honours a configured threshold and defaults to five", () => {
    expect(reviewHumanFlagThreshold(config(root))).toBe(5);
    expect(reviewHumanFlagThreshold(config(root, { humanFlagAfterPasses: 8 }))).toBe(8);
    expect(reviewPassesSoFar(task({ review_passes: 3 }))).toBe(3);
    expect(reviewPassesSoFar(task())).toBe(0);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});

describe("review.humanFlagAfterPasses config (#0872)", () => {
  it("is a documented Settings field in the schema and supported keys", () => {
    const field = getConfigSchema().find((f) => f.key === "review.humanFlagAfterPasses");
    expect(field).toMatchObject({
      type: "number",
      tier: "live",
      restartRequired: false,
      default: 5,
    });
    expect(field?.description).toMatch(/repeated/i);
    expect(SUPPORTED_TOML_KEYS).toContain("review.humanFlagAfterPasses");
  });

  it("parses a real repoos.toml value and keeps the default when absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-review-config-"));
    try {
      writeFileSync(join(dir, "repoos.toml"), "[review]\nhumanFlagAfterPasses = 7\n");
      expect(loadConfig(dir).review?.humanFlagAfterPasses).toBe(7);

      writeFileSync(join(dir, "repoos.toml"), "");
      expect(loadConfig(dir).review?.humanFlagAfterPasses).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flags the task for a human and clears it on progress", () => {
    expect(
      needsInputClearsOnSuccessfulReview({
        status: "review",
        needsInputReason: "review-human-attention",
      }),
    ).toBe(true);
    expect(needsInputClearsOnNewEngineerRun("review-human-attention")).toBe(true);
  });
});
