import { describe, expect, it } from "vitest";
import { localQueueHintForTask } from "../src/lib/local-queue-hint";

describe("local check queue wording", () => {
  it.each([
    [1, "waiting · 0s"],
    [3, "waiting #3 · 0s"],
  ])("keeps position %i compact and puts the explanation in the tooltip", (position, label) => {
    const now = new Date("2026-10-28T12:00:00.000Z");
    expect(
      localQueueHintForTask(
        [
          {
            taskId: "0924",
            kind: "local-check",
            ahead: position - 1,
            position,
            message: `waiting for a local check slot (${position - 1} ahead, position ${position})`,
            since: "2026-10-28T12:00:00.000Z",
          },
        ],
        "0924",
        now,
      ),
    ).toEqual({
      label,
      title: `waiting for a local check slot (${position - 1} ahead, position ${position}) for 0s`,
    });
  });

  it("shows how long the wait has been going (#0974)", () => {
    const now = new Date("2026-10-28T12:26:00.000Z");
    expect(
      localQueueHintForTask(
        [
          {
            taskId: "0970",
            kind: "pressure",
            ahead: 0,
            position: 0,
            message: "machine is under memory pressure",
            since: "2026-10-28T12:00:00.000Z",
          },
        ],
        "0970",
        now,
      ),
    ).toEqual({
      label: "waiting · 26m 00s",
      title: "waiting: machine is under memory pressure for 26m 00s",
    });
  });

  it("returns null without a marker for this task", () => {
    expect(localQueueHintForTask([{ ...markerFor("0924") }], "0925")).toBeNull();
    expect(localQueueHintForTask(undefined, "0924")).toBeNull();
  });
});

function markerFor(taskId: string) {
  return {
    taskId,
    kind: "local-check" as const,
    ahead: 0,
    position: 1,
    message: "waiting for a local check slot",
    since: "2026-10-28T12:00:00.000Z",
  };
}
