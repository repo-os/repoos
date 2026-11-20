import { describe, expect, it } from "vitest";
import {
  clearWorkQueueFilterQuery,
  hasActiveWorkQueueFilters,
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
