import { describe, expect, it } from "vitest";
import { HANDOFF_DEADLINE_MS } from "../../server/handoff.js";
import { DEFAULT_HOST_LOCK_WAIT_SECS } from "../../server/remote-validation.js";

describe("handoff deadline vs remote host lock", () => {
  it("allows the full host lock wait plus gate budget", () => {
    expect(HANDOFF_DEADLINE_MS).toBeGreaterThan(DEFAULT_HOST_LOCK_WAIT_SECS * 1000);
  });
});
