import { describe, expect, it } from "vitest";
import { resolveCardActivityIndicator } from "../src/lib/card-activity-indicator";
import type { SharedTaskCardStatus } from "../src/lib/task-card-status";

describe("resolveCardActivityIndicator", () => {
  const base = {
    stage: "coding" as const,
    reviewRunning: false,
    closeoutActive: false,
    chipText: null,
    showCheckBar: false,
  };

  function shared(partial: Partial<SharedTaskCardStatus>): SharedTaskCardStatus {
    return {
      kind: "coding",
      label: "Coding",
      inFlight: true,
      stuck: false,
      action: "pause",
      ...partial,
    };
  }

  it("maps active coding to the default indicator", () => {
    expect(
      resolveCardActivityIndicator({ ...base, shared: shared({ kind: "coding" }) }),
    ).toMatchObject({ label: "Coding" });
  });

  it("returns null when a chip or check bar replaces the dot row", () => {
    expect(
      resolveCardActivityIndicator({ ...base, shared: shared({}), chipText: "Stuck" }),
    ).toBeNull();
    expect(
      resolveCardActivityIndicator({ ...base, shared: shared({}), showCheckBar: true }),
    ).toBeNull();
  });

  it("maps review-running review tasks without shared status", () => {
    expect(
      resolveCardActivityIndicator({
        ...base,
        shared: null,
        stage: "review",
        reviewRunning: true,
      }),
    ).toMatchObject({ variant: "reviewing", label: "Reviewing…" });
  });
});
