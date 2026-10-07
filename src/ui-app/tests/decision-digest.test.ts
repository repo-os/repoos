/**
 * #0730 — decision digest classification, cause extraction, action lists.
 */
import { describe, expect, it } from "vitest";
import {
  actionsForCloseOutFailure,
  actionsForHandoffFailure,
  buildDecisionDigest,
  extractCloseOutCause,
  extractHandoffCause,
  itemRequiresHumanDecision,
} from "../../core/decision-digest.js";
import { DEFAULT_CONFIG } from "../../core/config.js";
import type { Task } from "../../core/types.js";

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: partial.title ?? "Example task",
    status: partial.status ?? "active",
    priority: partial.priority ?? "p2",
    type: "feature",
    assignee: "ai",
    needsInput: false,
    needsMerge: false,
    isArchived: false,
    area: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...partial,
  } as Task;
}

const baseConfig = {
  ...DEFAULT_CONFIG,
  root: "/tmp/repoos-decision-digest",
  cto: { actions: ["restart-stalled-agent", "requeue-closeout-after-env-fix"] },
  approval: { enabled: true, autoApprove: { areas: ["docs"] } },
};

describe("extractHandoffCause", () => {
  it("prefers debug tl;dr and extracts failing tests from check output", () => {
    const output = ["FAIL  src/foo.test.ts > suite > breaks", "AssertionError: expected true"].join(
      "\n",
    );
    const cause = extractHandoffCause(
      task({
        id: "1",
        needsInput: true,
        needsInputReason: "check-failed-after-retries",
        needsInputDetail: output,
        debugTldr: "Vitest failed on foo.test.ts — fix and re-hand off.",
      }),
    );
    expect(cause.headline).toContain("foo.test.ts");
    expect(cause.failingTests).toContain("src/foo.test.ts > suite > breaks");
    expect(cause.step).toBe("check");
  });
});

describe("extractCloseOutCause", () => {
  it("maps validating failures to step check and failing tests", () => {
    const reason = "repoos check failed: tests red\nFAIL  auth.test.ts > login";
    const cause = extractCloseOutCause({
      taskId: "9",
      taskTitle: "t",
      failedPhase: "validating",
      reason,
    });
    expect(cause.step).toBe("check");
    expect(cause.failingTests).toContain("auth.test.ts > login");
    expect(cause.headline).toMatch(/validation|failed/i);
  });
});

describe("actionsForCloseOutFailure", () => {
  it("marks env re-queue automatic when allowlisted", () => {
    const actions = actionsForCloseOutFailure(
      {
        taskId: "1",
        taskTitle: "t",
        failedPhase: "validating",
        reason: "repoos check failed: could not resolve vitest in primary checkout",
      },
      baseConfig,
    );
    const auto = actions.find((a) => a.id === "cto-requeue-closeout");
    expect(auto?.policyAutomatic).toBe(true);
  });

  it("offers merge for conflicts without automatic merge", () => {
    const actions = actionsForCloseOutFailure(
      {
        taskId: "1",
        taskTitle: "t",
        failedPhase: "syncing",
        reason: "merge conflict in src/a.ts, src/b.ts",
      },
      baseConfig,
    );
    expect(actions.some((a) => a.id === "merge-main-into-branch")).toBe(true);
    expect(actions.every((a) => a.id !== "cto-requeue-closeout")).toBe(true);
  });
});

describe("actionsForHandoffFailure", () => {
  it("includes review again for watchdog-stuck review tasks", () => {
    const actions = actionsForHandoffFailure(
      task({
        id: "1",
        status: "review",
        needsInput: true,
        needsInputReason: "watchdog-stuck",
      }),
      baseConfig,
    );
    expect(actions.some((a) => a.id === "review-again")).toBe(true);
  });
});

describe("buildDecisionDigest", () => {
  it("omits review tasks policy would auto-approve", () => {
    const digest = buildDecisionDigest({
      config: baseConfig,
      tasks: [task({ id: "1", status: "review", area: "docs" })],
      failedCloseOutJobs: [],
      silentRuns: [],
      releaseRun: null,
      providerFailures: [],
      reviewMarkdownByTaskId: { "1": "## Verdict\n\ngood to go" },
      approvalByTaskId: { "1": { eligible: true, rule: "area:docs" } },
    });
    expect(digest.items).toEqual([]);
  });

  it("includes gate mismatch when review is clean but last_check_failure is set", () => {
    const digest = buildDecisionDigest({
      config: { ...baseConfig, approval: { enabled: false } },
      tasks: [
        task({
          id: "2",
          status: "review",
          extra: { last_check_failure: "repoos check failed: oxfmt --check" },
        }),
      ],
      failedCloseOutJobs: [],
      silentRuns: [],
      releaseRun: null,
      providerFailures: [],
      reviewMarkdownByTaskId: { "2": "## Verdict\n\ngood to go" },
      approvalByTaskId: { "2": { eligible: false, reason: "disabled" } },
    });
    expect(digest.items.some((i) => i.kind === "review-blocked")).toBe(true);
    expect(digest.items[0]?.cause.headline).toMatch(/gate/i);
  });

  it("drops stuck runs when only CTO restart is available and automation is on", () => {
    const digest = buildDecisionDigest({
      config: baseConfig,
      tasks: [],
      failedCloseOutJobs: [],
      silentRuns: [
        {
          taskId: "3",
          taskTitle: "Quiet task",
          lastOutputAt: "2026-01-02T00:00:00Z",
          detail: "silent",
        },
      ],
      releaseRun: null,
      providerFailures: [],
      reviewMarkdownByTaskId: {},
      approvalByTaskId: {},
    });
    expect(digest.items).toEqual([]);
  });
});

describe("itemRequiresHumanDecision", () => {
  it("is true when automation is paused even if actions are automatic", () => {
    const item = {
      id: "x",
      kind: "stuck-run" as const,
      taskId: "1",
      title: "t",
      cause: { headline: "h" },
      evidence: [],
      actions: [{ id: "cto-restart", label: "CTO", policyAutomatic: true }],
      at: "2026-01-01T00:00:00Z",
      link: null,
    };
    expect(itemRequiresHumanDecision(item, false)).toBe(false);
    expect(itemRequiresHumanDecision(item, true)).toBe(true);
  });
});
