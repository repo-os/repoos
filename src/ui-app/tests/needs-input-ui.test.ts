import { describe, expect, it } from "vitest";
import { needsInputPrimaryAction } from "../src/lib/needs-input-ui";

describe("needsInputPrimaryAction (#0511)", () => {
  it("offers Review again for watchdog-stuck on a review task", () => {
    expect(
      needsInputPrimaryAction("watchdog-stuck", false, {
        status: "review",
        agentRunning: false,
      })?.kind,
    ).toBe("review");
  });

  it("does not offer Restart work on a review task for dev-error", () => {
    expect(
      needsInputPrimaryAction("dev-error", false, {
        status: "review",
        agentRunning: false,
      }),
    ).toBeNull();
  });

  it("offers Restart work only on ready or idle active tasks", () => {
    expect(
      needsInputPrimaryAction("dev-error", false, {
        status: "active",
        agentRunning: false,
      })?.kind,
    ).toBe("restart");
    expect(
      needsInputPrimaryAction("dev-error", false, {
        status: "active",
        agentRunning: true,
      }),
    ).toBeNull();
  });

  it("offers Restart work for review-failed once the task is back in active", () => {
    expect(
      needsInputPrimaryAction("review-failed", false, {
        status: "active",
        agentRunning: false,
      })?.kind,
    ).toBe("restart");
  });
});
