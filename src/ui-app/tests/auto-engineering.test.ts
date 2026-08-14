import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { AutoEngineeringOrchestrator } from "../../server/auto-engineering.js";
import { runPrompt } from "../../server/agents.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

// Mock the PM agent runner so selection paths can be exercised without a real
// CLI spawn. resolvePmAgent stays real — a config with an enabled `pm` agent
// reaches runPrompt, which the tests below stub per-case.
vi.mock("../../server/agents.js", async () => {
  const actual = await vi.importActual<typeof import("../../server/agents.js")>(
    "../../server/agents.js",
  );
  return { ...actual, runPrompt: vi.fn() };
});

// Mock task factory
function mockTask(id: string, status: "active" | "ready" | "inbox" | "review" = "ready"): Task {
  return {
    id,
    title: `Task ${id}`,
    type: "feature",
    status,
    needsInput: false,
    needsMerge: false,
  noSourceChange: false,
    priority: "p2",
    area: "test",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "test",
    branch: `feat/task-${id}`,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    path: `work/0${id}-task.md`,
    absPath: `/repo/work/0${id}-task.md`,
    body: "Test task",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  };
}

function mockConfig(autoEngineeringMode = false, maxActiveTasks = 3): RepoOSConfig {
  return {
    root: "/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    theme: "system",
    uiTheme: "classic",
    defaultTaskMode: "freeform",
    tunnelEnabled: false,
    ntfyEnabled: false,
    ntfyTopic: "",
    ntfyBaseUrl: "https://ntfy.sh",
    autoEngineeringMode,
    maxActiveTasks,
  };
}

describe("AutoEngineeringOrchestrator", () => {
  let orchestrator: AutoEngineeringOrchestrator;

  beforeEach(() => {
    orchestrator = new AutoEngineeringOrchestrator();
    // DEFAULT_AGENTS includes an enabled `pm`, so a config without an explicit
    // agents list still reaches runPrompt. Default to a pm-failed result so
    // decision fields (trigger, candidates, counts) match across outcomes.
    vi.mocked(runPrompt).mockReset();
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: pm unavailable" });
  });

  describe("disabled mode", () => {
    it("returns not triggered when mode is disabled", async () => {
      const config = mockConfig(false, 3);
      const tasks = [mockTask("001", "ready"), mockTask("002", "active")];

      const result = await orchestrator.reconcile(config, tasks, "active-to-review");

      expect(result.triggered).toBe(false);
    });
  });

  describe("no capacity", () => {
    it("returns no-capacity when all slots filled", async () => {
      const config = mockConfig(true, 2);
      const tasks = [
        mockTask("001", "active"),
        mockTask("002", "active"),
        mockTask("003", "ready"),
      ];

      const result = await orchestrator.reconcile(config, tasks, "active-to-review");

      expect(result.triggered).toBe(true);
      expect(result.outcome).toBe("no-capacity");
    });
  });

  describe("no ready work", () => {
    it("returns no-ready-work when no ready tasks exist", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "active"), mockTask("002", "inbox")];

      const result = await orchestrator.reconcile(config, tasks, "active-to-review");

      expect(result.triggered).toBe(true);
      expect(result.outcome).toBe("no-ready-work");
    });
  });

  describe("PM agent unavailable", () => {
    it("returns pm-unavailable when PM agent is disabled", async () => {
      const config = mockConfig(true, 3);
      // Explicitly disable the PM agent
      config.agents = [
        {
          name: "pm",
          cli: "opencode",
          model: "big pickle",
          enabled: false,
          instructions: "PM agent",
        },
      ];

      const tasks = [mockTask("001", "ready"), mockTask("002", "active")];

      const result = await orchestrator.reconcile(config, tasks, "active-to-review");

      expect(result.triggered).toBe(true);
      expect(result.outcome).toBe("pm-unavailable");
      expect(result.error).toBeDefined();
    });
  });

  describe("single-flight reconciliation", () => {
    it("prevents concurrent reconciliation", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      // Start first reconciliation (will fail due to no PM, but doesn't matter)
      const promise1 = orchestrator.reconcile(config, tasks, "active-to-review");

      // Attempt second reconciliation while first is running
      const promise2 = orchestrator.reconcile(config, tasks, "active-to-review");

      const result2 = await promise2;

      // Second reconciliation should return not triggered
      expect(result2.triggered).toBe(false);
    });
  });

  describe("decision tracking", () => {
    it("persists last decision for Control page hydration", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();
      expect(decision).toBeDefined();
      expect(decision?.trigger).toBe("active-to-review");
      expect(decision?.candidateIds).toContain("001");
    });

    it("returns null when no reconciliation has run", () => {
      const decision = orchestrator.getLastDecision();
      expect(decision).toBeNull();
    });
  });

  describe("multi-slot selection", () => {
    it("tracks available slots correctly", async () => {
      const config = mockConfig(true, 5);
      const tasks = [
        mockTask("001", "active"),
        mockTask("002", "active"),
        mockTask("003", "ready"),
        mockTask("004", "ready"),
      ];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();
      expect(decision?.activeCount).toBe(2);
      expect(decision?.maxActiveTasks).toBe(5);
      expect(decision?.availableSlots).toBe(3);
    });
  });

  describe("candidate task IDs", () => {
    it("tracks all ready tasks as candidates", async () => {
      const config = mockConfig(true, 3);
      const tasks = [
        mockTask("001", "ready"),
        mockTask("002", "ready"),
        mockTask("003", "ready"),
        mockTask("004", "active"),
      ];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();
      expect(decision?.candidateIds).toEqual(["001", "002", "003"]);
    });
  });

  describe("trigger types", () => {
    it("records trigger as active-to-review", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();
      expect(decision?.trigger).toBe("active-to-review");
    });

    it("records trigger as inbox-to-ready", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "inbox-to-ready");

      const decision = orchestrator.getLastDecision();
      expect(decision?.trigger).toBe("inbox-to-ready");
    });

    it("records trigger as config-change", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "config-change");

      const decision = orchestrator.getLastDecision();
      expect(decision?.trigger).toBe("config-change");
    });

    it("records trigger as startup", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "startup");

      const decision = orchestrator.getLastDecision();
      expect(decision?.trigger).toBe("startup");
    });
  });

  describe("default maximum", () => {
    it("uses default maxActiveTasks of 3 when not specified", async () => {
      const config = mockConfig(true);
      config.maxActiveTasks = undefined;

      const tasks = [
        mockTask("001", "active"),
        mockTask("002", "active"),
        mockTask("003", "active"),
        mockTask("004", "ready"),
      ];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();
      expect(decision?.maxActiveTasks).toBe(3);
      expect(decision?.outcome).toBe("no-capacity");
    });
  });

  describe("custom maximum", () => {
    it("respects custom maxActiveTasks setting", async () => {
      const config = mockConfig(true, 10);
      const tasks = [
        mockTask("001", "active"),
        mockTask("002", "ready"),
      ];

      await orchestrator.reconcile(config, tasks, "startup");

      const decision = orchestrator.getLastDecision();
      expect(decision?.maxActiveTasks).toBe(10);
      expect(decision?.availableSlots).toBe(9);
    });
  });

  describe("timestamp", () => {
    it("records ISO timestamp for decision", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      const decision = orchestrator.getLastDecision();

      expect(decision?.timestamp).toBeDefined();
      expect(decision!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

/** Config with an enabled `pm` agent so reconciliation reaches the (mocked) runPrompt. */
function configWithPm(maxActiveTasks = 3): RepoOSConfig {
  const config = mockConfig(true, maxActiveTasks);
  config.agents = [
    {
      name: "pm",
      cli: "opencode",
      model: "big pickle",
      enabled: true,
      instructions: "PM agent",
    },
  ];
  return config;
}

describe("AutoEngineeringOrchestrator — PM selection (0124)", () => {
  let orchestrator: AutoEngineeringOrchestrator;

  beforeEach(() => {
    orchestrator = new AutoEngineeringOrchestrator();
    // DEFAULT_AGENTS includes an enabled `pm`, so a config without an explicit
    // agents list still reaches runPrompt. Default to a pm-failed result so
    // decision fields (trigger, candidates, counts) match across outcomes.
    vi.mocked(runPrompt).mockReset();
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "mocked: pm unavailable" });
  });

  it("fails cleanly when the PM returns output that is not a selection (pm-failed)", async () => {
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "no json here, just prose" });
    const config = configWithPm(3);
    const tasks = [mockTask("001", "ready"), mockTask("002", "active")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("pm-failed");
    expect(result.error).toBeDefined();
    const decision = orchestrator.getLastDecision();
    expect(decision?.selectedIds).toEqual([]);
    expect(decision?.candidateIds).toEqual(["001"]);
  });

  it("fails cleanly when the PM agent errors (pm-failed)", async () => {
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "timeout after 30s" });
    const config = configWithPm(3);
    const tasks = [mockTask("001", "ready")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("pm-failed");
    expect(result.error).toContain("timeout after 30s");
  });

  it("drops stale PM choices that are no longer in the ready pool", async () => {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"selected": ["001", "999"], "rationale": "both look impactful"}',
    });
    const config = configWithPm(3);
    // 999 is not a task at all; 002 moved out of ready after the PM was asked.
    const tasks = [mockTask("001", "ready"), mockTask("002", "active")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.selectedIds).toEqual(["001"]);
  });

  it("never starts more tasks than available slots even if the PM over-selects", async () => {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"selected": ["002", "003", "004"], "rationale": "top three"}',
    });
    const config = configWithPm(1);
    // max 1, nothing active → exactly one slot; the PM over-selects three.
    const tasks = [
      mockTask("002", "ready"),
      mockTask("003", "ready"),
      mockTask("004", "ready"),
    ];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.selectedIds).toEqual(["002"]);
    expect(result.selectedIds!.length).toBeLessThanOrEqual(1);
  });

  it("persists the decision and recovers it on startup (startup recovery)", async () => {
    const cacheDir = `${tmpdir()}/repoos-autoeng-${Date.now()}`;
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"selected": ["001"], "rationale": "only ready task"}',
    });
    const config = configWithPm(3);
    const tasks = [mockTask("001", "ready")];

    const first = new AutoEngineeringOrchestrator(cacheDir);
    await first.reconcile(config, tasks, "active-to-review");

    // A fresh orchestrator (server restart) hydrates from disk.
    const restarted = new AutoEngineeringOrchestrator(cacheDir);
    restarted.loadPersistedDecision();

    const decision = restarted.getLastDecision();
    expect(decision?.outcome).toBe("selected");
    expect(decision?.selectedIds).toEqual(["001"]);
    expect(decision?.trigger).toBe("active-to-review");

    rmSync(cacheDir, { recursive: true, force: true });
  });
});
