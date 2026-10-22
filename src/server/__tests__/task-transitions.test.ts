import { describe, expect, it } from "vitest";
import { shouldRunAutomaticTaskLifecycle } from "../task-transitions.js";

describe("automatic task lifecycle", () => {
  it.each([
    ["human", false],
    ["ai", true],
    [undefined, true],
  ] as const)("returns %s automation policy", (assignee, expected) => {
    expect(shouldRunAutomaticTaskLifecycle({ assignee } as any)).toBe(expected);
  });

  it("keeps human tasks inert when entering review or done", () => {
    const humanTask = { assignee: "human", status: "review" } as any;
    expect(shouldRunAutomaticTaskLifecycle(humanTask)).toBe(false);
    humanTask.status = "done";
    expect(shouldRunAutomaticTaskLifecycle(humanTask)).toBe(false);
  });
});
