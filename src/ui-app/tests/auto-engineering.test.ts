import { describe, it, expect, beforeEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPmVetoOrdering, AutoEngineeringOrchestrator } from "../../server/auto-engineering.js";
import { runPrompt } from "../../server/agents.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

// Mock the PM agent runner so selection paths can be exercised without a real
// CLI spawn. resolvePmAgent stays real — a config with an enabled `pm` agent
// reaches runPrompt, which the tests below stub per-case.
vi.mock("../../server/agents.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../server/agents.js")>("../../server/agents.js");
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
    vi.mocked(runPrompt).mockReset();
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

    it("ignores archived ready tasks and archived active tasks (#0657)", async () => {
      const config = mockConfig(true, 1);
      const archivedReady = mockTask("001", "ready");
      archivedReady.isArchived = true;
      const archivedActive = mockTask("002", "active");
      archivedActive.isArchived = true;

      const result = await orchestrator.reconcile(
        config,
        [archivedReady, archivedActive],
        "active-to-review",
      );

      // Archived work holds no slot and is never a candidate.
      expect(result.outcome).toBe("no-ready-work");
    });
  });

  describe("deterministic picker (default)", () => {
    it("selects ready tasks without calling the PM", async () => {
      const config = mockConfig(true, 3);
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
      expect(result.outcome).toBe("selected");
      expect(result.picker).toBe("deterministic");
      expect(result.selectedIds).toEqual(["001"]);
      expect(runPrompt).not.toHaveBeenCalled();
    });

    it("records the deterministic picker on the decision", async () => {
      const config = mockConfig(true, 3);
      const tasks = [mockTask("001", "ready")];

      await orchestrator.reconcile(config, tasks, "active-to-review");

      expect(orchestrator.getLastDecision()?.picker).toBe("deterministic");
      expect(orchestrator.getLastDecision()?.outcome).toBe("selected");
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
      const tasks = [mockTask("001", "active"), mockTask("002", "ready")];

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

/** Config with PM veto enabled and an enabled `pm` agent. */
function configWithPmVeto(maxActiveTasks = 1): RepoOSConfig {
  const config = mockConfig(true, maxActiveTasks);
  config.autoEngineering = { pmVeto: true };
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

describe("applyPmVetoOrdering", () => {
  it("reorders without inventing ids and appends omitted candidates", () => {
    expect(applyPmVetoOrdering(["1", "2", "3"], ["3", "1", "999"])).toEqual(["3", "1", "2"]);
  });
});

describe("AutoEngineeringOrchestrator — PM veto (#0690)", () => {
  let orchestrator: AutoEngineeringOrchestrator;

  beforeEach(() => {
    orchestrator = new AutoEngineeringOrchestrator();
    vi.mocked(runPrompt).mockReset();
  });

  it("falls back to the deterministic pick when the PM returns unparseable output", async () => {
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "no json here, just prose" });
    const config = configWithPmVeto(1);
    const tasks = [mockTask("001", "ready"), mockTask("002", "ready")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.picker).toBe("deterministic");
    expect(result.error).toBeDefined();
    expect(result.selectedIds).toEqual(["001"]);
    expect(runPrompt).toHaveBeenCalled();
  });

  it("falls back to the deterministic pick when the PM agent errors", async () => {
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "timeout after 30s" });
    const config = configWithPmVeto(1);
    const tasks = [mockTask("001", "ready"), mockTask("002", "ready")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.picker).toBe("deterministic");
    expect(result.error).toContain("timeout after 30s");
  });

  it("excludes blocked tasks before PM selection and reconsiders them after the prerequisite merges", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-autoeng-dependencies-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    try {
      mkdirSync(root, { recursive: true });
      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "RepoOS test");
      writeFileSync(join(root, "base.txt"), "base\n");
      git("add", "base.txt");
      git("commit", "-m", "base");
      git("checkout", "-q", "-b", "feat/upstream");
      writeFileSync(join(root, "upstream.txt"), "upstream\n");
      git("add", "upstream.txt");
      git("commit", "-m", "upstream");
      const mergedCommit = git("rev-parse", "HEAD");
      git("checkout", "-q", "main");

      const config = mockConfig(true, 3);
      config.root = root;
      const upstream = { ...mockTask("001", "ready"), branch: "feat/upstream" };
      const dependent = { ...mockTask("002", "ready"), dependsOn: ["001"] };

      await orchestrator.reconcile(config, [upstream, dependent], "startup");
      expect(orchestrator.getLastDecision()?.candidateIds).toEqual(["001"]);

      git("merge", "--ff-only", "feat/upstream");
      const releasedUpstream = {
        ...upstream,
        status: "done" as const,
        mergedCommit,
      };
      await orchestrator.reconcile(config, [releasedUpstream, dependent], "dependency-merged");
      expect(orchestrator.getLastDecision()?.candidateIds).toEqual(["002"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("drops ids the PM invented that are not in the candidate list", async () => {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"ordered": ["002", "999", "001"], "rationale": "defer web collision"}',
    });
    const config = configWithPmVeto(1);
    const tasks = [mockTask("001", "ready"), mockTask("002", "ready")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.picker).toBe("pm-veto");
    expect(result.selectedIds).toEqual(["002"]);
  });

  it("never starts more tasks than available slots", async () => {
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"ordered": ["002", "003", "004"], "rationale": "top three"}',
    });
    const config = configWithPmVeto(1);
    const tasks = [mockTask("002", "ready"), mockTask("003", "ready"), mockTask("004", "ready")];

    const result = await orchestrator.reconcile(config, tasks, "active-to-review");

    expect(result.outcome).toBe("selected");
    expect(result.picker).toBe("pm-veto");
    expect(result.selectedIds).toEqual(["002"]);
    expect(result.selectedIds!.length).toBeLessThanOrEqual(1);
  });

  it("persists the decision and recovers it on startup (startup recovery)", async () => {
    const cacheDir = `${tmpdir()}/repoos-autoeng-${Date.now()}`;
    const config = mockConfig(true, 3);
    const tasks = [mockTask("001", "ready")];

    const first = new AutoEngineeringOrchestrator(cacheDir);
    await first.reconcile(config, tasks, "active-to-review");

    const restarted = new AutoEngineeringOrchestrator(cacheDir);
    restarted.loadPersistedDecision();

    const decision = restarted.getLastDecision();
    expect(decision?.outcome).toBe("selected");
    expect(decision?.picker).toBe("deterministic");
    expect(decision?.selectedIds).toEqual(["001"]);
    expect(decision?.trigger).toBe("active-to-review");

    rmSync(cacheDir, { recursive: true, force: true });
  });
});
