/**
 * Client-side mirror of server/task-transitions.ts's allow-list (see
 * task-transitions.test.ts for the server-side pin). Covers the board
 * drag-drop validity check, which now gates the native drop via `dragover`
 * instead of only failing after the fact in `onDrop`.
 */
import { describe, expect, it } from "vitest";
import { isValidBoardMove, boardMoveRejectionReason, GENERIC_PATCH_TARGETS } from "../src/lib/taskTransitions";

describe("isValidBoardMove", () => {
  it("rejects dropping a card back on its own column", () => {
    expect(isValidBoardMove("active", "active")).toBe(false);
  });

  it("allows the six generic-patch edges", () => {
    for (const [from, tos] of Object.entries(GENERIC_PATCH_TARGETS)) {
      for (const to of tos) {
        expect(isValidBoardMove(from, to)).toBe(true);
      }
    }
  });

  it("allows dropping a review task onto done (the one special-cased edge)", () => {
    expect(isValidBoardMove("review", "done")).toBe(true);
  });

  it("rejects dropping a non-review task onto done", () => {
    for (const from of ["draft", "inbox", "ready", "active", "done"]) {
      expect(isValidBoardMove(from, "done")).toBe(false);
    }
  });

  it("rejects transitions that require a dedicated action", () => {
    const blocked: [string, string][] = [
      ["ready", "active"],
      ["active", "ready"],
      ["review", "ready"],
      ["done", "ready"],
    ];
    for (const [from, to] of blocked) {
      expect(isValidBoardMove(from, to)).toBe(false);
    }
  });

  it("rejects skip-a-step and unreviewed backward jumps", () => {
    const nonsense: [string, string][] = [
      ["draft", "active"],
      ["ready", "review"],
      ["active", "draft"],
      ["review", "draft"],
      ["done", "active"],
    ];
    for (const [from, to] of nonsense) {
      expect(isValidBoardMove(from, to)).toBe(false);
    }
  });
});

describe("boardMoveRejectionReason", () => {
  it("names the right dedicated action for each non-generic edge", () => {
    expect(boardMoveRejectionReason("ready", "active")).toMatch(/Start work/);
    expect(boardMoveRejectionReason("active", "ready")).toMatch(/Abandon work/);
    expect(boardMoveRejectionReason("review", "ready")).toMatch(/Abandon work/);
    expect(boardMoveRejectionReason("done", "ready")).toMatch(/Reopen/);
    expect(boardMoveRejectionReason("review", "done")).toMatch(/Move to done/);
  });

  it("falls back to a generic message for skip-a-step jumps", () => {
    expect(boardMoveRejectionReason("draft", "active")).toMatch(/can't move directly/);
    expect(boardMoveRejectionReason("review", "draft")).toMatch(/can't move directly/);
  });
});
