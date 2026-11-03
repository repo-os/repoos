import { describe, expect, it } from "vitest";
import {
  SSE_RECONNECT_BASE_MS,
  SSE_RECONNECT_MAX_MS,
  sseReconnectCap,
  sseReconnectDelay,
} from "../src/lib/sse-backoff";

describe("SSE reconnect backoff (#1018)", () => {
  it("grows exponentially and stops at the ceiling", () => {
    expect(sseReconnectCap(0)).toBe(SSE_RECONNECT_BASE_MS);
    expect(sseReconnectCap(1)).toBe(2_000);
    expect(sseReconnectCap(2)).toBe(4_000);
    expect(sseReconnectCap(3)).toBe(8_000);
    expect(sseReconnectCap(30)).toBe(SSE_RECONNECT_MAX_MS);
  });

  it("never retries faster than half the current cap", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const cap = sseReconnectCap(attempt);
      expect(sseReconnectDelay(attempt, () => 0)).toBe(cap / 2);
      expect(sseReconnectDelay(attempt, () => 1)).toBe(cap);
      const mid = sseReconnectDelay(attempt, () => 0.5);
      expect(mid).toBeGreaterThanOrEqual(cap / 2);
      expect(mid).toBeLessThanOrEqual(cap);
    }
  });

  it("jitters — two tabs on the same attempt get different delays", () => {
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) delays.add(sseReconnectDelay(4));
    // 20 samples from a 16-second window collide only vanishingly rarely.
    expect(delays.size).toBeGreaterThan(1);
  });

  it("tolerates a bad attempt counter", () => {
    expect(sseReconnectDelay(Number.NaN, () => 0.5)).toBe(750);
    expect(sseReconnectDelay(-4, () => 0.5)).toBe(750);
  });
});
