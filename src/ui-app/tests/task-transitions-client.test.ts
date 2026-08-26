/**
 * Client-side mirror of server/task-transitions.ts's allow-list (see
 * task-transitions.test.ts for the server-side pin). Covers the board
 * drag-drop validity check, which now gates the native drop via `dragover`
 * instead of only failing after the fact in `onDrop`.
 */
import { describe, expect, it } from "vitest";
import { isValidBoardMove, boardMoveRejectionReason, GENERIC_PATCH_TARGETS, DRAG_ACTION_TARGETS } from "../src/lib/taskTransitions";

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

  it("allows the drag-action edges: review -> done and ready -> active", () => {
    for (const [from, tos] of Object.entries(DRAG_ACTION_TARGETS)) {
      for (const to of tos) {
        expect(isValidBoardMove(from, to)).toBe(true);
      }
    }
  });

  it("rejects dropping a non-review task onto done", () => {
    for (const from of ["draft", "inbox", "ready", "active", "done"]) {
      expect(isValidBoardMove(from, "done")).toBe(false);
    }
  });

  it("rejects dropping onto active except from ready (Start work) or review (the bounce edge)", () => {
    for (const from of ["draft", "inbox", "done"]) {
      expect(isValidBoardMove(from, "active")).toBe(false);
    }
  });

  it("rejects transitions that still require a dedicated action drag can't perform", () => {
    const blocked: [string, string][] = [
      ["active", "ready"], // Abandon work — stops the agent, needs confirm()
      ["review", "ready"], // Abandon work — cancels the review, needs confirm()
      ["done", "ready"], // Reopen — needs confirm()
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
  it("names the right dedicated action for edges that still need one", () => {
    expect(boardMoveRejectionReason("active", "ready")).toMatch(/Abandon work/);
    expect(boardMoveRejectionReason("review", "ready")).toMatch(/Abandon work/);
    expect(boardMoveRejectionReason("done", "ready")).toMatch(/Reopen/);
  });

  it("falls back to a generic message for skip-a-step jumps", () => {
    expect(boardMoveRejectionReason("draft", "active")).toMatch(/can't move directly/);
    expect(boardMoveRejectionReason("review", "draft")).toMatch(/can't move directly/);
  });
});
