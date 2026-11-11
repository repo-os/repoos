import { describe, expect, it } from "vitest";
import {
  enrichAgentFailureDetail,
  formatCopilotAutoTierFailure,
  resolveCopilotAutoTier,
} from "../../core/copilot-auto-tier";

describe("copilot Auto tier helpers", () => {
  it.each([
    ["default", "balance"],
    ["copilot-auto-efficiency", "balance"],
    ["copilot-auto-balance", "balance"],
    ["copilot-auto-intelligence", "intelligence"],
    ["gpt-5.3-codex", null],
  ])("resolveCopilotAutoTier(%s) → %s", (model, tier) => {
    expect(resolveCopilotAutoTier(model)).toBe(tier);
  });

  it("enriches tier failures only for github copilot", () => {
    const raw =
      "The `efficiency` Auto profile is no longer available. Set --auto-tier to balance or intelligence.";
    expect(enrichAgentFailureDetail(raw, "github copilot")).toContain("Copilot Auto tier");
    expect(enrichAgentFailureDetail(raw, "claude code")).toBe(raw);
  });

  it("does not treat unknown-option errors as tier-unavailable", () => {
    expect(formatCopilotAutoTierFailure("copilot: unknown option '--auto-tier'")).toBeNull();
  });

  it("splits a comma-separated CLI suggestion into separate tiers", () => {
    const msg = formatCopilotAutoTierFailure(
      "The `efficiency` Auto profile is no longer available. Set --auto-tier to balance, intelligence.",
    );
    expect(msg).toContain("balance or intelligence");
  });
});
