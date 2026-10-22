import { describe, expect, it } from "vitest";
import { classifyQueuedMessageSource } from "../../core/queued-message-ui";

describe("classifyQueuedMessageSource", () => {
  it("labels human chat sends as you", () => {
    expect(classifyQueuedMessageSource("follow up", { emitHumanTurn: true })).toBe("you");
  });

  it("labels board requirement notices", () => {
    expect(
      classifyQueuedMessageSource("Requirements for #0123 were updated on the board.", {
        skipBoardDivergence: true,
      }),
    ).toBe("board-update");
  });

  it("labels CTO idle nudges", () => {
    expect(
      classifyQueuedMessageSource("CTO check-in: this task has had no worktree activity"),
    ).toBe("cto-nudge");
  });

  it("labels other automated sends as system", () => {
    expect(
      classifyQueuedMessageSource("Handoff repair message", { skipBoardDivergence: true }),
    ).toBe("system");
  });
});
