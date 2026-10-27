import { describe, expect, it } from "vitest";
import { HANDOFF_DEADLINE_MS, handoffDeadlineMs } from "../../server/handoff.js";
import { DEFAULT_HOST_LOCK_WAIT_SECS } from "../../server/remote-validation.js";

describe("handoff deadline vs remote host lock", () => {
  it("allows the full host lock wait plus gate budget", () => {
    expect(HANDOFF_DEADLINE_MS).toBeGreaterThan(DEFAULT_HOST_LOCK_WAIT_SECS * 1000);
  });
});

describe("REPOOS_HANDOFF_DEADLINE_MS", () => {
  it("uses a valid override and falls back to the default otherwise", () => {
    const fallback = (DEFAULT_HOST_LOCK_WAIT_SECS + 15 * 60) * 1000;
    expect(handoffDeadlineMs("3600000")).toBe(3_600_000);
    expect(handoffDeadlineMs(undefined)).toBe(fallback);
    expect(handoffDeadlineMs("abc")).toBe(fallback);
    // Below the 5-minute floor is ignored rather than cutting gates short.
    expect(handoffDeadlineMs("1000")).toBe(fallback);
  });
});
