import { describe, expect, it } from "vitest";
import { formatChecksCardLine, isReusedCheckOutput } from "../src/lib/checks-card-status";

const NOW = Date.parse("2026-11-07T13:00:00.000Z");

describe("formatChecksCardLine (#1054)", () => {
  it("joins step progress with elapsed time", () => {
    const line = formatChecksCardLine({
      nowMs: NOW,
      startedAt: new Date(NOW - 41_000).toISOString(),
      progress: { stepsDone: 3, stepsTotal: 9 },
    });
    expect(line).toBe("Checks · step 3 of 9 · 41s");
  });

  it("labels reuse without a progress bar fraction", () => {
    expect(isReusedCheckOutput("reused check 9822 — same clean commit")).toBe(true);
    const line = formatChecksCardLine({
      nowMs: NOW,
      startedAt: new Date(NOW - 30_000).toISOString(),
      progress: null,
      checkOutput: "reused check 9822 — same clean commit and main base",
    });
    expect(line).toBe("Checks · reused earlier check · 30s");
  });

  it("falls back to starting when nothing is counted yet", () => {
    const line = formatChecksCardLine({
      nowMs: NOW,
      startedAt: new Date(NOW - 5_000).toISOString(),
      progress: {
        stepsDone: null,
        stepsTotal: null,
        stepName: null,
        testsDone: null,
        testsTotal: null,
      },
    });
    expect(line).toBe("Checks · starting… · 5s");
  });

  it("uses tests-only copy without step —", () => {
    const line = formatChecksCardLine({
      nowMs: NOW,
      startedAt: new Date(NOW - 133_000).toISOString(),
      progress: { stepsDone: null, stepsTotal: null, testsDone: 3, testsTotal: 680 },
    });
    expect(line).toBe("Checks · tests 3/680 · 2m 13s");
  });
});
