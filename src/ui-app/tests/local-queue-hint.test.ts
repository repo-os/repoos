import { describe, expect, it } from "vitest";
import { localQueueHintForTask } from "../src/lib/local-queue-hint";

describe("local check queue wording", () => {
  it.each([
    [1, "queued"],
    [3, "queued #3"],
  ])("keeps position %i compact and puts the explanation in the tooltip", (position, label) => {
    expect(
      localQueueHintForTask(
        [
          {
            taskId: "0924",
            kind: "local-check",
            ahead: position - 1,
            position,
            message: `waiting for a local check slot (${position - 1} ahead, position ${position})`,
            since: "2026-10-22T00:00:00.000Z",
          },
        ],
        "0924",
      ),
    ).toEqual({
      label,
      title: `waiting for a local check slot (${position - 1} ahead, position ${position})`,
    });
  });
});
