/**
 * #0686 — approval policy evaluation and audit helpers.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateApprovalPolicy,
  pathIsMachinery,
  taskBodyHasShotFailure,
  DEFAULT_APPROVAL_UI_AREAS,
  DEFAULT_APPROVAL_MACHINERY_PATHS,
} from "../../core/approval-policy.js";
import type { Task } from "../../core/types.js";

const CLEAN_REPORT = "## Verdict\ngood to go — nothing blocks sign-off.\n";
const BUGGY_REPORT = "## Verdict\ngood to go.\n\n## Bugs\n- Off-by-one in parser\n";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0686",
    title: "Test",
    type: "chore",
    status: "review",
    area: "api",
    areas: ["api"],
    branch: "feat/x",
    path: "work/0686.md",
    absPath: "/tmp/work/0686.md",
    body: "## Activity\n",
    assignee: "ai",
    assignedTo: "",
    createdBy: "",
    priority: "p2",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    isArchived: false,
    created_at: null,
    updated_at: null,
    tags: [],
    extra: {},
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    ...overrides,
  };
}

const enabledApi = {
  approval: { enabled: true, autoApprove: { areas: ["api", "data"] } },
};

describe("evaluateApprovalPolicy (#0686)", () => {
  it("defaults to disabled when approval.enabled is absent", () => {
    expect(
      evaluateApprovalPolicy({}, { task: task({}), reviewMarkdown: CLEAN_REPORT }).reason,
    ).toBe("disabled");
  });

  it("rejects when the kill switch is off", () => {
    expect(
      evaluateApprovalPolicy(
        { approval: { enabled: false, autoApprove: { areas: ["api"] } } },
        { task: task({ area: "api" }), reviewMarkdown: CLEAN_REPORT },
      ).eligible,
    ).toBe(false);
  });

  it("rejects human-only tagged tasks", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ tags: ["human-only"] }),
      reviewMarkdown: CLEAN_REPORT,
    });
    expect(r).toMatchObject({ eligible: false, reason: "human-only" });
  });

  it("rejects needsInput", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ needsInput: true }),
      reviewMarkdown: CLEAN_REPORT,
    });
    expect(r.reason).toBe("needs-input");
  });

  it("rejects when no area or type rule matches", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ area: "web" }),
      reviewMarkdown: CLEAN_REPORT,
      uiVisualEvidenceOk: true,
    });
    expect(r.reason).toBe("no-rule-match");
  });

  it("matches by area and names the rule", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ area: "data" }),
      reviewMarkdown: CLEAN_REPORT,
    });
    expect(r).toEqual({ eligible: true, rule: "area:data" });
  });

  it("matches by type", () => {
    const r = evaluateApprovalPolicy(
      { approval: { enabled: true, autoApprove: { types: ["chore"] } } },
      { task: task({ type: "chore", area: "unknown" }), reviewMarkdown: CLEAN_REPORT },
    );
    expect(r).toEqual({ eligible: true, rule: "type:chore" });
  });

  it("rejects a non-clean verdict", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: "## Verdict\nneeds some work\n",
    });
    expect(r.reason).toBe("verdict-not-clean");
  });

  it("rejects blocking bugs even when verdict says good to go", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: BUGGY_REPORT,
    });
    expect(r.reason).toBe("blocking-bugs");
  });

  it("rejects when last_check_failure is still on the task", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ extra: { last_check_failure: "repoos check failed" } }),
      reviewMarkdown: CLEAN_REPORT,
    });
    expect(r.reason).toBe("gate-not-green");
  });

  it("rejects merge preflight failure (not only explicit conflict files)", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: CLEAN_REPORT,
      mergePreflightFailed: true,
    });
    expect(r.reason).toBe("branch-conflict");
  });

  it("rejects when enabled with empty area and type lists", () => {
    const r = evaluateApprovalPolicy(
      { approval: { enabled: true, autoApprove: { areas: [], types: [] } } },
      { task: task({ area: "api" }), reviewMarkdown: CLEAN_REPORT },
    );
    expect(r.reason).toBe("no-rule-match");
  });

  it("rejects handoff drift", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: CLEAN_REPORT,
      handoffDrift: true,
    });
    expect(r.reason).toBe("handoff-drift");
  });

  it("blocks when the worktree lock SHA no longer equals HEAD (handoff drift)", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({ area: "api" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["docs/x.md"],
      handoffDrift: true,
    });
    expect(r).toMatchObject({ eligible: false, reason: "handoff-drift" });
  });

  it("blocks default UI areas without visual evidence", () => {
    const r = evaluateApprovalPolicy(
      { approval: { enabled: true, autoApprove: { areas: ["web"] } } },
      {
        task: task({ area: "web" }),
        reviewMarkdown: CLEAN_REPORT,
        uiVisualEvidenceOk: false,
      },
    );
    expect(r.reason).toBe("ui-without-visual-evidence");
  });

  it("allows UI areas when visual evidence is present", () => {
    const r = evaluateApprovalPolicy(
      { approval: { enabled: true, autoApprove: { areas: ["web"] } } },
      {
        task: task({ area: "web" }),
        reviewMarkdown: CLEAN_REPORT,
        uiVisualEvidenceOk: true,
      },
    );
    expect(r.eligible).toBe(true);
  });

  it("uses configured uiAreas list", () => {
    expect(DEFAULT_APPROVAL_UI_AREAS).toContain("ui-app");
  });
});

describe("approval policy machinery/p0/main conditions (#0727)", () => {
  const enabledChore = {
    approval: { enabled: true, autoApprove: { types: ["chore"] } },
  };

  it("blocks when a changed path is under a default machinery prefix", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["docs/readme.md", "src/server/server.ts"],
    });
    expect(r.reason).toBe("blocked-paths");
  });

  it("allows a changed path outside the machinery list", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["docs/readme.md", "src/ui-app/src/views/Foo.vue"],
    });
    expect(r.eligible).toBe(true);
  });

  it("fails closed when changed paths could not be read", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: null,
    });
    expect(r.reason).toBe("blocked-paths");
  });

  it("honours a configured machinery list over the default", () => {
    const r = evaluateApprovalPolicy(
      {
        approval: {
          enabled: true,
          autoApprove: { types: ["chore"], machineryPaths: ["vendor/"] },
        },
      },
      {
        task: task({ type: "chore" }),
        reviewMarkdown: CLEAN_REPORT,
        changedPaths: ["src/server/server.ts"],
      },
    );
    expect(r.eligible).toBe(true);
  });

  it("matches a bare file prefix exactly, not by partial name", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["repoos.toml.bak", "docs/x.md"],
    });
    expect(r.eligible).toBe(true);
  });

  it("blocks p0 unless explicitly allowed", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore", priority: "p0" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["docs/x.md"],
    });
    expect(r.reason).toBe("p0-needs-human");
  });

  it("allows p0 when allowP0 is set", () => {
    const r = evaluateApprovalPolicy(
      {
        approval: {
          enabled: true,
          autoApprove: { types: ["chore"], allowP0: true },
        },
      },
      {
        task: task({ type: "chore", priority: "p0" }),
        reviewMarkdown: CLEAN_REPORT,
        changedPaths: ["docs/x.md"],
      },
    );
    expect(r.eligible).toBe(true);
  });

  it("blocks a dirty main checkout", () => {
    const r = evaluateApprovalPolicy(enabledChore, {
      task: task({ type: "chore" }),
      reviewMarkdown: CLEAN_REPORT,
      changedPaths: ["docs/x.md"],
      mainDirty: true,
    });
    expect(r.reason).toBe("main-dirty");
  });

  it("blocks under the master kill switch even when enabled", () => {
    const r = evaluateApprovalPolicy(
      {
        approval: { enabled: true, autoApprove: { types: ["chore"] } },
        automation: { paused: true },
      },
      {
        task: task({ type: "chore" }),
        reviewMarkdown: CLEAN_REPORT,
        changedPaths: ["docs/x.md"],
      },
    );
    expect(r.reason).toBe("disabled");
  });
});

describe("pathIsMachinery (#0727)", () => {
  it("matches a directory prefix only beneath it", () => {
    expect(pathIsMachinery("src/server/cto.ts", DEFAULT_APPROVAL_MACHINERY_PATHS)).toBe(true);
    expect(pathIsMachinery("src/serverish/cto.ts", DEFAULT_APPROVAL_MACHINERY_PATHS)).toBe(false);
  });

  it("matches a bare file exactly, not a partial name", () => {
    expect(pathIsMachinery("repoos.toml", DEFAULT_APPROVAL_MACHINERY_PATHS)).toBe(true);
    expect(pathIsMachinery("repoos.toml.bak", DEFAULT_APPROVAL_MACHINERY_PATHS)).toBe(false);
  });

  it("ignores a leading ./", () => {
    expect(pathIsMachinery("./AGENTS.md", DEFAULT_APPROVAL_MACHINERY_PATHS)).toBe(true);
  });
});

describe("taskBodyHasShotFailure", () => {
  it("detects failed shot activity notes", () => {
    expect(taskBodyHasShotFailure("- 2026-01-01T00:00:00Z · note: shots: failed — timeout")).toBe(
      true,
    );
    expect(taskBodyHasShotFailure("- 2026-01-01T00:00:00Z · note: shots: skipped — no UI")).toBe(
      false,
    );
  });
});

describe("approval config load contract", () => {
  it("documents default UI area guard list is non-empty", () => {
    expect(DEFAULT_APPROVAL_UI_AREAS.length).toBeGreaterThan(0);
  });
});
