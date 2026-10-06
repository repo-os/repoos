import { describe, expect, it } from "vitest";
import {
  needsInputClearsOnNewEngineerRun,
  needsInputClearsOnSuccessfulReview,
  needsInputSuppressedOnReview,
} from "../../core/needs-input.js";

describe("needs-input core helpers", () => {
  it("suppresses dev-error on review tasks for card/drawer surfaces", () => {
    expect(
      needsInputSuppressedOnReview({
        status: "review",
        needsInput: true,
        needsInputReason: "dev-error",
      }),
    ).toBe(true);
    expect(
      needsInputSuppressedOnReview({
        status: "review",
        needsInput: true,
        needsInputReason: "review-failed",
      }),
    ).toBe(false);
  });

  it("clears watchdog-stuck on review after a successful review run", () => {
    expect(
      needsInputClearsOnSuccessfulReview({
        status: "review",
        needsInputReason: "watchdog-stuck",
      }),
    ).toBe(true);
    expect(
      needsInputClearsOnSuccessfulReview({
        status: "active",
        needsInputReason: "watchdog-stuck",
      }),
    ).toBe(false);
  });

  it("clears provider-failure and degenerate-output when engineering resumes (#0716)", () => {
    expect(needsInputClearsOnNewEngineerRun("provider-failure")).toBe(true);
    expect(needsInputClearsOnNewEngineerRun("degenerate-output")).toBe(true);
    expect(needsInputClearsOnNewEngineerRun("dev-error")).toBe(false);
    expect(needsInputClearsOnNewEngineerRun(undefined)).toBe(true);
  });

  it("clears review-rounds-exhausted when a fresh review run completes", () => {
    expect(
      needsInputClearsOnSuccessfulReview({
        status: "review",
        needsInputReason: "review-rounds-exhausted",
      }),
    ).toBe(true);
  });
});
