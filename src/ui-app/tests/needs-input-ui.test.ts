import { describe, expect, it } from "vitest";
import { needsInputPrimaryAction } from "../src/lib/needs-input-ui";

describe("needsInputPrimaryAction (#0511)", () => {
  it("does not offer Restart work for watchdog-stuck on a review task", () => {
    expect(
      needsInputPrimaryAction("watchdog-stuck", false, {
        status: "review",
        agentRunning: false,
      }),
    ).toBeNull();
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
});
