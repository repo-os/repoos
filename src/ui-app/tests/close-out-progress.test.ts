/**
 * 1276 — live progress for a close-out attempt.
 *
 * Covers the recorder that streams an attempt's step, host and heartbeat to its
 * own log and job record; the job record round-trip that carries those fields
 * and a retry's previous failure; the pipeline snapshot and the copy the card
 * and drawer show, including the stale-progress flag.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CLOSE_OUT_STEP,
  CloseOutProgressRecorder,
  PROGRESS_STALE_MS,
  progressIsStale,
  progressLogPathFor,
  progressWritable,
  stepForRemoteStage,
  stepForRemoteRun,
  stepForSlotState,
  type CloseOutProgressPatch,
} from "../../server/close-out-progress.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { buildIntegrationSnapshot } from "../../server/integration-status.js";
import {
  ActiveRemoteRunRegistry,
  type ActiveRemoteRunInfo,
  type RemoteSlotState,
} from "../../server/remote-validation.js";
import {
  integrationActiveCopy,
  integrationAttemptContext,
  integrationBarActiveTitle,
  integrationPipelineStalled,
  integrationRetryNote,
} from "../src/lib/integration-pipeline-ui";
import type { IntegrationPipelineSnapshot } from "../src/types";

const T0 = Date.parse("2026-11-20T08:00:00.000Z");

function remoteRun(over: Partial<ActiveRemoteRunInfo> = {}): ActiveRemoteRunInfo {
  return {
    taskId: "1276",
    host: "10.0.0.7",
    phase: "close-out",
    scope: "full",
    startedAt: new Date(T0).toISOString(),
    stage: "run",
    uploadBytes: null,
    uploadSeconds: null,
    ...over,
  } as ActiveRemoteRunInfo;
}

describe("stepForRemoteStage (#1276)", () => {
  it.each([
    ["queue", CLOSE_OUT_STEP.queuedForHost],
    ["lock", CLOSE_OUT_STEP.queuedForHost],
    ["bundle", CLOSE_OUT_STEP.bundling],
    ["upload", CLOSE_OUT_STEP.bundling],
    // `run` is the runner's combined build-and-test command until its first
    // test marker: the step is the remote validation, not "running tests" (#1276 review).
    ["run", CLOSE_OUT_STEP.remote],
    ["install", CLOSE_OUT_STEP.runningTests],
    ["test", CLOSE_OUT_STEP.runningTests],
    ["tests", CLOSE_OUT_STEP.runningTests],
    ["build", CLOSE_OUT_STEP.building],
    ["something-new", null],
    [null, null],
  ])("maps stage %s to %s", (stage, step) => {
    expect(stepForRemoteStage(stage)).toBe(step);
  });
});

describe("remote test progress (#1276)", () => {
  it("includes done/total in the active tests step", () => {
    expect(
      stepForRemoteRun(remoteRun({ stage: "tests", testProgress: { done: 27, total: 84 } })),
    ).toBe("running tests (27/84)");
  });
});

describe("progressIsStale and progressLogPathFor (#1276)", () => {
  it("names one log per attempt, apart from the per-check logs", () => {
    expect(progressLogPathFor("1276", 2)).toBe(
      join(".repoos", "logs", "integration", "1276-attempt-2.log"),
    );
  });

  it("flags a timestamp older than the stale window and not a fresh one", () => {
    const last = new Date(T0).toISOString();
    expect(progressIsStale(last, T0 + PROGRESS_STALE_MS - 1)).toBe(false);
    expect(progressIsStale(last, T0 + PROGRESS_STALE_MS)).toBe(true);
  });

  it("does not flag a missing or unparsable timestamp", () => {
    expect(progressIsStale(undefined, T0 + 10 * PROGRESS_STALE_MS)).toBe(false);
    expect(progressIsStale(null, T0 + 10 * PROGRESS_STALE_MS)).toBe(false);
    expect(progressIsStale("not a date", T0 + 10 * PROGRESS_STALE_MS)).toBe(false);
  });
});

describe("CloseOutProgressRecorder (#1276)", () => {
  let root: string;
  let clock: number;
  let writes: CloseOutProgressPatch[];
  let run: ActiveRemoteRunInfo | undefined;

  function recorder(over: { heartbeatMs?: number } = {}): CloseOutProgressRecorder {
    return new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 2,
      persist: (patch) => {
        writes.push(patch);
      },
      remoteRun: () => run,
      now: () => clock,
      ...over,
    });
  }

  function logLines(): string[] {
    const path = join(root, progressLogPathFor("1276", 2));
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8").trimEnd().split("\n");
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-progress-"));
    clock = T0;
    writes = [];
    run = undefined;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("opens the attempt's log and records the start and the log path", () => {
    const rec = recorder();
    rec.start();
    rec.stop();
    expect(logLines()[0]).toContain("attempt 2 started");
    expect(writes[0]).toMatchObject({
      progressLogPath: progressLogPathFor("1276", 2),
      lastProgressAt: new Date(T0).toISOString(),
    });
  });

  it("writes the step and host once per change, not on every poll", () => {
    const rec = recorder({ heartbeatMs: 60_000 });
    rec.start();
    rec.setStep(CLOSE_OUT_STEP.syncing);
    rec.setStep(CLOSE_OUT_STEP.syncing);
    rec.setStep(CLOSE_OUT_STEP.checks, "local");
    rec.stop();
    const stepWrites = writes.filter((w) => w.step !== undefined);
    expect(stepWrites.map((w) => [w.step, w.host])).toEqual([
      [CLOSE_OUT_STEP.syncing, "local"],
      [CLOSE_OUT_STEP.checks, "local"],
    ]);
    expect(logLines().some((l) => l.includes(`step: ${CLOSE_OUT_STEP.checks} · host: local`))).toBe(
      true,
    );
  });

  it("follows a live remote run's host and stage", () => {
    const rec = recorder();
    rec.start();
    run = remoteRun({ stage: "bundle", host: "10.0.0.7" });
    rec.tick();
    expect(writes.at(-1)).toMatchObject({ step: CLOSE_OUT_STEP.bundling, host: "10.0.0.7" });
    run = remoteRun({ stage: "queue", host: "10.0.0.9" });
    rec.tick();
    expect(writes.at(-1)).toMatchObject({
      step: CLOSE_OUT_STEP.queuedForHost,
      host: "10.0.0.9",
    });
    rec.stop();
  });

  it("falls back to the remote label for a stage it does not recognise", () => {
    const rec = recorder();
    rec.start();
    run = remoteRun({ stage: "mystery", host: "10.0.0.7" });
    rec.tick();
    expect(writes.at(-1)).toMatchObject({ step: CLOSE_OUT_STEP.remote, host: "10.0.0.7" });
    rec.stop();
  });

  it("writes a heartbeat at least every 30 seconds while active", () => {
    const rec = recorder();
    rec.start();
    // Poll every 5 seconds for ten minutes with no step change: the log must
    // still move at least every 30 seconds.
    for (let i = 0; i < 120; i++) {
      clock += 5_000;
      rec.tick();
    }
    rec.stop();
    const stamps = logLines()
      .filter((l) => !l.includes("ended"))
      .map((l) => Date.parse(l.slice(0, 24)));
    expect(stamps.length).toBeGreaterThan(20);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] - stamps[i - 1]).toBeLessThanOrEqual(30_000);
    }
  });

  it("does not write a heartbeat before the interval has passed", () => {
    const rec = recorder();
    rec.start();
    clock += 5_000;
    rec.tick();
    rec.stop();
    // Only the start line and the end line: no heartbeat yet.
    expect(logLines()).toHaveLength(2);
  });

  it("stops cleanly: the end line names the outcome and nothing is persisted after", () => {
    const rec = recorder();
    rec.start();
    const before = writes.length;
    rec.stop("merge conflict in src/a.ts\nmore detail");
    rec.setStep(CLOSE_OUT_STEP.publishing);
    clock += 60_000;
    rec.tick();
    expect(writes).toHaveLength(before);
    const last = logLines().at(-1)!;
    expect(last).toContain("attempt 2 ended · merge conflict in src/a.ts");
    expect(last).not.toContain("more detail");
  });

  it("never throws into the close-out when persisting or polling fails", () => {
    const rec = new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 2,
      persist: () => {
        throw new Error("disk full");
      },
      remoteRun: () => {
        throw new Error("pool gone");
      },
      now: () => clock,
    });
    expect(() => {
      rec.start();
      rec.setStep(CLOSE_OUT_STEP.syncing);
      rec.tick();
      rec.stop("done");
    }).not.toThrow();
    expect(logLines().at(-1)).toContain("ended");
  });

  it("does not advance the persisted heartbeat when the job-record write fails", () => {
    let fail = false;
    const rec = new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 2,
      now: () => clock,
      persist: (patch) => {
        if (fail) throw new Error("disk full");
        writes.push(patch);
      },
    });
    rec.start();
    const first = writes.at(-1)?.lastProgressAt;
    fail = true;
    clock += 20_000;
    rec.tick();
    expect(writes.at(-1)?.lastProgressAt).toBe(first);
    expect(logLines().at(-1)).toContain("heartbeat");
    rec.stop();
  });

  it("creates the log directory on demand", () => {
    expect(existsSync(join(root, ".repoos"))).toBe(false);
    const rec = recorder();
    rec.start();
    rec.stop();
    expect(existsSync(join(root, progressLogPathFor("1276", 2)))).toBe(true);
  });
});

describe("job record and retries (#1276)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-progress-job-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips the live progress fields through the job record", () => {
    const coordinator = createJobCoordinator(root);
    const job = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any);
    expect(job).not.toBeNull();
    const attempt = job!.attempt!;
    coordinator.updateJob("1276", { phase: "validating" }, attempt);
    coordinator.updateJob(
      "1276",
      {
        step: CLOSE_OUT_STEP.runningTests,
        host: "10.0.0.7",
        lastProgressAt: "2026-11-20T08:01:00.000Z",
        progressLogPath: progressLogPathFor("1276", attempt),
      },
      attempt,
    );
    const read = coordinator.getJob("1276")!;
    expect(read).toMatchObject({
      step: CLOSE_OUT_STEP.runningTests,
      host: "10.0.0.7",
      lastProgressAt: "2026-11-20T08:01:00.000Z",
      progressLogPath: progressLogPathFor("1276", attempt),
    });
  });

  it("refuses a progress write from a superseded attempt", () => {
    const coordinator = createJobCoordinator(root);
    const first = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    coordinator.updateJob("1276", { phase: "failed", reason: "timed out" }, first.attempt);
    const second = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    const stale = coordinator.updateJob(
      "1276",
      { step: "stale write", host: "10.0.0.9" },
      first.attempt,
    );
    expect(stale).toBeNull();
    expect(coordinator.getJob("1276")!.step).toBeUndefined();
    expect(second.attempt).toBe(first.attempt! + 1);
  });

  it("shows a retry as a new attempt that carries the failure's reason", () => {
    const coordinator = createJobCoordinator(root);
    const first = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    coordinator.updateJob(
      "1276",
      {
        phase: "failed",
        reason: "close-out timed out after 30m",
        failedAt: "2026-11-20T08:30:00.000Z",
      },
      first.attempt,
    );
    const retry = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    expect(retry.attempt).toBe(first.attempt! + 1);
    expect(retry.previousFailure).toEqual({
      attempt: first.attempt,
      reason: "close-out timed out after 30m",
      failedAt: "2026-11-20T08:30:00.000Z",
    });
    expect(retry.step).toBeUndefined();
    expect(coordinator.getJob("1276")!.previousFailure?.reason).toBe(
      "close-out timed out after 30m",
    );
  });

  it("does not record a previous failure when a fresh enqueue follows a cancel", () => {
    const coordinator = createJobCoordinator(root);
    coordinator.enqueue({ id: "1276", branch: "feat/x" } as any);
    coordinator.requestCancel("1276");
    coordinator.removeJob("1276");
    const again = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    expect(again.previousFailure).toBeUndefined();
  });
});

describe("pipeline snapshot and card copy (#1276)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-progress-snap-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function activeJob(lastProgressAt?: string) {
    const coordinator = createJobCoordinator(root);
    const job = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    coordinator.updateJob(
      "1276",
      {
        phase: "validating",
        startedAt: new Date(T0).toISOString(),
        step: CLOSE_OUT_STEP.runningTests,
        host: "10.0.0.7",
        ...(lastProgressAt ? { lastProgressAt } : {}),
      },
      job.attempt,
    );
    return coordinator;
  }

  it("reports the attempt, host, step and whether progress is stale", () => {
    const coordinator = activeJob(new Date(T0).toISOString());
    const fresh = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      {},
      {},
      new Date(T0 + 10_000).toISOString(),
    );
    expect(fresh.active).toMatchObject({
      taskId: "1276",
      attempt: 1,
      step: CLOSE_OUT_STEP.runningTests,
      host: "10.0.0.7",
      progressStale: false,
    });

    const stale = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      {},
      {},
      new Date(T0 + PROGRESS_STALE_MS + 1_000).toISOString(),
    );
    expect(stale.active?.progressStale).toBe(true);
  });

  it("does not flag a job that never wrote progress", () => {
    const coordinator = activeJob();
    const snap = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      {},
      {},
      new Date(T0 + 10 * PROGRESS_STALE_MS).toISOString(),
    );
    expect(snap.active?.progressStale).toBe(false);
  });

  it("names the attempt and host on the card, and flags a stale attempt as possibly stuck", () => {
    const base = {
      taskId: "1276",
      stage: "check" as const,
      failed: false,
      startedAt: new Date(T0).toISOString(),
      lastProgressAt: new Date(T0).toISOString(),
      attempt: 2,
      step: CLOSE_OUT_STEP.runningTests,
      host: "10.0.0.7",
      progressStale: false,
    };
    const snap = (active: Partial<NonNullable<IntegrationPipelineSnapshot["active"]>>) =>
      ({
        empty: false,
        active: { ...base, ...active },
        queue: [],
        at: new Date(T0).toISOString(),
      }) as IntegrationPipelineSnapshot;

    const live = integrationActiveCopy(snap({}), T0 + 5_000);
    expect(live.label).toBe(
      `integrating · ${CLOSE_OUT_STEP.runningTests} · on 10.0.0.7 · attempt 2`,
    );
    expect(live.stalled).toBe(false);

    const stale = integrationActiveCopy(snap({ progressStale: true }), T0 + 5_000);
    expect(stale.stalled).toBe(true);
    expect(stale.label).toContain("stalled · running tests · no progress");
    expect(stale.label).toContain("on 10.0.0.7 · attempt 2");
    expect(integrationPipelineStalled(snap({ progressStale: true }), T0 + 5_000)).toBe(true);
  });

  it("the status bar title names the step, host and attempt, with the elapsed time", () => {
    const snap = {
      empty: false,
      active: {
        taskId: "1276",
        stage: "check" as const,
        failed: false,
        startedAt: new Date(T0).toISOString(),
        lastProgressAt: new Date(T0).toISOString(),
        attempt: 2,
        step: CLOSE_OUT_STEP.checks,
        host: "local",
      },
      queue: [],
      at: new Date(T0).toISOString(),
    } as IntegrationPipelineSnapshot;
    expect(integrationBarActiveTitle(snap, T0 + 90_000)).toBe(
      `integrating · ${CLOSE_OUT_STEP.checks} · local · attempt 2 1m 30s`,
    );
  });

  it("keeps the existing label for an attempt with no step, host or retry", () => {
    const snap = {
      empty: false,
      active: {
        taskId: "1276",
        stage: null,
        failed: false,
        startedAt: new Date(T0).toISOString(),
        lastProgressAt: new Date(T0).toISOString(),
      },
      queue: [],
      at: new Date(T0).toISOString(),
    } as IntegrationPipelineSnapshot;
    expect(integrationAttemptContext(snap.active!)).toBe("");
    expect(integrationActiveCopy(snap, T0 + 1_000).label).toMatch(/^integrating · /);
    expect(integrationActiveCopy(snap, T0 + 1_000).label).not.toContain("attempt");
  });
});

describe("terminal records and observers (#1276 review)", () => {
  it.each([
    ["queued", true],
    ["syncing", true],
    ["validating", true],
    ["publishing", true],
    ["cleanup", true],
    ["done", false],
    ["failed", false],
    [undefined, false],
    [null, false],
  ])("progressWritable(%s) is %s", (phase, writable) => {
    expect(progressWritable(phase as string | undefined)).toBe(writable);
  });

  it("notifies the observer on each persisted write, but not on a repeated step", () => {
    let root = mkdtempSync(join(tmpdir(), "repoos-progress-onchange-"));
    try {
      let clock = T0;
      let changes = 0;
      const rec = new CloseOutProgressRecorder({
        root,
        taskId: "1276",
        attempt: 2,
        persist: () => {},
        now: () => clock,
        onChange: () => changes++,
      });
      // The start write, then the first step: each one is persisted and seen.
      rec.start();
      expect(changes).toBe(1);
      rec.setStep(CLOSE_OUT_STEP.syncing);
      rec.setStep(CLOSE_OUT_STEP.syncing);
      expect(changes).toBe(2);
      rec.setStep(CLOSE_OUT_STEP.checks, "local");
      expect(changes).toBe(3);
      // A heartbeat is a persisted write too, so the observer sees a live
      // `lastProgressAt` during a quiet stretch (#1276 review).
      clock += 20_000;
      rec.tick();
      expect(changes).toBe(4);
      rec.stop();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an observer that throws does not disturb the recorder", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-progress-throw-"));
    try {
      const rec = new CloseOutProgressRecorder({
        root,
        taskId: "1276",
        attempt: 2,
        persist: () => {},
        onChange: () => {
          throw new Error("sse down");
        },
      });
      rec.start();
      expect(() => rec.setStep(CLOSE_OUT_STEP.syncing)).not.toThrow();
      rec.stop();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("names the failure a retry replaces, and only on a retry", () => {
    const base = {
      taskId: "1276",
      stage: null,
      failed: false,
      startedAt: new Date(T0).toISOString(),
      lastProgressAt: new Date(T0).toISOString(),
    };
    const retry = {
      ...base,
      attempt: 2,
      previousFailure: {
        attempt: 1,
        reason: "close-out timed out after 30m\nFull check output: x.log",
      },
    };
    expect(integrationRetryNote(retry)).toBe(
      "Attempt 2 — attempt 1 failed: close-out timed out after 30m",
    );
    expect(integrationRetryNote({ ...base, attempt: 1 })).toBeNull();
    expect(integrationRetryNote({ ...base, attempt: 2, previousFailure: null })).toBeNull();
  });

  it("puts the retry reason in the card and drawer tooltip", () => {
    const snap = {
      empty: false,
      active: {
        taskId: "1276",
        stage: null,
        failed: false,
        startedAt: new Date(T0).toISOString(),
        lastProgressAt: new Date(T0).toISOString(),
        attempt: 2,
        step: CLOSE_OUT_STEP.syncing,
        previousFailure: { attempt: 1, reason: "merge conflict in src/a.ts" },
      },
      queue: [],
      at: new Date(T0).toISOString(),
    } as IntegrationPipelineSnapshot;
    const copy = integrationActiveCopy(snap, T0 + 1_000);
    expect(copy.title).toContain("Attempt 2 — attempt 1 failed: merge conflict in src/a.ts");
  });
});

describe("retries, slot waits and write failures (#1276 review round 2)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-progress-retry-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    [{ state: "queued" } as RemoteSlotState, CLOSE_OUT_STEP.queuedForHost, null],
    [{ state: "acquired", host: "10.0.0.7" } as RemoteSlotState, CLOSE_OUT_STEP.remote, "10.0.0.7"],
  ])("shows slot state %j as step %s on host %s", (slot, step, host) => {
    expect(stepForSlotState(slot)).toEqual({ step, host });
  });

  it("moves a retry onto the new attempt's log, with the reason on both logs", () => {
    let clock = T0;
    const writes: Array<{ patch: CloseOutProgressPatch; attempt: number }> = [];
    const rec = new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 1,
      persist: (patch, attempt) => {
        writes.push({ patch, attempt });
      },
      now: () => clock,
    });
    rec.start();
    rec.setStep(CLOSE_OUT_STEP.runningTests, "10.0.0.7");
    clock += 1_000;
    rec.beginAttempt(2, "merge conflict in src/a.ts\nmore detail");
    rec.setStep(CLOSE_OUT_STEP.syncing);
    rec.stop("published");

    const oldLog = readFileSync(join(root, progressLogPathFor("1276", 1)), "utf8");
    const newLog = readFileSync(join(root, progressLogPathFor("1276", 2)), "utf8");
    expect(oldLog).toContain("attempt 1 ended · retried as attempt 2: merge conflict in src/a.ts");
    expect(oldLog).not.toContain("step: syncing");
    expect(newLog).toContain("attempt 2 started · retry of attempt 1: merge conflict in src/a.ts");
    expect(newLog).toContain("step: syncing");
    expect(newLog).not.toContain("more detail");

    expect(writes.find((w) => w.patch.step === CLOSE_OUT_STEP.runningTests)?.attempt).toBe(1);
    const started = writes.find((w) => w.patch.progressLogPath === progressLogPathFor("1276", 2));
    expect(started?.attempt).toBe(2);
    expect(writes.find((w) => w.patch.step === CLOSE_OUT_STEP.syncing)?.attempt).toBe(2);
  });

  it("keeps a step whose job-record write failed and sends it with the next write", () => {
    let clock = T0;
    let failing = true;
    const sent: CloseOutProgressPatch[] = [];
    const rec = new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 1,
      persist: (patch) => {
        if (failing) throw new Error("disk busy");
        sent.push(patch);
      },
      now: () => clock,
      onWriteError: () => {},
    });
    rec.start();
    rec.setStep(CLOSE_OUT_STEP.bundling, "10.0.0.7");
    failing = false;
    clock += 5_000;
    rec.tick();
    rec.stop();
    expect(sent.at(-1)).toMatchObject({
      step: CLOSE_OUT_STEP.bundling,
      host: "10.0.0.7",
      lastProgressAt: new Date(clock).toISOString(),
    });
  });

  it("does not stamp lastProgressAt when the log line did not land", () => {
    let clock = T0;
    const sent: CloseOutProgressPatch[] = [];
    // A directory where the log file goes makes every append fail.
    mkdirSync(join(root, progressLogPathFor("1276", 1)), { recursive: true });
    const rec = new CloseOutProgressRecorder({
      root,
      taskId: "1276",
      attempt: 1,
      persist: (patch) => {
        sent.push(patch);
      },
      now: () => clock,
      onWriteError: () => {},
    });
    rec.start();
    rec.setStep(CLOSE_OUT_STEP.syncing);
    rec.stop();
    expect(sent.length).toBeGreaterThan(0);
    for (const patch of sent) expect(patch).not.toHaveProperty("lastProgressAt");
    expect(sent[0]?.progressLogPath).toBe(progressLogPathFor("1276", 1));
  });

  it("moves a run from the combined run stage to the test stage on its first test marker", () => {
    const registry = new ActiveRemoteRunRegistry();
    registry.set(remoteRun({ stage: "run" }), "1276");
    expect(stepForRemoteRun(registry.get("1276")!)).toBe(CLOSE_OUT_STEP.remote);

    registry.setTestProgress("1276", 3, 84);
    const run = registry.get("1276")!;
    expect(run).toMatchObject({ stage: "test", testProgress: { done: 3, total: 84 } });
    expect(stepForRemoteRun(run)).toContain("(3/84)");
  });

  it("starts the next attempt in a running close-out with its reason and a fresh start", () => {
    const coordinator = createJobCoordinator(root);
    const job = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    const oldStart = new Date(T0).toISOString();
    coordinator.updateJob(
      "1276",
      {
        phase: "validating",
        startedAt: oldStart,
        step: CLOSE_OUT_STEP.runningTests,
        host: "10.0.0.7",
        lastProgressAt: oldStart,
      },
      job.attempt,
    );
    const next = coordinator.advanceAttempt("1276", job.attempt!, "remote tests failed");
    expect(next).toMatchObject({
      attempt: job.attempt! + 1,
      previousFailure: { attempt: job.attempt, reason: "remote tests failed" },
      step: undefined,
      host: undefined,
      lastProgressAt: undefined,
    });
    expect(next!.startedAt).not.toBe(oldStart);
    expect(coordinator.getJob("1276")!.attempt).toBe(job.attempt! + 1);
    // The superseded attempt can no longer advance or write (#0736).
    expect(coordinator.advanceAttempt("1276", job.attempt!, "again")).toBeNull();
    expect(coordinator.updateJob("1276", { step: "stale" }, job.attempt)).toBeNull();
  });

  it("never starts a retry attempt on a cancelled record (Stop MTD keeps ownership, #0736)", () => {
    const coordinator = createJobCoordinator(root);
    const job = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    coordinator.updateJob(
      "1276",
      { phase: "validating", startedAt: new Date(T0).toISOString() },
      job.attempt,
    );
    coordinator.requestCancel("1276");
    expect(coordinator.advanceAttempt("1276", job.attempt!, "validation failed")).toBeNull();
    expect(coordinator.getJob("1276")!.attempt).toBe(job.attempt);
    expect(coordinator.getJob("1276")!.previousFailure).toBeUndefined();
  });

  it("does not let a fresh stage event mask a recorder that stopped writing", () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    const coordinator = createJobCoordinator(root);
    const job = coordinator.enqueue({ id: "1276", branch: "feat/x" } as any)!;
    coordinator.updateJob(
      "1276",
      {
        phase: "validating",
        startedAt: iso(T0),
        step: CLOSE_OUT_STEP.remote,
        host: "10.0.0.7",
        lastProgressAt: iso(T0),
      },
      job.attempt,
    );
    const now = T0 + PROGRESS_STALE_MS + 1_000;
    const snap = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      { "1276": iso(now - 1_000) },
      {},
      iso(now),
    );
    expect(snap.active).toMatchObject({ progressStale: true, lastProgressAt: iso(now - 1_000) });
  });

  it("the stalled label names the step it stopped on and the retry reason", () => {
    const snap = {
      empty: false,
      active: {
        taskId: "1276",
        stage: null,
        failed: false,
        startedAt: new Date(T0).toISOString(),
        lastProgressAt: new Date(T0).toISOString(),
        attempt: 2,
        step: CLOSE_OUT_STEP.remote,
        host: "10.0.0.7",
        progressStale: true,
        previousFailure: { attempt: 1, reason: "remote tests failed" },
      },
      queue: [],
      at: new Date(T0).toISOString(),
    } as IntegrationPipelineSnapshot;
    const copy = integrationActiveCopy(snap, T0 + 1_000);
    expect(copy.stalled).toBe(true);
    expect(copy.label).toContain("stalled · remote validation · no progress");
    expect(copy.label).toContain("Attempt 2 — attempt 1 failed: remote tests failed");
    expect(copy.label).toContain("on 10.0.0.7 · attempt 2");
  });
});
