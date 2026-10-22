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
});
