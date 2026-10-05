import { describe, expect, it } from "vitest";
import { MAX_AUTO_REVIEW_ROUNDS } from "../../core/needs-input.js";
import {
  needsInputPrimaryAction,
  needsInputBannerText,
  needsInputStatusLabel,
  needsInputSuggestionText,
} from "../src/lib/needs-input-ui";

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

  it("hides the underspecified flag once a task is active, in review or done", async () => {
    const { needsInputSurfaces } = await import("../src/lib/needs-input-ui.js");
    for (const status of ["active", "review", "done"] as const) {
      expect(
        needsInputSurfaces({ status, needsInput: true, needsInputReason: "underspecified" }),
      ).toBe(false);
    }
    expect(
      needsInputSurfaces({ status: "ready", needsInput: true, needsInputReason: "underspecified" }),
    ).toBe(true);
  });

  it("offers Send to PM for underspecified tasks", () => {
    expect(needsInputStatusLabel("underspecified")).toBe("Doesn't look fully fleshed out");
    expect(needsInputBannerText("underspecified")).toContain("doesn't look fully fleshed out");
    expect(needsInputSuggestionText("underspecified")).toContain("PM agent");
    expect(
      needsInputPrimaryAction("underspecified", false, {
        status: "inbox",
        agentRunning: false,
      }),
    ).toEqual({
      kind: "send-pm",
      label: "Send to PM (fleshes this out)",
    });
  });

  it("names review-rounds-exhausted and offers Send to engineer (not Review again) on a review task", () => {
    expect(needsInputStatusLabel("review-rounds-exhausted")).toBe("Review still finding issues");
    expect(needsInputBannerText("review-rounds-exhausted")).toContain("sent this back");
    expect(needsInputBannerText("review-rounds-exhausted")).toContain(
      `${MAX_AUTO_REVIEW_ROUNDS} times`,
    );
    expect(needsInputSuggestionText("review-rounds-exhausted")).toContain(
      "send it to the engineer",
    );
    expect(
      needsInputPrimaryAction("review-rounds-exhausted", false, {
        status: "review",
        agentRunning: false,
      }),
    ).toEqual({ kind: "send-engineer", label: "Send to engineer" });
    expect(needsInputSuggestionText("review-rounds-exhausted")).not.toContain("Review again hides");
  });
});
