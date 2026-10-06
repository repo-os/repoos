/**
 * #0720 — flag a check/close-out/upload run that exceeds 1.5x its own median.
 */
import { describe, expect, it } from "vitest";
import {
  effectiveElapsedMs,
  evaluateSlowness,
  median,
  persistentSlowNotices,
  rollingMedianForKind,
  runKindKey,
  type CheckRunSample,
  type RunningRun,
} from "../../core/check-slowness.js";

const HISTORY_KIND = { phase: "pre-review" as const, remote: true, scope: "full" };

/** A passing history row with a fixed duration. */
function pass(durationMs: number, over: Partial<CheckRunSample> = {}): CheckRunSample {
  return { ...HISTORY_KIND, outcome: "pass", durationMs, ...over };
}

/** A running run; elapsed defaults to the median so callers set it explicitly. */
function running(elapsedMs: number, over: Partial<RunningRun> = {}): RunningRun {
  return {
    id: "r1",
    taskId: "0042",
    phase: "pre-review",
    remote: true,
    scope: "full",
    machine: "bee",
    startedAt: "2026-10-06T10:00:00.000Z",
    elapsedMs,
    stage: null,
    ...over,
  };
}

/** Five passing samples with a 100 s median (100,100,100,100,100000 is 100s). */
function fiveAt(ms: number): CheckRunSample[] {
  return [pass(ms), pass(ms), pass(ms), pass(ms), pass(ms)];
}

describe("median", () => {
  it("returns the middle value and null for an empty list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("runKindKey", () => {
  it("separates phase, locality and scope", () => {
    expect(runKindKey({ phase: "close-out", remote: false, scope: "full" })).toBe(
      "close-out|local|full",
    );
    expect(runKindKey({ phase: "pre-review", remote: true, scope: "changed:main" })).toBe(
      "pre-review|remote|changed:main",
    );
  });
});

describe("rollingMedianForKind", () => {
  it("uses only PASSING runs of the same phase/remote/scope", () => {
    const history: CheckRunSample[] = [
      pass(300_000),
      pass(300_000),
      pass(300_000),
      pass(300_000),
      pass(300_000),
      // A failing run at 900 s must not move the median.
      pass(900_000, { outcome: "fail" }),
      // A different scope must not count toward this kind.
      pass(60_000, { scope: "changed:main" }),
      // A local run must not count toward the remote kind.
      pass(60_000, { remote: false }),
    ];
    const stats = rollingMedianForKind(history, "pre-review|remote|full");
    expect(stats).not.toBeNull();
    expect(stats!.medianMs).toBe(300_000);
    expect(stats!.sampleCount).toBe(5);
  });

  it("returns null below the minimum sample count", () => {
    const history = [pass(300_000), pass(300_000), pass(300_000), pass(300_000)];
    expect(rollingMedianForKind(history, "pre-review|remote|full")).toBeNull();
  });
});

describe("evaluateSlowness", () => {
  it("raises nothing at 1.4x the median", () => {
    const flags = evaluateSlowness({
      running: [running(140_000)],
      history: fiveAt(100_000),
      multiplier: 1.5,
    });
    expect(flags).toHaveLength(0);
  });

  it("raises exactly one item at 1.6x and clears once the run ends", () => {
    const history = fiveAt(100_000);
    const flags = evaluateSlowness({
      running: [running(160_000)],
      history,
      multiplier: 1.5,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].ratio).toBeCloseTo(1.6);
    expect(flags[0].id).toBe("slowRun:r1");

    // The run finishing removes it from `running` — nothing is raised.
    const cleared = evaluateSlowness({ running: [], history, multiplier: 1.5 });
    expect(cleared).toHaveLength(0);
  });

  it("raises nothing with fewer than 5 samples", () => {
    const history = [pass(100_000), pass(100_000), pass(100_000), pass(100_000)];
    const flags = evaluateSlowness({
      running: [running(1_000_000)],
      history,
      multiplier: 1.5,
    });
    expect(flags).toHaveLength(0);
  });

  it("computes medians per phase/remote/scope independently", () => {
    const history: CheckRunSample[] = [
      // close-out local full median = 500 s — this remote pre-review run is
      // compared against its OWN kind (100 s), not the close-out numbers.
      ...fiveAt(100_000),
      ...[500_000, 500_000, 500_000, 500_000, 500_000].map((d) =>
        pass(d, { phase: "close-out", remote: false, scope: "full" }),
      ),
    ];
    const flags = evaluateSlowness({
      running: [running(160_000)],
      history,
      multiplier: 1.5,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].medianMs).toBe(100_000);
  });

  it("names the upload phase and reports bundle size when known", () => {
    const flags = evaluateSlowness({
      running: [
        running(600_000, {
          stage: "upload",
          uploadBytes: 3 * 1024 * 1024,
          uploadSeconds: 540,
        }),
      ],
      history: fiveAt(100_000),
      multiplier: 1.5,
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].likelyCause).toContain("bundle upload");
    expect(flags[0].likelyCause).toContain("MB");
    expect(flags[0].likelyCause).toContain("540s");
  });
});

describe("persistentSlowNotices", () => {
  it("appears when 3 of the last 10 runs of a kind were slow", () => {
    const history: CheckRunSample[] = [
      // 4 fast runs set a ~100 s median.
      ...fiveAt(100_000),
      // 3 slow runs (>150 s).
      pass(400_000),
      pass(400_000),
      pass(400_000),
    ];
    const notices = persistentSlowNotices({ history, multiplier: 1.5 });
    expect(notices).toHaveLength(1);
    expect(notices[0].slowCount).toBe(3);
    expect(notices[0].id).toBe("slowKind:pre-review|remote|full");
  });

  it("stays quiet at 2 of 10", () => {
    const history: CheckRunSample[] = [
      ...fiveAt(100_000),
      pass(400_000),
      pass(400_000),
    ];
    expect(persistentSlowNotices({ history, multiplier: 1.5 })).toHaveLength(0);
  });
});

describe("effectiveElapsedMs", () => {
  it("credits the full wall elapsed when there was no sleep gap", () => {
    const start = 1_000_000;
    const now = start + 200_000;
    expect(effectiveElapsedMs(start, now, now - 5_000, 5_000)).toBe(200_000);
  });

  it("excludes a laptop-sleep gap by crediting one tick", () => {
    // The run started, the watchdog ticked at +5s, then the machine slept for
    // an hour and woke: wall elapsed is ~1h but only ~10s should be credited.
    const start = 1_000_000;
    const lastAwake = start + 5_000;
    const wallNow = start + 3_600_000;
    const credited = effectiveElapsedMs(start, wallNow, lastAwake, 5_000);
    expect(credited).toBe(10_000);
  });
});
