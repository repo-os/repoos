/**
 * The task drawer picks one status card from several possible conditions.
 * Human action comes first, then review failures, landing blockers, handoff
 * errors, exhausted checks, and finally live/routine activity.
 */
import { describe, expect, it } from "vitest";
import { selectDrawerStatus, type DrawerStatusKey } from "../src/lib/drawer-status-priority";

type Candidates = Parameters<typeof selectDrawerStatus>[0];

const allFalse: Candidates = {
  waitingForYou: false,
  reviewFailed: false,
  notLandable: false,
  handoffFailed: false,
  checksRunning: false,
  confirmingHandoff: false,
  checksFailedAfterRetries: false,
  reviewerRunning: false,
  workRunning: false,
};

function only(key: DrawerStatusKey): Candidates {
  return { ...allFalse, [key]: true };
}

describe("selectDrawerStatus priority", () => {
  it("returns null when nothing is active", () => {
    expect(selectDrawerStatus(allFalse)).toBeNull();
  });

  it("returns the only true candidate", () => {
    for (const key of Object.keys(allFalse) as DrawerStatusKey[]) {
      expect(selectDrawerStatus(only(key))).toBe(key);
    }
  });

  it("prioritises waiting for you over everything else", () => {
    for (const key of Object.keys(allFalse) as DrawerStatusKey[]) {
      if (key === "waitingForYou") continue;
      expect(selectDrawerStatus({ ...only(key), waitingForYou: true })).toBe("waitingForYou");
    }
  });

  it("prioritises review failed over landing blockers and below", () => {
    const below: DrawerStatusKey[] = [
      "notLandable",
      "handoffFailed",
      "checksFailedAfterRetries",
      "checksRunning",
      "confirmingHandoff",
      "reviewerRunning",
      "workRunning",
    ];
    for (const key of below) {
      expect(selectDrawerStatus({ ...only(key), reviewFailed: true })).toBe("reviewFailed");
    }
  });

  it("prioritises landing blockers over handoff errors and below", () => {
    const below: DrawerStatusKey[] = [
      "handoffFailed",
      "checksFailedAfterRetries",
      "checksRunning",
      "confirmingHandoff",
      "reviewerRunning",
      "workRunning",
    ];
    for (const key of below) {
      expect(selectDrawerStatus({ ...only(key), notLandable: true })).toBe("notLandable");
    }
  });

  it("prioritises handoff errors over exhausted checks and live progress", () => {
    const below: DrawerStatusKey[] = [
      "checksFailedAfterRetries",
      "checksRunning",
      "confirmingHandoff",
      "reviewerRunning",
      "workRunning",
    ];
    for (const key of below) {
      expect(selectDrawerStatus({ ...only(key), handoffFailed: true })).toBe("handoffFailed");
    }
  });

  it("prioritises exhausted checks over live progress states", () => {
    const below: DrawerStatusKey[] = [
      "checksRunning",
      "confirmingHandoff",
      "reviewerRunning",
      "workRunning",
    ];
    for (const key of below) {
      expect(selectDrawerStatus({ ...only(key), checksFailedAfterRetries: true })).toBe(
        "checksFailedAfterRetries",
      );
    }
  });

  it("prioritises checks running over confirming handoff, reviewer and work", () => {
    expect(selectDrawerStatus({ ...only("confirmingHandoff"), checksRunning: true })).toBe(
      "checksRunning",
    );
    expect(selectDrawerStatus({ ...only("reviewerRunning"), checksRunning: true })).toBe(
      "checksRunning",
    );
    expect(selectDrawerStatus({ ...only("workRunning"), checksRunning: true })).toBe(
      "checksRunning",
    );
  });

  it("prioritises confirming handoff over reviewer and work running", () => {
    expect(selectDrawerStatus({ ...only("reviewerRunning"), confirmingHandoff: true })).toBe(
      "confirmingHandoff",
    );
    expect(selectDrawerStatus({ ...only("workRunning"), confirmingHandoff: true })).toBe(
      "confirmingHandoff",
    );
  });

  it("prioritises reviewer running over work running", () => {
    expect(selectDrawerStatus({ ...only("workRunning"), reviewerRunning: true })).toBe(
      "reviewerRunning",
    );
  });

  it("matches the documented order for all combinations seen in screenshots", () => {
    // Screenshot combinations from #0952:
    // review failed no report, not landable, handoff failed, checks running,
    // confirming handoff, checks failed after retries, waiting for you.
    const combos: { candidates: Candidates; expected: DrawerStatusKey }[] = [
      {
        candidates: { ...allFalse, reviewFailed: true, notLandable: true },
        expected: "reviewFailed",
      },
      {
        candidates: { ...allFalse, notLandable: true, checksRunning: true },
        expected: "notLandable",
      },
      {
        candidates: { ...allFalse, handoffFailed: true, checksFailedAfterRetries: true },
        expected: "handoffFailed",
      },
      {
        candidates: { ...allFalse, checksRunning: true, confirmingHandoff: true },
        expected: "checksRunning",
      },
      {
        candidates: { ...allFalse, checksFailedAfterRetries: true, workRunning: true },
        expected: "checksFailedAfterRetries",
      },
      {
        candidates: { ...allFalse, waitingForYou: true, checksRunning: true },
        expected: "waitingForYou",
      },
    ];
    for (const { candidates, expected } of combos) {
      expect(selectDrawerStatus(candidates)).toBe(expected);
    }
  });
});
