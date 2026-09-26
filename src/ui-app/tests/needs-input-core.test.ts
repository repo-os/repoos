import { describe, expect, it } from "vitest";
import {
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
});
