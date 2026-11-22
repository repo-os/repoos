import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "../../core/types.js";
import {
  createJobCoordinator,
  hasPublishTurn,
  pendingCloseOutJobs,
  type JobCoordinator,
} from "../integration-job.js";
import { CloseOutScheduler } from "../close-out-scheduler.js";

interface Gate {
  promise: Promise<void>;
  resolve: () => void;
}

function gate(): Gate {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Let queued promise callbacks and the scheduler's `finally` hooks run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0));
}

/**
 * A stand-in for the orchestrator's run: it validates (blocking until the test
 * releases it), then publishes only when it holds the publish turn, exactly as
 * `processJob` gates the publish step. The test decides when validation ends and
 * whether it fails, so overlap, ordering and failure isolation are observable.
 */
function fakeRuns(coordinator: JobCoordinator) {
  const validations = new Map<string, Gate>();
  const failing = new Set<string>();
  const started: string[] = [];
  const parked: string[] = [];
  const published: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  async function run(taskId: string): Promise<void> {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (coordinator.getJob(taskId)?.phase !== "publishing") {
        started.push(taskId);
        const g = gate();
        validations.set(taskId, g);
        await g.promise;
        if (failing.has(taskId)) {
          coordinator.updateJob(taskId, { phase: "failed", reason: "validation failed" });
          return;
        }
        coordinator.updateJob(taskId, { phase: "publishing" });
      }
      if (!hasPublishTurn(coordinator.allJobs(), taskId)) {
        parked.push(taskId);
        return;
      }
      published.push(taskId);
      coordinator.updateJob(taskId, { phase: "done" });
    } finally {
      inFlight--;
    }
  }

  return {
    run,
    finishValidation: (taskId: string) => validations.get(taskId)?.resolve(),
    fail: (taskId: string) => failing.add(taskId),
    started,
    parked,
    published,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

describe("CloseOutScheduler (#1275)", () => {
  let root: string;
  let coordinator: JobCoordinator;

  const task = (id: string): Task => ({ id, branch: `feat/${id}` }) as unknown as Task;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-scheduler-"));
    coordinator = createJobCoordinator(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function scheduler(
    runs: ReturnType<typeof fakeRuns>,
    options: { limit?: number; pressureHeld?: boolean } = {},
  ): CloseOutScheduler & { setPressure(held: boolean): void } {
    // One scheduler for the whole test, so its running set is the real one; the
    // pressure flag is read live, the way the server reads the guard each pump.
    const state = { limit: options.limit ?? 2, pressureHeld: options.pressureHeld ?? false };
    const sched = new CloseOutScheduler({
      jobs: () => coordinator.allJobs(),
      limit: () => state.limit,
      pressureHeld: () => state.pressureHeld,
      run: runs.run,
      holdRecheckMs: 60_000,
    });
    return Object.assign(sched, {
      setPressure: (held: boolean) => {
        state.pressureHeld = held;
      },
    });
  }

  it("overlaps validations up to the limit, starting in queue order", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 2 });

    sched.pump();
    await settle();

    expect(runs.started).toEqual(["0001", "0002"]);
    expect([...sched.running]).toEqual(["0001", "0002"]);
  });

  it("reuses a freed slot for the next queued job and never exceeds the limit", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 2 });
    sched.pump();
    await settle();

    runs.finishValidation("0001");
    await settle();

    expect(runs.started).toEqual(["0001", "0002", "0003"]);
    expect(runs.maxInFlight).toBeLessThanOrEqual(2);
  });

  it("publishes in queue order: a job validated first parks until the head publishes", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 2 });
    sched.pump();
    await settle();

    // 0002 finishes validating before the head does.
    runs.finishValidation("0002");
    await settle();
    expect(runs.published).toEqual([]);
    expect(runs.parked).toContain("0002");

    runs.finishValidation("0001");
    await settle();
    expect(runs.published).toEqual(["0001", "0002"]);
    expect(pendingCloseOutJobs(coordinator.allJobs())).toEqual([]);
  });

  it("isolates a failure: a failed head does not block the job behind it", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 2 });
    sched.pump();
    await settle();

    runs.finishValidation("0002");
    await settle();
    runs.fail("0001");
    runs.finishValidation("0001");
    await settle();

    expect(coordinator.getJob("0001")?.phase).toBe("failed");
    expect(runs.published).toEqual(["0002"]);
    expect(runs.started).toContain("0003");
  });

  it("a pressure hold stops extra concurrency but never the first run", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 3, pressureHeld: true });

    sched.pump();
    await settle();
    expect(runs.started).toEqual(["0001"]);

    // Pressure clears: the next pump starts the rest.
    sched.setPressure(false);
    sched.pump();
    await settle();
    expect(runs.started).toEqual(["0001", "0002", "0003"]);
  });

  it("a head that is ready to publish is not held behind a slow validation", async () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    const runs = fakeRuns(coordinator);
    const sched = scheduler(runs, { limit: 2 });
    sched.pump();
    await settle();

    // 0002 (slow, still validating) fills the second slot; the head 0001 finishes.
    runs.finishValidation("0001");
    await settle();

    expect(runs.published).toEqual(["0001"]);
    expect([...sched.running]).toContain("0002");
  });
});
