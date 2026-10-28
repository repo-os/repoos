import { describe, expect, it } from "vitest";
import {
  readStepTimings,
  stepTimingsFromOutput,
  summarizeStepTimings,
  STEP_TIMING_MARKER,
} from "../../core/check-timings.js";

describe("step timing report", () => {
  it("reports median, nearest-rank p90 and failures, excluding skips and old runs", () => {
    const runs = Array.from({ length: 10 }, (_, i) => ({
      steps: [
        {
          name: "build",
          status: i === 9 ? ("timeout" as const) : ("passed" as const),
          durationMs: (i + 1) * 100,
        },
      ],
    }));
    expect(
      summarizeStepTimings([
        ...runs,
        {},
        { steps: [{ name: "build", status: "skipped", durationMs: 0 }] },
      ]),
    ).toEqual([{ name: "build", samples: 10, skipped: 1, failures: 1, medianMs: 550, p90Ms: 900 }]);
  });
  it("keeps skip-only steps unknown and counts every failure outcome", () => {
    expect(
      summarizeStepTimings([
        {
          steps: [
            { name: "skipped", status: "skipped", durationMs: 0 },
            ...(["failed", "timeout", "missing-prereq"] as const).map((status) => ({
              name: "test",
              status,
              durationMs: 5,
            })),
          ],
        },
      ]),
    ).toEqual([
      { name: "test", samples: 3, skipped: 0, failures: 3, medianMs: 5, p90Ms: 5 },
      { name: "skipped", samples: 0, skipped: 1, failures: 0, medianMs: null, p90Ms: null },
    ]);
    expect(summarizeStepTimings([])).toEqual([]);
  });
  it("validates wire data and tolerates truncated or repeated remote records", () => {
    const step = { name: "build", status: "passed", durationMs: 123.45 };
    expect(
      readStepTimings([
        step,
        null,
        {},
        { ...step, durationMs: -1 },
        { ...step, status: "unknown" },
        { ...step, durationMs: Infinity },
      ]),
    ).toEqual([step]);
    expect(
      stepTimingsFromOutput(
        [
          "normal child output",
          STEP_TIMING_MARKER + "{",
          STEP_TIMING_MARKER + JSON.stringify(step),
          STEP_TIMING_MARKER + JSON.stringify(step),
          STEP_TIMING_MARKER + JSON.stringify({ ...step, status: "skipped", durationMs: 0 }),
        ].join("\n"),
      ),
    ).toEqual([step]);
  });
});
