/**
 * #0731 — the CTO board brief built from a fixture board.
 *
 * The pure builder is exercised directly (no server, no git): a fixture board
 * of tasks in several states, running agents, close-out jobs, host rows, run
 * history, config changes and AGENTS.md rules. The live collectors are a thin
 * wrapper and are covered by the acceptance smoke of the endpoint.
 */
import { describe, expect, it } from "vitest";
import {
  buildDriverBrief,
  diffConfigKeys,
  extractDriverRules,
  flattenConfig,
  recommendActions,
  taskCause,
  type DriverBriefInput,
} from "../../core/driver-brief.js";

function baseInput(overrides: Partial<DriverBriefInput> = {}): DriverBriefInput {
  return {
    root: "/tmp/repoos-driver-brief",
    generatedAt: "2026-10-07T12:00:00Z",
    sinceTag: "v1.2.0",
    automationPaused: false,
    approvalEnabled: true,
    mergedSinceTag: [],
    tasks: [],
    runningAgents: [],
    closeOutJobs: [],
    closeOutOutcomes: [],
    hosts: [],
    recentRuns: { total: 0, hung: 0, failed: 0 },
    slowRuns: [],
    configChanges: { baseline: "v1.2.0", changes: [], changedKeys: [] },
    rules: [],
    ...overrides,
  };
}

function taskInput(
  partial: Partial<DriverBriefInput["tasks"][number]> & { id: string },
): DriverBriefInput["tasks"][number] {
  return {
    title: partial.title ?? "Example task",
    status: partial.status ?? "active",
    priority: partial.priority ?? "p2",
    area: partial.area ?? "core",
    needsInput: partial.needsInput ?? false,
    needsInputReason: partial.needsInputReason,
    needsMerge: partial.needsMerge ?? false,
    assignee: partial.assignee ?? "ai",
    isArchived: partial.isArchived ?? false,
    updatedAt: partial.updatedAt ?? "2026-10-07T11:00:00Z",
    ...partial,
  };
}

describe("buildDriverBrief — board grouping", () => {
  it("groups tasks by status in lifecycle order and skips archived ones", () => {
    const brief = buildDriverBrief(
      baseInput({
        tasks: [
          taskInput({ id: "0002", status: "review", title: "Second" }),
          taskInput({ id: "0001", status: "active", title: "First" }),
          taskInput({ id: "0003", status: "active", title: "Third" }),
          taskInput({ id: "0004", status: "done", title: "Archived", isArchived: true }),
        ],
      }),
    );
    expect(brief.tasksByStatus.map((g) => g.status)).toEqual(["active", "review"]);
    expect(brief.tasksByStatus[0]!.count).toBe(2);
    expect(brief.tasksByStatus[0]!.tasks.map((t) => t.id)).toEqual(["0001", "0003"]);
    // Archived task is never counted anywhere.
    expect(brief.tasksByStatus.flatMap((g) => g.tasks).some((t) => t.id === "0004")).toBe(false);
  });

  it("carries a human cause per task", () => {
    expect(taskCause(taskInput({ id: "1", status: "active" }))).toBe("In progress");
    expect(taskCause(taskInput({ id: "2", status: "review" }))).toBe("Awaiting sign-off");
    expect(
      taskCause(
        taskInput({ id: "3", needsInput: true, needsInputReason: "check-failed-after-retries" }),
      ),
    ).toContain("check failed after retries");
    expect(taskCause(taskInput({ id: "4", needsMerge: true, status: "review" }))).toBe(
      "Branch has drifted from main",
    );
  });
});

describe("recommendActions", () => {
  it("puts stalled-run recovery first and marks it CTO-owned", () => {
    const actions = recommendActions(
      baseInput({
        runningAgents: [
          {
            taskId: "0010",
            role: "engineer",
            pid: 1,
            startedAt: "x",
            stalled: true,
            lastOutputAt: null,
          },
        ],
      }),
    );
    expect(actions[0]!.id).toBe("restart-stalled:0010");
    expect(actions[0]!.owner).toBe("cto");
  });

  it("routes a needs-input task to a human and a clean review to the CTO when policy is on", () => {
    const actions = recommendActions(
      baseInput({
        tasks: [
          taskInput({
            id: "0020",
            status: "active",
            needsInput: true,
            needsInputReason: "dev-error",
          }),
          taskInput({ id: "0021", status: "review" }),
        ],
        approvalEnabled: true,
      }),
    );
    const handoff = actions.find((a) => a.id === "handoff-failed:0020");
    const approve = actions.find((a) => a.id === "approve:0021");
    expect(handoff?.owner).toBe("human");
    expect(approve?.owner).toBe("cto");
  });

  it("asks a human to approve when auto-approval is off", () => {
    const actions = recommendActions(
      baseInput({
        tasks: [taskInput({ id: "0021", status: "review" })],
        approvalEnabled: false,
      }),
    );
    expect(actions.find((a) => a.id === "approve:0021")?.owner).toBe("human");
  });

  it("flags a failed close-out for retry and recent hung runs for a human", () => {
    const actions = recommendActions(
      baseInput({
        closeOutJobs: [
          {
            taskId: "0030",
            title: "Broken",
            phase: "failed",
            enqueuedAt: null,
            queuePosition: -1,
            reason: "check failed: tests red",
            failedAt: "2026-10-07T10:00:00Z",
          },
        ],
        recentRuns: { total: 10, hung: 1, failed: 2 },
      }),
    );
    expect(actions.find((a) => a.id === "retry-close-out:0030")?.owner).toBe("cto");
    expect(actions.find((a) => a.id === "hosts:recent-hung")?.owner).toBe("human");
  });

  it("says the board is clear when nothing is waiting", () => {
    const actions = recommendActions(baseInput());
    expect(actions).toHaveLength(1);
    expect(actions[0]!.id).toBe("clear");
  });
});

describe("buildDriverBrief — close-out split", () => {
  it("splits queued jobs from failed ones", () => {
    const brief = buildDriverBrief(
      baseInput({
        closeOutJobs: [
          {
            taskId: "0040",
            title: "Queued one",
            phase: "validating",
            enqueuedAt: "2026-10-07T09:00:00Z",
            queuePosition: 0,
            reason: null,
            failedAt: null,
          },
          {
            taskId: "0041",
            title: "Failed one",
            phase: "failed",
            enqueuedAt: "2026-10-07T08:00:00Z",
            queuePosition: -1,
            reason: "conflict",
            failedAt: "2026-10-07T08:05:00Z",
          },
        ],
      }),
    );
    expect(brief.queuedCloseOuts.map((j) => j.taskId)).toEqual(["0040"]);
    expect(brief.failedCloseOuts.map((j) => j.taskId)).toEqual(["0041"]);
  });
});

describe("buildDriverBrief — merged since tag + config changes", () => {
  it("passes through merged commits and config-change keys", () => {
    const brief = buildDriverBrief(
      baseInput({
        mergedSinceTag: [
          {
            taskId: "0050",
            sha: "abc1234",
            shortSha: "abc1234",
            subject: "feat(0050): ship",
            paths: ["src/x.ts"],
          },
        ],
        configChanges: {
          baseline: "v1.2.0",
          changes: [
            {
              sha: "def5678",
              shortSha: "def5678",
              subject: "chore(config): update repoos.toml",
              date: "2026-10-06T00:00:00Z",
            },
          ],
          changedKeys: ["approval.enabled", "cto.actions"],
        },
      }),
    );
    expect(brief.sinceTag).toBe("v1.2.0");
    expect(brief.mergedSinceTag[0]!.taskId).toBe("0050");
    expect(brief.configChanges.changedKeys).toContain("approval.enabled");
  });
});

describe("extractDriverRules", () => {
  const agents = [
    "# AGENTS.md",
    "",
    "## Who this file is for",
    "Intro text that is not a rule.",
    "- **RepoOS task-runner agents** — spawned by the server. Never move your own task out of active.",
    "  This continues on a wrapped line.",
    "",
    "## Operating loop (managed task-runner agents)",
    "1. A numbered step is not a bullet rule.",
    "- Run `repoos check` once before handoff.",
    "",
    "## Unrelated section",
    "- This bullet must not surface.",
  ].join("\n");

  it("pulls bullets from driver-relevant sections only, keeping wrapped lines", () => {
    const rules = extractDriverRules(agents);
    const texts = rules.map((r) => r.text);
    expect(texts.some((t) => t.includes("Never move your own task out of active"))).toBe(true);
    expect(texts.some((t) => t.includes("continues on a wrapped line"))).toBe(true);
    expect(texts.some((t) => t.includes("Run `repoos check` once before handoff"))).toBe(true);
    expect(texts.some((t) => t.includes("must not surface"))).toBe(false);
  });

  it("returns nothing for an empty document", () => {
    expect(extractDriverRules("")).toEqual([]);
  });
});

describe("flattenConfig + diffConfigKeys", () => {
  it("flattens nested config to dotted keys and reports changed keys", () => {
    const baseline = flattenConfig({ approval: { enabled: false }, cto: { actions: ["a"] } });
    const live = flattenConfig({ approval: { enabled: true }, cto: { actions: ["a", "b"] } });
    expect(baseline["approval.enabled"]).toBe("false");
    const changed = diffConfigKeys(baseline, live);
    expect(changed).toEqual(["approval.enabled", "cto.actions"]);
  });

  it("treats a key present on only one side as changed", () => {
    expect(diffConfigKeys({ a: "1" }, { a: "1", b: "2" })).toEqual(["b"]);
  });
});
