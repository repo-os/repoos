/**
 * #0678 — sleep-aware idle credit, provider scrape, degenerate output detection.
 */
import { describe, expect, it } from "vitest";
import {
  creditIdleMs,
  DegenerateOutputTracker,
  effectiveStalenessNow,
  scrapeProviderFailure,
} from "../../core/agent-run-health";

describe("creditIdleMs", () => {
  it("caps long wall gaps (laptop sleep) to a small awake credit", () => {
    const tick = 1000;
    expect(creditIdleMs(30 * 60_000, tick)).toBe(tick * 2);
    expect(creditIdleMs(500, tick)).toBe(500);
  });
});

describe("effectiveStalenessNow", () => {
  it("ignores sleep-sized gaps between watchdog ticks", () => {
    const interval = 60_000;
    const wallNow = 1_000_000;
    const lastTick = wallNow - 25 * 60_000;
    const adjusted = effectiveStalenessNow(wallNow, lastTick, interval);
    expect(adjusted).toBe(lastTick + interval);
  });

  it("leaves now unchanged for normal tick spacing", () => {
    const wallNow = 1_000_000;
    expect(effectiveStalenessNow(wallNow, wallNow - 30_000, 60_000)).toBe(wallNow);
  });
});

describe("scrapeProviderFailure", () => {
  it("detects 402/credit lines", () => {
    expect(scrapeProviderFailure("OpenRouter HTTP 402 insufficient credits")).toContain("402");
  });
});

describe("DegenerateOutputTracker", () => {
  it("flags repeated single-character output", () => {
    const t = new DegenerateOutputTracker({
      repeatCharThreshold: 20,
      repeatLineThreshold: 5,
      bytesWithoutToolThreshold: 10_000,
    });
    expect(t.observe("<".repeat(19), false)).toBe("ok");
    expect(t.observe("<", false)).toBe("degenerate");
  });

  it("resets byte growth after a tool call", () => {
    const t = new DegenerateOutputTracker({
      repeatCharThreshold: 500,
      repeatLineThreshold: 50,
      bytesWithoutToolThreshold: 100,
    });
    expect(t.observe("x".repeat(50), false)).toBe("ok");
    expect(t.observe("y".repeat(50), true)).toBe("ok");
    expect(t.observe("z".repeat(50), false)).toBe("ok");
  });
});
