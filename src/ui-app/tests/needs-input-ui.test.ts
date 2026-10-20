import { describe, expect, it } from "vitest";
import { MAX_AUTO_REVIEW_ROUNDS } from "../../core/needs-input.js";
import {
  needsInputPrimaryAction,
  needsInputBannerText,
  formatNeedsInputDetailForDisplay,
  needsInputDetailVisible,
  needsInputDetailUsesLineClamp,
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

  it("offers Restart work for provider-failure and degenerate-output like dev-error", () => {
    for (const reason of ["provider-failure", "degenerate-output"]) {
      expect(
        needsInputPrimaryAction(reason, false, {
          status: "active",
          agentRunning: false,
        })?.kind,
      ).toBe("restart");
    }
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

  it("names the repeated review classes flag distinctly from rounds-exhausted", () => {
    expect(needsInputStatusLabel("review-human-attention")).toContain("Repeated review classes");
    expect(needsInputStatusLabel("review-human-attention")).not.toBe(
      needsInputStatusLabel("review-rounds-exhausted"),
    );
    expect(needsInputBannerText("review-human-attention")).toContain("several passes");
    expect(
      needsInputPrimaryAction("review-human-attention", false, {
        status: "review",
        agentRunning: false,
      })?.kind,
    ).toBe("send-engineer");
  });

  it("offers Send to PM for needs-human-step tasks (#0698)", () => {
    expect(needsInputStatusLabel("needs-human-step")).toBe("Needs human step");
    expect(needsInputSuggestionText("needs-human-step")).toContain("Split the human-only");
    expect(
      needsInputPrimaryAction("needs-human-step", false, {
        status: "inbox",
        agentRunning: false,
      })?.kind,
    ).toBe("send-pm");
  });

  it("offers Send to PM for underspecified tasks", () => {
    expect(needsInputStatusLabel("underspecified")).toBe("Not fully fleshed out");
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

  it("keeps shortened card badges meaningful (#0816)", () => {
    // The two long badges the bundle trims, plus a lossless trim of dev-error.
    expect(needsInputStatusLabel("needs-human-step")).toBe("Needs human step");
    expect(needsInputStatusLabel("underspecified")).toBe("Not fully fleshed out");
    expect(needsInputStatusLabel("dev-error")).toBe("Agent exited with error");
    // The full-sentence banners still carry the meaning, so the shorter chip
    // never has to explain itself alone.
    expect(needsInputBannerText("needs-human-step")).toContain("human");
    expect(needsInputBannerText("underspecified")).toContain("fleshed out");
    expect(needsInputBannerText("dev-error")).toContain("error");
  });

  it("hides needs-input detail when it repeats the banner (#0778)", () => {
    const banner = needsInputBannerText("review-rounds-exhausted");
    expect(needsInputDetailVisible("review-rounds-exhausted", banner)).toBe(false);
    expect(
      needsInputDetailVisible("review-rounds-exhausted", "`needs some work` — one defect remains."),
    ).toBe(true);
  });

  it("strips the verdict label from review-rounds-exhausted detail (#0832)", () => {
    const long =
      "`needs some work` — " + "Regression in the drawer and missing contrast coverage. ".repeat(8);
    expect(formatNeedsInputDetailForDisplay("review-rounds-exhausted", long)).not.toContain(
      "needs some work",
    );
    expect(formatNeedsInputDetailForDisplay("review-rounds-exhausted", long)).toContain(
      "Regression in the drawer",
    );
    expect(needsInputDetailUsesLineClamp("review-rounds-exhausted")).toBe(true);
    expect(needsInputDetailUsesLineClamp("review-failed")).toBe(false);
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
