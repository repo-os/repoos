import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import type { AgentRunner } from "../../server/agents.js";
import { ReviewManager, reviewTimeoutMs } from "../../server/review.js";

// A registration with no live reviewer must never refuse a later review
// (#1083). These cover the three ways one leaked: a reviewer that throws before
// it writes a session, a cancel that lands after the child is already gone, and
// a registration that outlives the review timeout.

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const TASK_ID = "0001";
const KEY = `review:${TASK_ID}`;
const task = { id: TASK_ID, status: "review", branch: "feat/test" } as Task;

function setup(runnerOverrides: Partial<AgentRunner> = {}) {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-stale-"));
  roots.push(root);
  const config = {
    root,
    cacheDir: ".repoos",
    agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
  } as RepoOSConfig;
  const runner = {
    isRunning: () => false,
    reviewProcessLive: () => false,
    abandonFinalizing: vi.fn(() => false),
    running: () => [],
    stop: vi.fn(() => ({ stopped: false, reason: "task is not running" })),
    startReview: vi.fn(() => ({ ok: true })),
    reviewKindOf: () => "run",
    output: () => null,
    hasSession: () => false,
    system: () => {},
    ...runnerOverrides,
  } as unknown as AgentRunner;
  const reviews = new ReviewManager(config, () => {}, runner);
  const internal = reviews as unknown as {
    prepareReview: (
      id: string,
      mode: "run" | "chat",
      prepare: (run: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    spawnDurable: (
      id: string,
      agent: unknown,
      mission: string,
      workdir: string,
      run: unknown,
      mode: "run" | "chat",
    ) => void;
    runs: Map<string, { startedAt: number; cancelled: boolean; mode: "run" | "chat" }>;
  };
  return { reviews, runner, internal, config };
}

describe("review registration release (#1083)", () => {
  it("releases the registration when the reviewer throws before writing a session", async () => {
    const { reviews, internal } = setup({
      startReview: vi.fn(() => {
        throw new Error("Can't reach the API server");
      }),
    });
    const agent = { name: "reviewer", cli: "opencode", model: "default" };
    await internal.prepareReview(TASK_ID, "run", async (run) => {
      internal.spawnDurable(TASK_ID, agent, "mission", "/tmp/worktree", run, "run");
      return { ok: false };
    });
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(reviews.runningCount()).toBe(0);
  });

  it("releases the registration when the prepare callback rejects", async () => {
    const { reviews, internal } = setup();
    await expect(
      internal.prepareReview(TASK_ID, "run", async () => {
        throw new Error("could not build the review mission");
      }),
    ).rejects.toThrow("could not build the review mission");
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(reviews.runningCount()).toBe(0);
  });

  it("answers isRunning without the liveness probe when nothing holds the task", () => {
    const reviewProcessLive = vi.fn(() => false);
    const { reviews } = setup({ reviewProcessLive });
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(reviewProcessLive).not.toHaveBeenCalled();
  });

  it("does not throw out of a spawn that fails, so no unhandled rejection escapes", () => {
    const { internal } = setup({
      startReview: vi.fn(() => {
        throw new Error("spawn EACCES");
      }),
    });
    const run = { startedAt: Date.now(), cancelled: false, mode: "run" };
    expect(() =>
      internal.spawnDurable(
        TASK_ID,
        { name: "reviewer", cli: "opencode", model: "default" },
        "mission",
        "/tmp/worktree",
        run,
        "run",
      ),
    ).not.toThrow();
  });

  it("clears a cancelled registration even when the reviewer process is already gone", () => {
    const { reviews, internal, runner } = setup();
    internal.runs.set(TASK_ID, { startedAt: Date.now(), cancelled: false, mode: "run" });
    expect(reviews.isRunning(TASK_ID)).toBe(true);
    reviews.cancel(TASK_ID);
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(reviews.runningCount()).toBe(0);
    expect(runner.stop).toHaveBeenCalledWith(KEY);
  });

  it("keeps a completion fence through cancel until its own finalize releases it", async () => {
    const { reviews, internal } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(
      internal as unknown as { finalizeRun: () => Promise<void> },
      "finalizeRun",
    ).mockImplementation(async () => {
      await gate;
    });
    const completion = reviews.handleReviewDone(KEY, true, "run");
    reviews.cancel(TASK_ID);
    // Cancel does not drop a fence whose finalize is still writing the report:
    // a second review must not be admitted while that finalize runs (#1083).
    expect(reviews.isRunning(TASK_ID)).toBe(true);
    release();
    await completion;
    expect(reviews.isRunning(TASK_ID)).toBe(false);
  });

  it("does not let a cancelled preparation delete a newer run admitted after it", () => {
    const { reviews, internal } = setup();
    const runs = internal.runs;
    const cancelled = { startedAt: Date.now(), cancelled: false, mode: "run" as const };
    runs.set(TASK_ID, cancelled);
    reviews.cancel(TASK_ID);
    const admitted = { startedAt: Date.now(), cancelled: false, mode: "run" as const };
    runs.set(TASK_ID, admitted);
    (reviews as unknown as { dropRun: (id: string, run: unknown) => void }).dropRun(
      TASK_ID,
      cancelled,
    );
    expect(runs.get(TASK_ID)).toBe(admitted);
  });
});

describe("stale registration reaper (#1083)", () => {
  it("clears a registration with no live process once it outlives the review timeout", () => {
    const { reviews, internal } = setup();
    const stale = Date.now() - reviewTimeoutMs({} as RepoOSConfig) - 60_000;
    internal.runs.set(TASK_ID, { startedAt: stale, cancelled: false, mode: "run" });
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(internal.runs.has(TASK_ID)).toBe(false);
  });

  it("marks a reaped preparing run cancelled so it cannot spawn after being cleared", () => {
    const { reviews, internal } = setup();
    const stale = Date.now() - reviewTimeoutMs({} as RepoOSConfig) - 60_000;
    const preparing = { startedAt: stale, cancelled: false, mode: "run" as const };
    internal.runs.set(TASK_ID, preparing);
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(preparing.cancelled).toBe(true);
  });

  it("keeps a fresh registration with no process yet (still preparing)", () => {
    const { reviews, internal } = setup();
    internal.runs.set(TASK_ID, { startedAt: Date.now(), cancelled: false, mode: "run" });
    expect(reviews.isRunning(TASK_ID)).toBe(true);
  });

  it("never clears an old registration whose reviewer process is still alive", () => {
    const { reviews, internal } = setup({
      isRunning: (key: string) => key === KEY,
      reviewProcessLive: (key: string) => key === KEY,
      running: () =>
        [{ id: KEY, pid: 4242, startedAt: new Date(0).toISOString() }] as unknown as ReturnType<
          AgentRunner["running"]
        >,
    });
    const stale = Date.now() - reviewTimeoutMs({} as RepoOSConfig) - 60_000;
    internal.runs.set(TASK_ID, { startedAt: stale, cancelled: false, mode: "run" });
    expect(reviews.isRunning(TASK_ID)).toBe(true);
  });

  it("reaps a stale completion fence on the idle check", () => {
    const { reviews, internal } = setup();
    const completions = (internal as unknown as { completions: Map<string, Promise<void>> })
      .completions;
    const completionSince = (internal as unknown as { completionSince: Map<string, number> })
      .completionSince;
    completions.set(TASK_ID, new Promise<void>(() => {}));
    completionSince.set(TASK_ID, Date.now() - reviewTimeoutMs({} as RepoOSConfig) - 60_000);
    expect(reviews.runningCount()).toBe(0);
    expect(reviews.isRunning(TASK_ID)).toBe(false);
  });
});

describe("finalizing review whose reviewer has exited (#1083)", () => {
  it("does not count the exited reviewer as live, so the refusal says it is finalizing", async () => {
    const { reviews, internal } = setup({
      isRunning: (key: string) => key === KEY,
      reviewProcessLive: () => false,
    });
    internal.runs.set(TASK_ID, { startedAt: Date.now(), cancelled: false, mode: "run" });
    const gate = await reviews.canRun(task);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("reviewer exited, finalizing its report");
    expect(gate.reason).not.toContain("pid");
  });

  it("clears a finalizing runner entry once it outlives the review timeout", () => {
    // The fake runner holds one finalizing entry until it is abandoned.
    let held = true;
    const abandonFinalizing = vi.fn(() => {
      held = false;
      return true;
    });
    const { reviews, internal } = setup({
      isRunning: (key: string) => held && key === KEY,
      reviewProcessLive: () => false,
      abandonFinalizing,
    });
    const stale = Date.now() - reviewTimeoutMs({} as RepoOSConfig) - 60_000;
    internal.runs.set(TASK_ID, { startedAt: stale, cancelled: false, mode: "run" });
    expect(reviews.isRunning(TASK_ID)).toBe(false);
    expect(abandonFinalizing).toHaveBeenCalledWith(KEY);
  });

  it("keeps a finalizing runner entry that is still within the review timeout", () => {
    const abandonFinalizing = vi.fn(() => true);
    const { reviews } = setup({
      isRunning: (key: string) => key === KEY,
      reviewProcessLive: () => false,
      abandonFinalizing,
    });
    expect(reviews.isRunning(TASK_ID)).toBe(true);
    expect(abandonFinalizing).not.toHaveBeenCalled();
  });

  it("cancel drops the runner entry of a finalize whose child already exited", () => {
    const abandonFinalizing = vi.fn(() => true);
    const { reviews, internal } = setup({
      isRunning: (key: string) => key === KEY,
      reviewProcessLive: () => false,
      abandonFinalizing,
    });
    internal.runs.set(TASK_ID, { startedAt: Date.now(), cancelled: false, mode: "run" });
    reviews.cancel(TASK_ID);
    expect(abandonFinalizing).toHaveBeenCalledWith(KEY);
  });
});

describe("refusal names what is running (#1083)", () => {
  it("reports the live reviewer's pid and start time", async () => {
    const started = "2026-11-10T17:27:00.000Z";
    const { reviews, internal } = setup({
      isRunning: (key: string) => key === KEY,
      reviewProcessLive: (key: string) => key === KEY,
      running: () =>
        [{ id: KEY, pid: 4242, startedAt: started }] as unknown as ReturnType<
          AgentRunner["running"]
        >,
    });
    internal.runs.set(TASK_ID, {
      startedAt: Date.parse(started),
      cancelled: false,
      mode: "run",
    });
    const gate = await reviews.canRun(task);
    expect(gate).toEqual({
      ok: false,
      reason: `a review is already running for this task (pid 4242, since ${started})`,
    });
  });
});
