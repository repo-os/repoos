import { describe, expect, it } from "vitest";
import {
  agentLastActivityTip,
  cardHintDataTip,
  stateElapsedTip,
} from "../src/lib/card-activity-recency";

const NOW = Date.parse("2026-11-08T03:00:00.000Z");

describe("card activity recency (#1058)", () => {
  it("builds agent activity tip with compact age and timestamp", () => {
    const at = new Date(NOW - 3 * 60_000).toISOString();
    const tip = agentLastActivityTip(at, NOW);
    expect(tip).toMatch(/^Active 3m ago\n/);
    expect(tip).toContain("2026");
  });

  it("merges activity tip ahead of the explanatory title", () => {
    const merged = cardHintDataTip("Agent is coding", "Active 1m ago\nNov 8");
    expect(merged).toBe("Active 1m ago\nNov 8\nAgent is coding");
  });

  it("formats pipeline state elapsed for hover", () => {
    const since = new Date(NOW - 12 * 60_000).toISOString();
    const tip = stateElapsedTip("In this state", since, NOW);
    expect(tip).toContain("In this state for 12m");
  });
});
