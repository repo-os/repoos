import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  clearWorkQueueFilterQuery,
  hasActiveWorkQueueFilters,
  ignoredWorkQueueFilterChips,
  matchesWorkQueueFilters,
  NO_WORK_QUEUE_FILTERS,
  readWorkQueueFilters,
  readWorkQueueSort,
  sortWorkQueueTasks,
  withWorkQueueSearch,
  workQueueFilterChips,
  workQueueSortChip,
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

  it("reports active filters and one chip per set filter, with no chip for the search (#1278)", () => {
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
      "priority",
      "area",
      "story",
      "mine",
    ]);
  });

  it("reports ignored priority and assigned values as notices, not filters", () => {
    expect(ignoredWorkQueueFilterChips({ priority: "p9", mine: "2" })).toEqual([
      { key: "priority", label: "Ignored filter: priority=p9", ignored: true },
      { key: "mine", label: "Ignored filter: mine=2 (only mine=1 applies)", ignored: true },
    ]);
    expect(ignoredWorkQueueFilterChips({ priority: "p1", mine: "1" })).toEqual([]);
    expect(hasActiveWorkQueueFilters(readWorkQueueFilters({ priority: "p9" }))).toBe(false);
  });

  it("a mine value other than 1 is a notice that names the accepted value", () => {
    for (const mine of ["0", "2", "true", "yes"]) {
      const chips = ignoredWorkQueueFilterChips({ mine });
      expect(chips).toEqual([
        {
          key: "mine",
          label: `Ignored filter: mine=${mine} (only mine=1 applies)`,
          ignored: true,
        },
      ]);
      expect(hasActiveWorkQueueFilters(readWorkQueueFilters({ mine }))).toBe(false);
    }
  });

  it("a search of only # is inactive: no chip, and it matches every task", () => {
    for (const q of ["#", " # ", ""]) {
      const filters = readWorkQueueFilters({ q });
      expect(hasActiveWorkQueueFilters(filters)).toBe(false);
      expect(workQueueFilterChips(filters)).toEqual([]);
      expect(matchesWorkQueueFilters(task({}), filters)).toBe(true);
    }
    // An active search is still a filter (Clear filters removes it).
    const search = readWorkQueueFilters({ q: "#0001" });
    expect(hasActiveWorkQueueFilters(search)).toBe(true);
    expect(workQueueFilterChips(search)).toEqual([]);
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

  it("a status that is not a board column is an ignored notice, for every phone-only view", () => {
    for (const status of ["attention", "all", "needs", "held", "archived", "human", "bogus"]) {
      expect(ignoredWorkQueueFilterChips({ status })).toEqual([
        {
          key: "status",
          label: `Ignored filter: status=${status} (not a board column)`,
          ignored: true,
        },
      ]);
    }
  });

  it("a board status column is applied, not a notice", () => {
    for (const status of ["draft", "inbox", "ready", "active", "review", "done"]) {
      expect(ignoredWorkQueueFilterChips({ status })).toEqual([]);
    }
  });

  it("a bare, empty or repeated status is a notice, never silently dropped", () => {
    expect(ignoredWorkQueueFilterChips({ status: "" })).toEqual([
      { key: "status", label: "Ignored filter: status= (not a board column)", ignored: true },
    ]);
    expect(ignoredWorkQueueFilterChips({ status: null })).toEqual([
      { key: "status", label: "Ignored filter: status= (not a board column)", ignored: true },
    ]);
    expect(ignoredWorkQueueFilterChips({ status: ["ready", "held"] })).toEqual([
      {
        key: "status",
        label: "Ignored filter: status=ready, held (use one status)",
        ignored: true,
      },
    ]);
    expect(clearWorkQueueFilterQuery({ status: ["ready", "held"], task: "0001" })).toEqual({
      task: "0001",
    });
  });

  it("sort=newest or oldest is applied as a chip, and any other sort is a notice", () => {
    expect(readWorkQueueSort({ sort: "oldest" })).toBe("oldest");
    expect(readWorkQueueSort({ sort: "newest" })).toBe("newest");
    expect(readWorkQueueSort({})).toBeNull();
    expect(workQueueSortChip("oldest")).toEqual({ key: "sort", label: "Sort: Oldest updated" });
    expect(workQueueSortChip("newest")).toEqual({ key: "sort", label: "Sort: Newest updated" });
    expect(workQueueSortChip(null)).toBeNull();
    expect(ignoredWorkQueueFilterChips({ sort: "priority" })).toEqual([
      {
        key: "sort",
        label: "Ignored filter: sort=priority (only newest or oldest applies)",
        ignored: true,
      },
    ]);
    expect(ignoredWorkQueueFilterChips({ sort: "oldest" })).toEqual([]);
  });

  it("sorts by last update, newest or oldest first, without changing the input", () => {
    const tasks = [
      task({ id: "0001", updated_at: "2026-11-02T00:00:00Z" }),
      task({ id: "0002", updated_at: "2026-11-03T00:00:00Z" }),
      task({ id: "0003", updated_at: "2026-11-01T00:00:00Z" }),
    ];
    expect(sortWorkQueueTasks(tasks, "newest").map((t) => t.id)).toEqual(["0002", "0001", "0003"]);
    expect(sortWorkQueueTasks(tasks, "oldest").map((t) => t.id)).toEqual(["0003", "0001", "0002"]);
    expect(tasks.map((t) => t.id)).toEqual(["0001", "0002", "0003"]);
  });

  it("clear removes the board sort and an ignored status, and keeps a board status", () => {
    expect(clearWorkQueueFilterQuery({ sort: "oldest", status: "held", task: "0001" })).toEqual({
      task: "0001",
    });
    expect(clearWorkQueueFilterQuery({ sort: "newest", status: "ready" })).toEqual({
      status: "ready",
    });
    expect(clearWorkQueueFilterQuery({ sort: "oldest", status: "held" })).toEqual({});
  });

  it("search writes q and keeps the other queue keys and the drawer params", () => {
    const next = withWorkQueueSearch(
      { priority: "p1", area: "web", task: "0001", tab: "review" },
      "login",
    );
    expect(next).toEqual({ priority: "p1", area: "web", task: "0001", tab: "review", q: "login" });
  });

  it("search replaces an existing q and removes it when the text is empty", () => {
    expect(withWorkQueueSearch({ q: "old", mine: "1" }, "new")).toEqual({ q: "new", mine: "1" });
    expect(withWorkQueueSearch({ q: "old", mine: "1" }, "")).toEqual({ mine: "1" });
  });

  it("search does not change the query it was given", () => {
    const query = { q: "old", tab: "changes" };
    withWorkQueueSearch(query, "");
    expect(query).toEqual({ q: "old", tab: "changes" });
  });
});

describe("Work header sizing (#1278 review)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const view = readFileSync(resolve(here, "../src/views/WorkView.vue"), "utf8");
  const search = readFileSync(resolve(here, "../src/components/BoardQueueSearch.vue"), "utf8");

  it("keeps the title at its natural width instead of a fixed narrow column", () => {
    const copy = view.match(/\.work-header-copy\s*\{[^}]*\}/)?.[0] ?? "";
    expect(copy).not.toMatch(/flex:\s*0\s+1\s+\d+px/);
    expect(view).toMatch(/\.work-header-copy \.page-title\s*\{[^}]*white-space:\s*nowrap/);
  });

  it("lets the search grow into spare header room, up to 210px", () => {
    const controls = view.match(/\.work-header-search-controls\s*\{[^}]*\}/)?.[0] ?? "";
    expect(controls).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(search).toMatch(/max-width:\s*210px/);
  });
});
