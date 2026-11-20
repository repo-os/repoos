import { describe, expect, it } from "vitest";
import {
  clearWorkQueueFilterQuery,
  hasActiveWorkQueueFilters,
  ignoredWorkQueueFilterChips,
  matchesWorkQueueFilters,
  NO_WORK_QUEUE_FILTERS,
  readWorkQueueFilters,
  workQueueFilterChips,
} from "../src/lib/workQueueFilters";
import type { Task } from "../src/types";

function task(extra: Partial<Task>): Task {
  return {
    id: "0001",
    title: "Login redirect loop",
    priority: "p1",
    area: "web",
    assignee: "ai",
    story: "auth",
    ...extra,
  } as Task;
}

describe("work queue filters", () => {
  it("reads only valid values and ignores an unknown priority", () => {
    expect(readWorkQueueFilters({ q: ["login", "x"], priority: "p9", mine: "1" })).toEqual({
      query: "login",
      priority: "",
      area: "any",
      story: "any",
      mine: true,
    });
    expect(readWorkQueueFilters({})).toEqual(NO_WORK_QUEUE_FILTERS);
  });

  it("matches each filter on its own and all of them together", () => {
    const t = task({});
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, query: "#0001" })).toBe(true);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, query: "redirect" })).toBe(true);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, query: "billing" })).toBe(false);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, priority: "p2" })).toBe(false);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, area: "API" })).toBe(false);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, story: "billing" })).toBe(false);
    expect(matchesWorkQueueFilters(t, { ...NO_WORK_QUEUE_FILTERS, mine: true })).toBe(false);
    expect(
      matchesWorkQueueFilters(task({ assignee: "human" }), {
        ...NO_WORK_QUEUE_FILTERS,
        mine: true,
      }),
    ).toBe(true);
  });

  it("reports active filters and one chip per set filter", () => {
    expect(hasActiveWorkQueueFilters(NO_WORK_QUEUE_FILTERS)).toBe(false);
    const filters = {
      query: " login ",
      priority: "p0",
      area: "web",
      story: "auth",
      mine: true,
    };
    expect(hasActiveWorkQueueFilters(filters)).toBe(true);
    expect(workQueueFilterChips(filters).map((chip) => chip.key)).toEqual([
      "q",
      "priority",
      "area",
      "story",
      "mine",
    ]);
  });

  it("reports ignored priority and assigned values as notices, not filters", () => {
    expect(ignoredWorkQueueFilterChips({ priority: "p9", mine: "2" })).toEqual([
      { key: "priority", label: "Ignored filter: priority=p9", ignored: true },
      { key: "mine", label: "Ignored filter: mine=2", ignored: true },
    ]);
    expect(ignoredWorkQueueFilterChips({ priority: "p1", mine: "1" })).toEqual([]);
    expect(hasActiveWorkQueueFilters(readWorkQueueFilters({ priority: "p9" }))).toBe(false);
  });

  it("a search of only # is inactive: no chip, and it matches every task", () => {
    for (const q of ["#", " # ", ""]) {
      const filters = readWorkQueueFilters({ q });
      expect(hasActiveWorkQueueFilters(filters)).toBe(false);
      expect(workQueueFilterChips(filters)).toEqual([]);
      expect(matchesWorkQueueFilters(task({}), filters)).toBe(true);
    }
    expect(workQueueFilterChips(readWorkQueueFilters({ q: "#0001" }))[0]?.label).toBe(
      "Search: #0001",
    );
  });

  it("clear keeps null and repeated values of keys it does not own", () => {
    const next = clearWorkQueueFilterQuery({ q: "x", flag: null, tab: ["a", "b"] });
    expect(next).toEqual({ flag: null, tab: ["a", "b"] });
  });

  it("clear removes only the queue filter keys and keeps everything else", () => {
    const next = clearWorkQueueFilterQuery({
      q: "login",
      priority: "p1",
      mine: "1",
      status: "review",
      task: "0001",
      tab: ["review", "changes"],
    });
    expect(next).toEqual({ status: "review", task: "0001", tab: ["review", "changes"] });
  });
});
