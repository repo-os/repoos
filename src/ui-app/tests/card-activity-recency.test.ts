import { describe, expect, it } from "vitest";
import {
  agentLastActivityTip,
  cardHintDataTip,
  firstValidActivityTimestamp,
  stateElapsedTip,
} from "../src/lib/card-activity-recency";

const NOW = Date.parse("2026-11-08T03:00:00.000Z");

describe("card activity recency (#1058)", () => {
  it.each([
    {
      preferred: "invalid",
      fallback: "2026-11-08T02:59:00.000Z",
      expected: "2026-11-08T02:59:00.000Z",
    },
    { preferred: null, fallback: "2026-11-08T02:59:00.000Z", expected: "2026-11-08T02:59:00.000Z" },
    {
      preferred: "2026-11-08T02:58:00.000Z",
      fallback: "2026-11-08T02:59:00.000Z",
      expected: "2026-11-08T02:58:00.000Z",
    },
    { preferred: "invalid", fallback: null, expected: undefined },
  ])(
    "uses a valid activity timestamp fallback ($preferred)",
    ({ preferred, fallback, expected }) => {
      expect(firstValidActivityTimestamp(preferred, fallback)).toBe(expected);
    },
  );
  it.each([
    {
      activity: "invalid",
      runningSince: "2026-11-08T02:59:00.000Z",
      stateSince: "2026-11-08T02:48:00.000Z",
      expected: "2026-11-08T02:59:00.000Z",
    },
    {
      activity: null,
      runningSince: "invalid",
      stateSince: "2026-11-08T02:48:00.000Z",
      expected: "2026-11-08T02:48:00.000Z",
    },
    { activity: "invalid", runningSince: null, stateSince: "invalid", expected: undefined },
  ] as const)(
    "falls back through activity, running start, then state time ($activity / $runningSince)",
    ({ activity, runningSince, stateSince, expected }) => {
      expect(firstValidActivityTimestamp(activity, runningSince, stateSince)).toBe(expected);
    },
  );
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
