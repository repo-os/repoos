/**
 * `previewCapacityHolder` (#0627 review round 2): the no-evict capacity
 * decision for the manual single-entry shot capture. In-flight starts hold
 * the slot just like registered previews — a preview is only registered after
 * port reservation, spawn and readiness, so counting the registry alone would
 * let concurrent starts for different tasks both pass and exceed the
 * one-preview cap. Pure function, so the concurrency contract is pinned
 * without spawning processes.
 */
import { describe, expect, it } from "vitest";
import { previewCapacityHolder } from "../../server/preview.js";

describe("previewCapacityHolder (#0627 review round 2)", () => {
  it("allows a start when the slot is completely free", () => {
    expect(previewCapacityHolder([], [], "0627", 1)).toBeNull();
  });

  it("allows a start when the task already holds the slot (idempotent)", () => {
    expect(previewCapacityHolder(["0627"], [], "0627", 1)).toBeNull();
  });

  it("is busy against a registered preview, naming it", () => {
    expect(previewCapacityHolder(["0999"], [], "0627", 1)).toBe("0999");
  });

  it("is busy against a start still IN FLIGHT — the registry alone would miss it", () => {
    // Task 0999 reserved its port and is spawning: registered nowhere yet.
    expect(previewCapacityHolder([], ["0999"], "0627", 1)).toBe("0999");
  });

  it("is busy when a registered preview AND an in-flight start both hold slots", () => {
    expect(previewCapacityHolder(["0999"], ["0998"], "0627", 1)).toBe("0999");
  });

  it("never counts the starting task's own (defensive) inflight entry", () => {
    expect(previewCapacityHolder([], ["0627"], "0627", 1)).toBeNull();
  });

  it("respects a larger max for future cap changes", () => {
    expect(previewCapacityHolder(["0999"], [], "0627", 2)).toBeNull();
    expect(previewCapacityHolder(["0999", "0998"], [], "0627", 2)).toBe("0999");
    expect(previewCapacityHolder(["0999"], ["0998"], "0627", 2)).toBe("0999");
  });
});
