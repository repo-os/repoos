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

  // #0709: healthy agents were killed because a stream-json line merely contained
  // the digits "402" (a timestamp or call id) or the words billing / rate limit
  // in file contents.
  it("ignores stream-json tool lines whose text only contains the trigger substrings", () => {
    const edit = JSON.stringify({
      type: "tool_call",
      subtype: "completed",
      call_id: "tool_bfa5ccb9-402e-45cd-a61d-471da9117eb",
      timestamp_ms: 1791270402123,
      tool_call: {
        editToolCall: {
          args: { path: "src/billing.ts" },
          result:
            "// handle rate limit and model unavailable and insufficient credit in the billing flow",
        },
      },
    });
    expect(scrapeProviderFailure(edit)).toBeNull();
  });

  it("detects a structured provider error event with its real message", () => {
    const ev = JSON.stringify({
      type: "error",
      error: { message: "402 Payment Required: insufficient credits" },
    });
    expect(scrapeProviderFailure(ev)).toContain("insufficient credits");
    const res = JSON.stringify({ type: "result", is_error: true, result: "Rate limit exceeded" });
    expect(scrapeProviderFailure(res)).toContain("Rate limit");
  });

  it("does not match a bare 402 inside a number or a long plain-text blob", () => {
    expect(scrapeProviderFailure("elapsed 1791270402123 ms")).toBeNull();
    expect(scrapeProviderFailure("x".repeat(400) + " rate limit")).toBeNull();
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
      bytesWithoutToolThreshold: 200,
    });
    expect(t.observe("x".repeat(80), false)).toBe("ok");
    expect(t.observe("y".repeat(80), true)).toBe("ok");
    expect(t.observe("z".repeat(80), false)).toBe("ok");
  });
});
