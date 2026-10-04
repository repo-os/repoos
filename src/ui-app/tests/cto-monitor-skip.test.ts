/**
 * #0649 — the CTO monitor used to run a full model call on every tick and
 * event regardless of board health, and a failed run lost its reason. This
 * suite locks in the deterministic pre-check (a healthy board makes zero LLM
 * calls), structural idempotence (idle-minute counters do not retrigger), the
 * trigger/error recording, and the Settings/`repoos.toml` contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CTOMonitor } from "../../server/cto-monitor.js";
import { CTOManager } from "../../server/cto.js";
import { getConfigSchema, loadConfig } from "../../core/config.js";
import { getRepoOSDb, resetDbInstance } from "../../core/db.js";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import type { LiveIndex } from "../../server/live-index.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-cto-skip-"));
  roots.push(root);
  return root;
}

function configFor(root: string): RepoOSConfig {
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
  };
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: "a task",
    type: "feature",
    status: "inbox",
    needsInput: false,
    needsMerge: false,
    priority: "medium",
    area: "core",
    assignee: "ai",
    assignedTo: "",
    createdBy: "",
    branch: "",
    tags: [],
    created_at: null,
    updated_at: null,
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
  } as unknown as LiveIndex;
}

interface FakeCTO {
  run: ReturnType<typeof vi.fn>;
  enabled: () => boolean;
  isRunning: () => boolean;
  sendTaskMessage: () => boolean;
  recordAutomaticNudge: () => boolean;
}

function fakeCto(): { cto: FakeCTO; runs: Array<{ digest: string; trigger: string }> } {
  const runs: Array<{ digest: string; trigger: string }> = [];
  const cto: FakeCTO = {
    run: vi.fn(async (digest: string, trigger: string) => {
      runs.push({ digest, trigger });
      return { ok: true };
    }),
    enabled: () => true,
    isRunning: () => false,
    sendTaskMessage: () => false,
    recordAutomaticNudge: () => false,
  };
  return { cto, runs };
}

/** A monitor whose build/process health is stubbed healthy or not. */
function monitorFor(
  tasks: Task[],
  cto: FakeCTO,
  healthy: { build?: boolean; processes?: boolean } = {},
): CTOMonitor {
  const root = tempRoot();
  const monitor = new CTOMonitor(configFor(root), indexWith(tasks), cto as unknown as CTOManager);
  (monitor as unknown as Record<string, unknown>).buildHealth = () => ({
    healthy: healthy.build !== false,
    label: healthy.build === false ? "⚠️ stale" : "✓ fresh",
  });
  (monitor as unknown as Record<string, unknown>).processHealth = () => ({
    healthy: healthy.processes !== false,
    label: healthy.processes === false ? "⚠️ stale processes" : "✓ processes look normal",
  });
  return monitor;
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

describe("CTO monitor skip-when-healthy (#0649)", () => {
  it("makes zero LLM calls on a healthy board", async () => {
    const { cto, runs } = fakeCto();
    const monitor = monitorFor([task({ id: "0001", status: "inbox" })], cto);

    await monitor.checkNow("timer");
    await monitor.checkNow("timer");

    expect(cto.run).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it("runs on a stale build or abnormal process check even with no stuck task", async () => {
    const { cto, runs } = fakeCto();
    const monitor = monitorFor([task({ id: "0001", status: "inbox" })], cto, {
      build: false,
    });

    await monitor.checkNow("timer");
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("timer");
  });

  it("runs exactly once per material change, not on idle-minute drift", async () => {
    vi.useFakeTimers();
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    vi.setSystemTime(base);

    const stale = task({
      id: "0001",
      status: "active",
      updated_at: new Date(base - 25 * 60_000).toISOString(),
    });
    const { cto, runs } = fakeCto();
    const monitor = monitorFor([stale], cto);

    await monitor.checkNow("timer");
    expect(runs).toHaveLength(1);

    // Two idle minutes pass; describeStuckSignal's minute counter changes but
    // the structural signal does not, so no second model call.
    vi.setSystemTime(base + 2 * 60_000);
    await monitor.checkNow("timer");
    expect(runs).toHaveLength(1);

    // A second genuinely stuck task is a material change.
    const other = task({
      id: "0002",
      status: "review",
      updated_at: new Date(base - 40 * 60_000).toISOString(),
    });
    (monitor as unknown as { index: LiveIndex }).index = indexWith([stale, other]);
    await monitor.checkNow("timer");
    expect(runs).toHaveLength(2);
  });

  it("records the event reason on an event-triggered run", async () => {
    vi.useFakeTimers();
    const { cto, runs } = fakeCto();
    const monitor = monitorFor(
      [
        task({
          id: "0001",
          status: "active",
          updated_at: new Date(Date.now() - 25 * 60_000).toISOString(),
        }),
      ],
      cto,
    );

    monitor.onEvent("review complete for task #0001: ok");
    await vi.advanceTimersByTimeAsync(2000);

    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("event: review complete for task #0001: ok");
  });

  it("still runs a healthy board when ctoSkipHealthy is false", async () => {
    const { cto, runs } = fakeCto();
    const root = tempRoot();
    const monitor = new CTOMonitor(
      { ...configFor(root), ctoSkipHealthy: false },
      indexWith([task({ id: "0001", status: "inbox" })]),
      cto as unknown as CTOManager,
    );
    (monitor as unknown as Record<string, unknown>).buildHealth = () => ({
      healthy: true,
      label: "✓ fresh",
    });
    (monitor as unknown as Record<string, unknown>).processHealth = () => ({
      healthy: true,
      label: "✓ processes look normal",
    });

    await monitor.checkNow("timer");
    expect(runs).toHaveLength(1);
  });
});

describe("CTO session trigger and failure recording (#0649)", () => {
  const agent: Agent = { name: "cto", cli: "opencode", model: "m", enabled: true };

  it("stores the trigger and the failure reason on an errored run", () => {
    const root = tempRoot();
    const manager = new CTOManager(configFor(root), () => {});
    const at = "2026-01-01T00:00:10.000Z";

    (
      manager as unknown as {
        recordRun: (
          a: Agent,
          r: unknown,
          c: string,
          ok: boolean,
          opts: Record<string, unknown>,
        ) => void;
      }
    ).recordRun(agent, { ok: false, error: "402 payment required", elapsedMs: 3000 }, at, false, {
      trigger: "event: agent exited: task #0001",
      errorReason: "402 payment required",
    });

    const db = getRepoOSDb(root);
    expect(db).not.toBeNull();
    const row = db!.getSession(`cto:${at}`);
    expect(row?.status).toBe("errored");
    expect(row?.trigger).toBe("event: agent exited: task #0001");
    expect(row?.errorReason).toBe("402 payment required");

    // The Tokens panel surfaces it as a recent failure.
    const failure = db!.getBoardStats().recentFailures.find((r) => r.sessionId === `cto:${at}`);
    expect(failure?.errorReason).toBe("402 payment required");
  });

  it("records the trigger but a null reason on a successful run", () => {
    const root = tempRoot();
    const manager = new CTOManager(configFor(root), () => {});
    const at = "2026-01-01T00:00:20.000Z";

    (
      manager as unknown as {
        recordRun: (
          a: Agent,
          r: unknown,
          c: string,
          ok: boolean,
          o: Record<string, unknown>,
        ) => void;
      }
    ).recordRun(agent, { ok: true, output: "Nothing to report", elapsedMs: 1200 }, at, true, {
      trigger: "timer",
    });

    const row = getRepoOSDb(root)!.getSession(`cto:${at}`);
    expect(row?.status).toBe("finished");
    expect(row?.trigger).toBe("timer");
    expect(row?.errorReason).toBeNull();
  });

  it("truncates an over-long error reason", () => {
    const root = tempRoot();
    const manager = new CTOManager(configFor(root), () => {});
    const at = "2026-01-01T00:00:30.000Z";

    (
      manager as unknown as {
        recordRun: (
          a: Agent,
          r: unknown,
          c: string,
          ok: boolean,
          o: Record<string, unknown>,
        ) => void;
      }
    ).recordRun(agent, { ok: false, elapsedMs: 100 }, at, false, {
      trigger: "timer",
      errorReason: "x".repeat(5000),
    });

    const row = getRepoOSDb(root)!.getSession(`cto:${at}`);
    expect(row?.errorReason).not.toBeNull();
    expect(row!.errorReason!.length).toBeLessThan(5000);
    expect(row!.errorReason!.endsWith("[truncated]")).toBe(true);
  });
});

describe("ctoSkipHealthy Settings contract (#0649)", () => {
  it("is exposed as a live Settings toggle defaulting to on", () => {
    expect(getConfigSchema().find((f) => f.key === "ctoSkipHealthy")).toMatchObject({
      label: "Skip the CTO on a healthy board",
      type: "boolean",
      tier: "live",
      default: true,
    });
  });

  it("defaults to true and reads an explicit false from repoos.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-cto-cfg-"));
    try {
      expect(loadConfig(dir).ctoSkipHealthy).toBe(true);
      writeFileSync(join(dir, "repoos.toml"), "ctoSkipHealthy = false\n", "utf8");
      expect(loadConfig(dir).ctoSkipHealthy).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
