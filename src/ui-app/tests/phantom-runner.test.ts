import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHANTOM_DETECT_MS,
  DEFAULT_PHANTOM_HEAL_MAX,
  decidePhantom,
  type PhantomDecisionInput,
} from "../../server/phantom-runner.js";

const NOW = 1_700_000_000_000;

function decide(over: Partial<PhantomDecisionInput> = {}) {
  return decidePhantom({
    hasEntry: true,
    selfAlive: false,
    liveChildren: 0,
    deadSinceMs: NOW - DEFAULT_PHANTOM_DETECT_MS,
    nowMs: NOW,
    detectMs: DEFAULT_PHANTOM_DETECT_MS,
    recentHeals: 0,
    maxHeals: DEFAULT_PHANTOM_HEAL_MAX,
    ...over,
  });
}

describe("decidePhantom", () => {
  const cases: Array<{
    name: string;
    over: Partial<PhantomDecisionInput>;
    action: string;
  }> = [
    {
      name: "live engineer process",
      over: { selfAlive: true, liveChildren: 0, deadSinceMs: null },
      action: "keep",
    },
    {
      name: "dead process with a runner entry",
      over: { selfAlive: false, liveChildren: 0 },
      action: "heal",
    },
    {
      name: "live child only (engineer PID gone)",
      over: { selfAlive: false, liveChildren: 1, deadSinceMs: NOW - 60 * 60_000 },
      action: "keep",
    },
    {
      name: "repeated heals hit the rate limit",
      over: { recentHeals: DEFAULT_PHANTOM_HEAL_MAX },
      action: "rate-limited",
    },
  ];

  it.each(cases)("$name → $action", ({ over, action }) => {
    expect(decide(over).action).toBe(action);
  });

  it("waits out the detect window before an automatic heal", () => {
    const first = decide({ deadSinceMs: null, nowMs: NOW });
    expect(first.action).toBe("wait");
    expect(first.deadSinceMs).toBe(NOW);
    const later = decide({
      deadSinceMs: first.deadSinceMs,
      nowMs: NOW + DEFAULT_PHANTOM_DETECT_MS - 1,
    });
    expect(later.action).toBe("wait");
    const due = decide({
      deadSinceMs: first.deadSinceMs,
      nowMs: NOW + DEFAULT_PHANTOM_DETECT_MS,
    });
    expect(due.action).toBe("heal");
  });

  it("an explicit start heals a dead entry without waiting", () => {
    expect(decide({ deadSinceMs: null, explicitStart: true }).action).toBe("heal");
  });

  it("does not heal a paused task or a handoff in flight", () => {
    expect(decide({ paused: true }).action).toBe("keep");
    expect(decide({ handoff: true }).action).toBe("keep");
    expect(decide({ review: true }).action).toBe("keep");
    expect(decide({ hasEntry: false }).action).toBe("keep");
  });
});
