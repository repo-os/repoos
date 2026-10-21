/**
 * #0873 — the CTO idle nudge must only fire when the engineer is genuinely
 * idle. These tests are table-driven over the pure decision (fake process,
 * pressure, queue and gate inputs) plus a few monitor-level integrations that
 * prove the snapshot is wired to the decision and the reason is recorded once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CTOMonitor, type CTOMonitorProbes } from "../../server/cto-monitor.js";
import { CTOManager } from "../../server/cto.js";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { resetDbInstance } from "../../core/db.js";
import {
  DEFAULT_CTO_NUDGE_COOLDOWN_MS,
  DEFAULT_CTO_NUDGE_IDLE_MS,
  decideIdleNudge,
  knownWorkProcessLabel,
  resolveCtoNudgeCooldownMs,
  resolveCtoNudgeIdleMs,
  type EngineerProcessState,
  type IdleNudgeSignals,
  type IdleNudgeSkipReason,
} from "../../core/cto-idle-nudge.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import type { LiveIndex } from "../../server/live-index.js";
import { generalSectionForKey, resolveSettingLocation } from "../src/settings-location.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-cto-nudge-"));
  roots.push(root);
  return root;
}

function configFor(root: string, over: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ctoSkipHealthy: true,
    ...over,
  };
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: "a task",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    priority: "medium",
    area: "core",
    assignee: "ai",
    assignedTo: "",
    createdBy: "",
    branch: "feat/x",
    tags: [],
    created_at: null,
    updated_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    body: "",
    path: `work/${over.id}-t.md`,
    absPath: `/tmp/${over.id}-t.md`,
    ...over,
  } as Task;
}

function indexWith(tasks: Task[]): LiveIndex {
  const counts: Record<string, number> = {
    draft: 0,
    inbox: 0,
    ready: 0,
    active: 0,
    review: 0,
    done: 0,
  };
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return {
    getTasks: (status?: string) => (status ? tasks.filter((t) => t.status === status) : tasks),
    counts: () => counts,
    applyFileChange: vi.fn(async () => {}),
  } as unknown as LiveIndex;
}

function baseSignals(over: Partial<IdleNudgeSignals> = {}): IdleNudgeSignals {
  return {
    runnerRunning: true,
    processGroupAlive: true,
    busyChild: null,
    paused: false,
    handoffInFlight: false,
    pendingHandoff: false,
    reviewRunning: false,
    remoteValidationRunning: false,
    messageQueued: false,
    recentWorktreeActivity: false,
    idleForMs: DEFAULT_CTO_NUDGE_IDLE_MS + 60_000,
    idleThresholdMs: DEFAULT_CTO_NUDGE_IDLE_MS,
    cooldownActive: false,
    pressureReason: null,
    ...over,
  };
}

describe("decideIdleNudge (#0873)", () => {
  const cases: Array<{
    name: string;
    over: Partial<IdleNudgeSignals>;
    nudge: boolean;
    reason: IdleNudgeSkipReason | null;
  }> = [
    { name: "genuinely idle engineer gets the default nudge", over: {}, nudge: true, reason: null },
    {
      name: "paused task",
      over: { paused: true },
      nudge: false,
      reason: "paused",
    },
    {
      name: "no runner entry",
      over: { runnerRunning: false, processGroupAlive: false },
      nudge: false,
      reason: "not-running",
    },
    {
      name: "handoff gate finalizing",
      over: { handoffInFlight: true },
      nudge: false,
      reason: "handoff-in-flight",
    },
    {
      name: "handoff request retained on disk",
      over: { pendingHandoff: true },
      nudge: false,
      reason: "handoff-in-flight",
    },
    {
      name: "review running",
      over: { reviewRunning: true },
      nudge: false,
      reason: "review-running",
    },
    {
      name: "phantom runner (tracked but no live process)",
      over: { processGroupAlive: false },
      nudge: false,
      reason: "phantom-runner",
    },
    {
      name: "known child is running a check",
      over: { busyChild: "repoos check" },
      nudge: false,
      reason: "process-busy",
    },
    {
      name: "remote validation wait",
      over: { remoteValidationRunning: true },
      nudge: false,
      reason: "remote-validation-running",
    },
    {
      name: "a message is already queued",
      over: { messageQueued: true },
      nudge: false,
      reason: "message-queued",
    },
    {
      name: "worktree activity inside the window",
      over: { recentWorktreeActivity: true },
      nudge: false,
      reason: "recent-activity",
    },
    {
      name: "below the idle threshold",
      over: { idleForMs: 60_000 },
      nudge: false,
      reason: "below-threshold",
    },
    {
      name: "inside the cooldown",
      over: { cooldownActive: true },
      nudge: false,
      reason: "cooldown",
    },
    {
      name: "machine is under pressure",
      over: { pressureReason: "swap is nearly full (13 GB of 15 GB swap, 87%)" },
      nudge: false,
      reason: "machine-pressure",
    },
  ];

  it.each(cases)("$name", ({ over, nudge, reason }) => {
    const decision = decideIdleNudge(baseSignals(over));
    expect(decision.nudge).toBe(nudge);
    expect(decision.reason).toBe(reason);
  });

  it("labels only known long-running work children", () => {
    const labels: Array<[string, string | null]> = [
      ["bun run repoos check --changed main", "repoos check"],
      ["bunx vitest run src/server", "vitest"],
      ["bun scripts/run-tests.mjs", "vitest"],
      ["node .../playwright/cli.js smoke", "headless browser"],
      ["/usr/bin/chromium --headless", "headless browser"],
      ["bun run build", "bun"],
      ["bun test", "bun"],
      ["bash validate.sh --mirror", "remote validation"],
      ["opencode --model x", null],
      ["/bin/zsh -l", null],
    ];
    for (const [command, label] of labels) expect(knownWorkProcessLabel(command)).toBe(label);
  });
});

describe("idle nudge config (#0873)", () => {
  it("falls back to the defaults on missing or invalid values", () => {
    expect(resolveCtoNudgeIdleMs(undefined)).toBe(DEFAULT_CTO_NUDGE_IDLE_MS);
    expect(resolveCtoNudgeIdleMs({ cto: { nudgeIdleMs: 0 } })).toBe(DEFAULT_CTO_NUDGE_IDLE_MS);
    expect(resolveCtoNudgeIdleMs({ cto: { nudgeIdleMs: -1 } })).toBe(DEFAULT_CTO_NUDGE_IDLE_MS);
    expect(resolveCtoNudgeIdleMs({ cto: { nudgeIdleMs: Number.NaN } })).toBe(
      DEFAULT_CTO_NUDGE_IDLE_MS,
    );
    expect(resolveCtoNudgeCooldownMs({ cto: { nudgeCooldownMs: 1 } })).toBe(
      DEFAULT_CTO_NUDGE_COOLDOWN_MS,
    );
    expect(resolveCtoNudgeIdleMs({ cto: { nudgeIdleMs: 120_000 } })).toBe(120_000);
  });

  it("exposes live Settings controls and parser keys", () => {
    expect(getConfigSchema().find((f) => f.key === "cto.nudgeIdleMs")).toMatchObject({
      type: "number",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CTO_NUDGE_IDLE_MS,
      min: 30_000,
    });
    expect(getConfigSchema().find((f) => f.key === "cto.nudgeCooldownMs")).toMatchObject({
      type: "number",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CTO_NUDGE_COOLDOWN_MS,
      min: 60_000,
    });
    expect(SUPPORTED_TOML_KEYS).toEqual(
      expect.arrayContaining(["cto.nudgeIdleMs", "cto.nudgeCooldownMs"]),
    );
    // Both controls live on the General tab's Automation section with the rest
    // of the CTO; the section id is stable for search/anchor links.
    expect(
      resolveSettingLocation(
        "cto.nudgeIdleMs",
        { tier: "live", group: "general" },
        { inspectorAvailable: true },
      ),
    ).toEqual({ tab: "general", hasUiRow: true });
    expect(generalSectionForKey("cto.nudgeIdleMs")).toBe("automation");
    expect(generalSectionForKey("cto.nudgeCooldownMs")).toBe("automation");
  });

  it("parses valid values from repoos.toml and ignores invalid ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-cto-nudge-cfg-"));
    try {
      expect(loadConfig(dir).cto?.nudgeIdleMs).toBe(DEFAULT_CTO_NUDGE_IDLE_MS);
      writeFileSync(
        join(dir, "repoos.toml"),
        "[cto]\nnudgeIdleMs = 120000\nnudgeCooldownMs = 600000\n",
        "utf8",
      );
      const cfg = loadConfig(dir);
      expect(cfg.cto?.nudgeIdleMs).toBe(120_000);
      expect(cfg.cto?.nudgeCooldownMs).toBe(600_000);

      writeFileSync(join(dir, "repoos.toml"), "[cto]\nnudgeIdleMs = 5\n", "utf8");
      expect(loadConfig(dir).cto?.nudgeIdleMs).toBe(DEFAULT_CTO_NUDGE_IDLE_MS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

interface FakeRunnerState {
  running?: boolean;
  paused?: boolean;
  handoff?: boolean;
  pendingHandoff?: boolean;
  queued?: boolean;
  process?: EngineerProcessState;
}

function fakeRunner(state: FakeRunnerState) {
  return {
    isRunning: () => state.running ?? true,
    isPaused: () => state.paused ?? false,
    isHandoffInFlight: () => state.handoff ?? false,
    hasPendingHandoff: () => state.pendingHandoff ?? false,
    hasQueuedMessages: () => state.queued ?? false,
    engineerProcessState: () =>
      state.process ?? { tracked: true, groupAlive: true, busyChild: null },
  };
}

interface FakeCto {
  sendTaskMessage: ReturnType<typeof vi.fn>;
  recordAutomaticNudge: ReturnType<typeof vi.fn>;
  recordIdleNudgeSkip: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  enabled: () => boolean;
  isRunning: () => boolean;
}

function fakeCto(): FakeCto {
  return {
    sendTaskMessage: vi.fn(() => true),
    recordAutomaticNudge: vi.fn(() => true),
    recordIdleNudgeSkip: vi.fn(() => true),
    run: vi.fn(async () => ({ ok: true })),
    enabled: () => true,
    isRunning: () => false,
  };
}

function monitorFor(
  opts: {
    config?: Partial<RepoOSConfig>;
    runner?: FakeRunnerState;
    probes?: CTOMonitorProbes;
    tasks?: Task[];
  } = {},
): { monitor: CTOMonitor; cto: FakeCto; run: ReturnType<typeof fakeRunner>; task: Task } {
  const root = tempRoot();
  const theTask = (opts.tasks ?? [task({ id: "0001" })])[0];
  const cto = fakeCto();
  const run = fakeRunner(opts.runner ?? {});
  const monitor = new CTOMonitor(
    configFor(root, opts.config),
    indexWith(opts.tasks ?? [theTask]),
    cto as unknown as CTOManager,
    run as never,
    opts.probes ?? { pressureReason: () => null },
  );
  (monitor as unknown as Record<string, unknown>).buildHealth = () => ({
    healthy: true,
    label: "✓ fresh",
  });
  (monitor as unknown as Record<string, unknown>).processHealth = () => ({
    healthy: true,
    label: "✓ processes look normal",
  });
  return { monitor, cto, run, task: theTask };
}

beforeEach(() => {
  resetDbInstance();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDbInstance();
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
  roots.length = 0;
});

describe("CTO monitor idle nudge (#0873)", () => {
  it("nudges a genuinely idle engineer with the configured text", async () => {
    const { monitor, cto, task: theTask } = monitorFor();
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).toHaveBeenCalledTimes(1);
    const message = String(cto.sendTaskMessage.mock.calls[0]![1]);
    expect(message).toContain("no worktree activity for 5 minutes");
    expect(message).toContain("repoos mv <this task's id> review");
    expect(message).toContain("::repoos-handoff-ready::");
    expect(cto.recordAutomaticNudge).toHaveBeenCalledWith(theTask, 5);
    expect(cto.recordIdleNudgeSkip).not.toHaveBeenCalled();
  });

  it("honours a configured idle threshold", async () => {
    const threeMinutesOld = task({
      id: "0001",
      updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
    const tight = monitorFor({
      tasks: [threeMinutesOld],
      config: { cto: { nudgeIdleMs: 2 * 60_000, nudgeCooldownMs: 60 * 60_000 } },
    });
    await tight.monitor.checkNow("timer");
    expect(tight.cto.sendTaskMessage).toHaveBeenCalledTimes(1);

    const standard = monitorFor({ tasks: [threeMinutesOld] });
    await standard.monitor.checkNow("timer");
    expect(standard.cto.sendTaskMessage).not.toHaveBeenCalled();
  });

  const held: Array<{
    name: string;
    runner?: FakeRunnerState;
    probes?: CTOMonitorProbes;
    tasks?: Task[];
    expect: string;
  }> = [
    {
      name: "a running check child",
      runner: { process: { tracked: true, groupAlive: true, busyChild: "repoos check" } },
      expect: "repoos check",
    },
    {
      name: "a running headless browser child",
      runner: { process: { tracked: true, groupAlive: true, busyChild: "headless browser" } },
      expect: "headless browser",
    },
    {
      name: "an in-flight handoff gate",
      runner: { handoff: true },
      expect: "handoff gate is running",
    },
    {
      name: "a pending handoff request",
      runner: { pendingHandoff: true },
      expect: "handoff gate is running",
    },
    {
      name: "a running review",
      probes: { pressureReason: () => null, reviewRunning: () => true },
      expect: "review is running",
    },
    {
      name: "an active remote validation run",
      probes: { pressureReason: () => null, remoteValidationRunning: () => true },
      expect: "remote validation is running",
    },
    {
      name: "an already-queued undelivered message",
      runner: { queued: true },
      expect: "an undelivered message is already queued",
    },
    {
      name: "machine memory pressure",
      probes: {
        pressureReason: () => "swap is nearly full (13 GB of 15 GB swap, 87%)",
      },
      expect: "machine under pressure",
    },
  ];

  it.each(held)("holds the nudge for $name and records the reason once", async (entry) => {
    const { monitor, cto } = monitorFor({ runner: entry.runner, probes: entry.probes });
    await monitor.checkNow("timer");
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).not.toHaveBeenCalled();
    expect(cto.recordAutomaticNudge).not.toHaveBeenCalled();
    expect(cto.recordIdleNudgeSkip).toHaveBeenCalledTimes(1);
    expect(String(cto.recordIdleNudgeSkip.mock.calls[0]![1])).toContain(entry.expect);
  });

  it("reports a phantom runner as that condition instead of nudging", async () => {
    const { monitor, cto } = monitorFor({
      runner: { process: { tracked: true, groupAlive: false, busyChild: null } },
    });
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).not.toHaveBeenCalled();
    expect(String(cto.recordIdleNudgeSkip.mock.calls[0]![1])).toContain("phantom runner");
  });

  it("does not nudge inside the cooldown, and logs no held reason", async () => {
    const recentlyNudged = task({
      id: "0001",
      body: `## Activity\n\n- ${new Date(Date.now() - 5 * 60_000).toISOString()} · CTO nudge: sent engineer a completion reminder after 5m without worktree activity\n`,
    });
    const { monitor, cto } = monitorFor({ tasks: [recentlyNudged] });
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).not.toHaveBeenCalled();
    expect(cto.recordIdleNudgeSkip).not.toHaveBeenCalled();
  });

  it("still halts entirely when automation.paused is true", async () => {
    const { monitor, cto } = monitorFor({ config: { automation: { paused: true } } });
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).not.toHaveBeenCalled();
    expect(cto.recordIdleNudgeSkip).not.toHaveBeenCalled();
  });

  it("does not nudge a paused task", async () => {
    const { monitor, cto } = monitorFor({ runner: { paused: true } });
    await monitor.checkNow("timer");

    expect(cto.sendTaskMessage).not.toHaveBeenCalled();
    expect(cto.recordIdleNudgeSkip).not.toHaveBeenCalled();
  });
});
