import { describe, expect, it } from "vitest";
import { clientBoardTasks } from "../src/lib/client-board";

describe("client board", () => {
  it("maps visible task states to plain-language columns and excludes other work", () => {
    const tasks = (["inbox", "ready", "active", "review", "done", "draft"] as const).map(
      (status, index) => ({ id: String(index), title: status, status }),
    );
    const board = clientBoardTasks([
      ...tasks,
      { id: "archived", title: "Archived", status: "ready", isArchived: true },
    ]);
    expect(board.planned.map((task) => [task.title, task.line])).toEqual([
      ["inbox", "Being planned"],
      ["ready", "Ready to start"],
    ]);
    expect(board.building.map((task) => [task.title, task.line])).toEqual([
      ["active", "In progress"],
    ]);
    expect(board.reviewed.map((task) => [task.title, task.line])).toEqual([
      ["review", "Ready for review"],
    ]);
  });
});
