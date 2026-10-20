import { describe, expect, it } from "vitest";
import {
  classifyPhantom,
  DEFAULT_PHANTOM_DETECT_MS,
  PHANTOM_HEAL_MAX,
  runnerGroupAlive,
} from "../../server/phantom-runner.js";

const NOW = 1_700_000_000_000;

describe("phantom runner classification (#0863)", () => {
  it.each([
    {
      name: "live process",
      hasEntry: true,
      groupAlive: true,
      deadSinceMs: null as number | null,
      heals: [] as number[],
      expectKind: "live",
    },
    {
      name: "dead process with entry, still inside the window",
      hasEntry: true,
      groupAlive: false,
      deadSinceMs: NOW - 1_000,
      heals: [] as number[],
      expectKind: "watching",
    },
    {
      name: "dead process with entry, past the window",
      hasEntry: true,
      groupAlive: false,
      deadSinceMs: NOW - DEFAULT_PHANTOM_DETECT_MS,
      heals: [] as number[],
      expectKind: "heal",
    },
    {
      name: "live child only",
      hasEntry: true,
      groupAlive: true,
      deadSinceMs: NOW - DEFAULT_PHANTOM_DETECT_MS * 2,
      heals: [] as number[],
      expectKind: "live",
    },
    {
      name: "repeated heals hitting the rate limit",
      hasEntry: true,
      groupAlive: false,
      deadSinceMs: NOW - DEFAULT_PHANTOM_DETECT_MS,
      heals: Array.from({ length: PHANTOM_HEAL_MAX }, (_, i) => NOW - 60_000 * (i + 1)),
      expectKind: "rate-limited",
    },
  ])("$name", ({ hasEntry, groupAlive, deadSinceMs, heals, expectKind }) => {
    expect(
      classifyPhantom({
        hasEntry,
        groupAlive,
        deadSinceMs,
        nowMs: NOW,
        detectMs: DEFAULT_PHANTOM_DETECT_MS,
        healTimestampsMs: heals,
      }),
    ).toBe(expectKind);
  });

  it("treats a live child PID as a live group even when the leader is absent", () => {
    const child = 4242;
    expect(runnerGroupAlive(100, () => [child])).toBe(true);
    expect(runnerGroupAlive(100, () => [])).toBe(false);
    expect(runnerGroupAlive(undefined, () => [child])).toBe(false);
  });
});
