/**
 * #0688 — CTO safe actions: allowlist, rate limits, audit feed.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ctoActionRateLimitExceeded,
  configuredCtoActions,
  countCtoRestartsThisEpisode,
  decideRestartStrategy,
  isCtoActionAllowlisted,
} from "../../core/cto-actions.js";
import { createCtoActionRateStore } from "../../server/cto-action-rates.js";
import { createAttentionEventStore } from "../../server/attention-events.js";
import { runCtoSafeAction, runCtoMonitorSafeActions } from "../../server/cto-actions.js";
import { buildAttentionFeed } from "../../core/attention.js";
import { DEFAULT_CONFIG, loadConfig } from "../../core/config.js";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { writeFileSync } from "node:fs";

// #0960: isolate the CTO restart loop's hold guard. The mocked relaunch always
// "fails" so the test never touches the filesystem; what we assert is WHICH
// tasks the loop reaches it for.
vi.mock("../../server/engineer-launch.js", () => ({
  relaunchEngineerOnActiveTask: vi.fn(async () => ({ ok: false, reason: "test blocked" })),
}));

import { relaunchEngineerOnActiveTask } from "../../server/engineer-launch.js";

describe("cto.actions config (#0688)", () => {
  it("parses allowlist from repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-cto-actions-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      'cto.actions = ["restart-stalled-agent", "refresh-main-install"]\n',
      "utf8",
    );
    const cfg = loadConfig(dir);
    expect(configuredCtoActions(cfg)).toEqual(["restart-stalled-agent", "refresh-main-install"]);
  });

  it("exposes Settings schema and supported TOML key", () => {
    expect(getConfigSchema().find((f) => f.key === "cto.actions")).toBeDefined();
    expect(SUPPORTED_TOML_KEYS).toContain("cto.actions");
  });
});

describe("CTO safe action gate", () => {
  it("rejects actions not on the allowlist", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-gate-"));
    const config = { ...DEFAULT_CONFIG, root, cto: { actions: [] } };
    const attentionEvents = createAttentionEventStore(root);
    const rates = createCtoActionRateStore(root);
    const result = await runCtoSafeAction(
      {
        config,
        index: {
          getTask: () => null,
          getTasks: () => [],
          applyFileChange: () => {},
          refreshBranchesAsync: async () => {},
        } as never,
        runner: {} as never,
        jobCoordinator: { allJobs: () => [], getJob: () => null, enqueue: () => null } as never,
        attentionEvents,
        rates,
        logger: { agent: vi.fn(), task: vi.fn() } as never,
        emitEvent: vi.fn(),
        triggerJobProcessing: vi.fn(),
        reportedStages: {},
        reportedStageAt: {},
      },
      "refresh-main-install",
      { actor: "human" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not allowlisted");
    }
  });

  it("surfaces ctoAction rows in the attention feed", () => {
    const config = { ...DEFAULT_CONFIG, root: "/tmp" };
    const feed = buildAttentionFeed({
      config,
      tasks: [],
      closeOutOutcomes: [],
      releaseRun: null,
      releaseNotesRun: null,
      recordedEvents: [
        {
          id: "ctoAction:test",
          kind: "ctoAction",
          taskId: "0001",
          message: "CTO: Refresh install in main",
          detail: "Refreshed the primary checkout install.",
          at: "2026-10-06T00:00:00Z",
        },
      ],
      totalSpendUsd: null,
      recentProviderFailures: [],
      silentRuns: [],
      previewTargetAreas: [],
    });
    expect(feed.items.some((i) => i.kind === "ctoAction")).toBe(true);
  });
});

describe("CTO action rate limits", () => {
  it("enforces per-action hourly caps", () => {
    expect(ctoActionRateLimitExceeded("refresh-main-install", 3)).toBe(false);
    expect(ctoActionRateLimitExceeded("refresh-main-install", 4)).toBe(true);
  });

  it("persists timestamps in the rate store", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-rates-"));
    const store = createCtoActionRateStore(root);
    expect(store.countRecent("refresh-main-install", null)).toBe(0);
    store.record("refresh-main-install", null);
    expect(store.countRecent("refresh-main-install", null)).toBe(1);
  });

  it("allowlist helper respects config", () => {
    const cfg = { ...DEFAULT_CONFIG, root: "/tmp", cto: { actions: ["restart-stalled-agent"] } };
    expect(isCtoActionAllowlisted(cfg, "restart-stalled-agent")).toBe(true);
    expect(isCtoActionAllowlisted(cfg, "refresh-main-install")).toBe(false);
  });
});

describe("kill-hung-validation safe action (#0729)", () => {
  function depsWithValidator(
    root: string,
    kill: (taskId: string) => Promise<{ ok: boolean; detail: string }>,
    actions: string[],
  ) {
    return {
      config: { ...DEFAULT_CONFIG, root, cto: { actions } },
      index: {
        getTask: (id: string) => ({ id, status: "active", body: "", absPath: `${root}/w.md` }),
        getTasks: () => [],
        applyFileChange: () => {},
        refreshBranchesAsync: async () => {},
      } as never,
      runner: {} as never,
      jobCoordinator: { allJobs: () => [], getJob: () => null, enqueue: () => null } as never,
      attentionEvents: createAttentionEventStore(root),
      rates: createCtoActionRateStore(root),
      logger: { agent: vi.fn(), task: vi.fn(), system: vi.fn() } as never,
      emitEvent: vi.fn(),
      triggerJobProcessing: vi.fn(),
      reportedStages: {},
      reportedStageAt: {},
      remoteValidator: { killHungValidation: kill } as never,
    };
  }

  it("kills the run's container and audits the action", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-kill-"));
    const kill = vi.fn(async () => ({ ok: true, detail: "Removed container repoos-validate-x" }));
    const deps = depsWithValidator(root, kill, ["kill-hung-validation"]);
    const result = await runCtoSafeAction(deps as never, "kill-hung-validation", {
      taskId: "0729",
      actor: "cto",
    });
    expect(result.ok).toBe(true);
    expect(kill).toHaveBeenCalledWith("0729");
    expect(deps.attentionEvents.list().some((e) => e.kind === "ctoAction")).toBe(true);
  });

  it("refuses when remote validation is not running", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-kill-noval-"));
    const deps = depsWithValidator(root, async () => ({ ok: true, detail: "x" }), [
      "kill-hung-validation",
    ]);
    (deps as { remoteValidator?: unknown }).remoteValidator = undefined;
    const result = await runCtoSafeAction(deps as never, "kill-hung-validation", {
      taskId: "0729",
      actor: "human",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not running/i);
  });

  it("reports a failed kill as a non-ok result", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-kill-fail-"));
    const deps = depsWithValidator(root, async () => ({ ok: false, detail: "no run" }), [
      "kill-hung-validation",
    ]);
    const result = await runCtoSafeAction(deps as never, "kill-hung-validation", {
      taskId: "0729",
      actor: "api",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no run");
  });
});

describe("CTO restart strategy (#0727)", () => {
  it("resumes after a network stall", () => {
    expect(
      decideRestartStrategy(
        {
          kind: "crashed",
          reason: "the agent stalled or timed out — see DEFAULT_STALL_TIMEOUT_MS",
        },
        0,
      ),
    ).toBe("resume");
  });

  it("resumes a never-started session", () => {
    expect(decideRestartStrategy({ kind: "never-started", reason: "agent never started" }, 0)).toBe(
      "resume",
    );
  });

  it("starts fresh after a real crash", () => {
    expect(decideRestartStrategy({ kind: "crashed", reason: "agent crashed mid-turn" }, 0)).toBe(
      "fresh",
    );
  });

  it("starts fresh once a task has been restarted past the threshold", () => {
    expect(
      decideRestartStrategy({ kind: "crashed", reason: "the agent stalled or timed out" }, 2),
    ).toBe("fresh");
  });

  it("counts restarts in the current active episode only", () => {
    const body = [
      "## Activity",
      "- 2026-01-01T00:00:00Z · CTO action: restart-stalled-agent (resume) · old",
      "- 2026-01-02T00:00:00Z · status review→active",
      "- 2026-01-02T00:01:00Z · CTO action: restart-stalled-agent (fresh) · one",
      "- 2026-01-02T00:02:00Z · CTO action: restart-stalled-agent (resume) · two",
    ].join("\n");
    expect(countCtoRestartsThisEpisode(body)).toBe(2);
  });

  it("is zero before any restart in the episode", () => {
    expect(
      countCtoRestartsThisEpisode("## Activity\n- 2026-01-02T00:00:00Z · status ready→active\n"),
    ).toBe(0);
  });
});

describe("automation kill switch (#0727)", () => {
  it("blocks CTO-actor actions when paused", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-paused-"));
    const config = {
      ...DEFAULT_CONFIG,
      root,
      cto: { actions: ["refresh-main-install"] },
      automation: { paused: true },
    };
    const result = await runCtoSafeAction(
      {
        config,
        index: {} as never,
        runner: {} as never,
        jobCoordinator: {} as never,
        attentionEvents: createAttentionEventStore(root),
        rates: createCtoActionRateStore(root),
        logger: { agent: vi.fn(), task: vi.fn() } as never,
        emitEvent: vi.fn(),
        triggerJobProcessing: vi.fn(),
        reportedStages: {},
        reportedStageAt: {},
      },
      "refresh-main-install",
      { actor: "cto" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("paused");
  });

  it("does not block a human's explicit action when paused", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-human-"));
    const config = {
      ...DEFAULT_CONFIG,
      root,
      cto: { actions: ["refresh-main-install"] },
      automation: { paused: true },
    };
    const result = await runCtoSafeAction(
      {
        config,
        index: {} as never,
        runner: {} as never,
        jobCoordinator: {} as never,
        attentionEvents: createAttentionEventStore(root),
        rates: createCtoActionRateStore(root),
        logger: { agent: vi.fn(), task: vi.fn() } as never,
        emitEvent: vi.fn(),
        triggerJobProcessing: vi.fn(),
        reportedStages: {},
        reportedStageAt: {},
      },
      "refresh-main-install",
      { actor: "human" },
    );
    // The install itself fails in a bare temp dir; the point is the kill switch
    // did not short-circuit it.
    if (!result.ok) expect(result.reason).not.toContain("paused");
  });

  it("parses automation.paused from repoos.toml and exposes the schema key", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-automation-"));
    writeFileSync(join(dir, "repoos.toml"), "automation.paused = true\n", "utf8");
    const cfg = loadConfig(dir);
    expect(cfg.automation?.paused).toBe(true);
    expect(getConfigSchema().find((f) => f.key === "automation.paused")).toBeDefined();
    expect(SUPPORTED_TOML_KEYS).toContain("automation.paused");
    expect(SUPPORTED_TOML_KEYS).toContain("approval.autoApprove.machineryPaths");
    expect(SUPPORTED_TOML_KEYS).toContain("approval.autoApprove.allowP0");
  });

  it("parses the new approval keys from repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-approval-paths-"));
    writeFileSync(
      join(dir, "repoos.toml"),
      'approval.enabled = true\napproval.autoApprove.machineryPaths = ["vendor/"]\napproval.autoApprove.allowP0 = true\n',
      "utf8",
    );
    const cfg = loadConfig(dir);
    expect(cfg.approval?.autoApprove?.machineryPaths).toEqual(["vendor/"]);
    expect(cfg.approval?.autoApprove?.allowP0).toBe(true);
    expect(
      getConfigSchema().find((f) => f.key === "approval.autoApprove.machineryPaths"),
    ).toBeDefined();
    expect(getConfigSchema().find((f) => f.key === "approval.autoApprove.allowP0")).toBeDefined();
  });
});

describe("CTO restart skips held tasks (#0960)", () => {
  const STALLED_BODY = `## Activity

- 2000-01-01T00:00:00Z · status inbox→active
`;

  function stalledTask(id: string, isHeld: boolean) {
    return {
      id,
      title: `Stalled ${id}`,
      type: "feature" as const,
      status: "active" as const,
      needsInput: false,
      needsMerge: false,
      priority: "p2" as const,
      area: "core",
      assignee: "ai",
      assignedTo: "ai",
      createdBy: "test",
      branch: "feat/x",
      tags: [],
      created_at: null,
      updated_at: null,
      body: STALLED_BODY,
      isHeld,
      holdReason: isHeld ? "blocked on human decision" : undefined,
      holdUntil: undefined,
      holdBy: undefined,
      holdAt: undefined,
      path: `work/${id}.md`,
      absPath: `/tmp/${id}.md`,
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

  it("does not restart a held task, even when it is stalled", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cto-hold-"));
    const held = stalledTask("0001", true);
    const free = stalledTask("0002", false);
    const tasks = [held, free];
    const config = {
      ...DEFAULT_CONFIG,
      root,
      cto: { actions: ["restart-stalled-agent"] },
    };
    const deps = {
      config,
      index: {
        getTask: (id: string) => tasks.find((t) => t.id === id) ?? null,
        getTasks: () => tasks,
        applyFileChange: () => {},
      } as never,
      runner: {
        isRunning: () => false,
        isPaused: () => false,
        isHandoffInFlight: () => false,
        hasPendingHandoff: () => false,
        output: vi.fn(() => null),
      } as never,
      jobCoordinator: { allJobs: () => [], getJob: () => null, enqueue: () => null } as never,
      attentionEvents: createAttentionEventStore(root),
      rates: createCtoActionRateStore(root),
      logger: { agent: vi.fn(), task: vi.fn() } as never,
      emitEvent: vi.fn(),
      triggerJobProcessing: vi.fn(),
      reportedStages: {},
      reportedStageAt: {},
    };

    await runCtoMonitorSafeActions(deps as never);

    // Only the un-held, stalled task reached the launch chokepoint; the held one
    // was skipped by the #0960 guard in the loop.
    expect(relaunchEngineerOnActiveTask).toHaveBeenCalledTimes(1);
    const launchedTask = (relaunchEngineerOnActiveTask as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as { id: string };
    expect(launchedTask.id).toBe("0002");
  });
});
