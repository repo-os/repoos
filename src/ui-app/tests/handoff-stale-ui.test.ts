/**
 * Stale / superseded handoff records must not block Move to done (#1085).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("handoffInFlight ignores stale and superseded records (#1085)", () => {
  it("returns false for a stale running record", () => {
    const repo = useRepoStore();
    repo.handoffStatuses = {
      "1085": {
        state: "running",
        step: "validate",
        attempt: 1,
        stale: true,
        progress: null,
        updatedAt: new Date().toISOString(),
        machine: null,
      },
    };
    expect(repo.handoffInFlight("1085")).toBe(false);
  });

  it("returns false for a superseded record", () => {
    const repo = useRepoStore();
    repo.handoffStatuses = {
      "1080": {
        state: "superseded",
        step: "validate",
        attempt: 1,
        progress: null,
        updatedAt: new Date().toISOString(),
        machine: null,
        reason: "no live handoff process",
      },
    };
    expect(repo.handoffInFlight("1080")).toBe(false);
  });

  it("returns true for a live running record", () => {
    const repo = useRepoStore();
    repo.handoffStatuses = {
      "1070": {
        state: "running",
        step: "check",
        attempt: 2,
        stale: false,
        progress: null,
        updatedAt: new Date().toISOString(),
        machine: null,
      },
    };
    expect(repo.handoffInFlight("1070")).toBe(true);
  });
});
