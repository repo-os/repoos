import { describe, expect, it } from "vitest";
import { needsInputPrimaryAction } from "../src/lib/needs-input-ui";

describe("needsInputPrimaryAction (#0511)", () => {
  it("offers Review again for watchdog-stuck on a review task, not Restart work", () => {
    const action = needsInputPrimaryAction("watchdog-stuck", false, {
      status: "review",
      agentRunning: false,
    });
    expect(action?.kind).toBe("review");
    expect(action?.label).toContain("Review again");
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
