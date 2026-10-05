/**
 * #0686 — approval policy evaluation and audit helpers.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateApprovalPolicy,
  taskBodyHasShotFailure,
  DEFAULT_APPROVAL_UI_AREAS,
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

  it("rejects merge conflicts", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: CLEAN_REPORT,
      mergeConflicts: true,
    });
    expect(r.reason).toBe("branch-conflict");
  });

  it("rejects handoff drift", () => {
    const r = evaluateApprovalPolicy(enabledApi, {
      task: task({}),
      reviewMarkdown: CLEAN_REPORT,
      handoffDrift: true,
    });
    expect(r.reason).toBe("handoff-drift");
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
