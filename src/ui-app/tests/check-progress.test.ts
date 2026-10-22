import { describe, expect, it } from "vitest";
import { checkProgressLabel, checkProgressPercent } from "../src/lib/check-progress";

describe("check progress display", () => {
  it("shows step progress without a made-up percentage when totals are unknown", () => {
    const progress = { stepsDone: 3, stepsTotal: null };
    expect(checkProgressLabel(progress)).toBe("step 3");
    expect(checkProgressPercent(progress)).toBeNull();
  });

  it("shows a bounded percentage and test file counts when known", () => {
    const progress = { stepsDone: 5, stepsTotal: 12, testsDone: 140, testsTotal: 289 };
    expect(checkProgressPercent(progress)).toBe(42);
    expect(checkProgressLabel(progress)).toBe("step 5 of 12 · tests 140/289 files");
  });

  it("labels the step that is currently running and the test pass", () => {
    const progress = {
      stepsDone: 4,
      currentStep: 5,
      stepName: "tests",
      stepsTotal: 12,
      testsDone: 140,
      testsTotal: 289,
      testsPass: 1,
    };
    expect(checkProgressPercent(progress)).toBe(48);
    expect(checkProgressLabel(progress)).toBe("step 5 of 12 · pass 1 · tests 140/289 files");
  });

  it("does not invent a percentage when stepsDone is missing", () => {
    const progress = { stepsDone: null, stepsTotal: 12 };
    expect(checkProgressPercent(progress)).toBeNull();
    expect(checkProgressLabel(progress)).toBe("step — of 12");
  });

  it("uses step progress outside the tests step", () => {
    expect(
      checkProgressPercent({
        stepsDone: 5,
        stepsTotal: 12,
        stepName: "build",
        testsDone: 140,
        testsTotal: 289,
      }),
    ).toBe(42);
  });
});
