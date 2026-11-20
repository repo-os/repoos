// #1251 — the Work board must not re-sort or re-render a column whose
// membership did not change, and the done sort must order by the same keys it
// did before the per-comparison scan was removed.
import { describe, expect, it } from "vitest";
import { keepSameIds, keepSameList, withoutHiddenTasks } from "../src/lib/boardVisibility";
import { sortTasks } from "../src/stores/repo";
import type { Task } from "../src/types";

const ids = (...list: string[]) => new Set(list);

describe("withoutHiddenTasks", () => {
  const tasks = [{ id: "1" }, { id: "2" }, { id: "3" }];

  it("returns the same array when nothing in the column is hidden", () => {
    expect(withoutHiddenTasks(tasks, ids())).toBe(tasks);
    expect(withoutHiddenTasks(tasks, ids("9"))).toBe(tasks);
  });

  it("removes only the hidden tasks, in their original order", () => {
    const out = withoutHiddenTasks(tasks, ids("2"));
    expect(out).not.toBe(tasks);
    expect(out.map((t) => t.id)).toEqual(["1", "3"]);
  });
});

describe("keepSameIds", () => {
  it("returns the previous Set when the ids are equal, so a computed does not change", () => {
    const prev = ids("1", "2");
    expect(keepSameIds(ids("2", "1"), prev)).toBe(prev);
  });

  it("returns the next Set when an id was added or removed", () => {
    const prev = ids("1", "2");
    const added = ids("1", "2", "3");
    const removed = ids("1");
    const swapped = ids("1", "3");
    expect(keepSameIds(added, prev)).toBe(added);
    expect(keepSameIds(removed, prev)).toBe(removed);
    expect(keepSameIds(swapped, prev)).toBe(swapped);
  });
});

describe("keepSameList", () => {
  const a = { id: "a" };
  const b = { id: "b" };

  it("keeps the previous array for the same objects in the same order", () => {
    const prev = [a, b];
    expect(keepSameList([a, b], prev)).toBe(prev);
  });

  it("returns the next array when order, length or membership changes", () => {
    const prev = [a, b];
    const reordered = [b, a];
    const shorter = [a];
    const replaced = [a, { id: "b" }];
    expect(keepSameList(reordered, prev)).toBe(reordered);
    expect(keepSameList(shorter, prev)).toBe(shorter);
    expect(keepSameList(replaced, prev)).toBe(replaced);
  });
});

describe("sortTasks done order", () => {
  const task = (id: string, body: string, updated_at: string | null, created_at: string | null) =>
    ({ id, body, updated_at, created_at }) as unknown as Task;

  it("orders by the activity-log done time, then updated_at, then created_at, with undated tasks last", () => {
    const log = (at: string) => `- ${at} · status active→done\n`;
    const tasks = [
      task("undated", "", null, null),
      task("fallback-created", "", null, "2026-11-03T00:00:00Z"),
      task("updated-only", "", "2026-11-05T00:00:00Z", null),
      task("logged-newest", log("2026-11-09T00:00:00Z"), "2026-11-01T00:00:00Z", null),
      task("logged-oldest", log("2026-11-02T00:00:00Z"), "2026-11-10T00:00:00Z", null),
    ];
    expect(sortTasks(tasks, "recent", "done").map((t) => t.id)).toEqual([
      "logged-newest",
      "updated-only",
      "fallback-created",
      "logged-oldest",
      "undated",
    ]);
  });

  it("does not mutate the input array", () => {
    const tasks = [
      task("old", "", "2026-11-01T00:00:00Z", null),
      task("new", "", "2026-11-02T00:00:00Z", null),
    ];
    const before = tasks.map((t) => t.id);
    sortTasks(tasks, "recent", "done");
    expect(tasks.map((t) => t.id)).toEqual(before);
  });
});
