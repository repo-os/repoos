/**
 * #0328 bulk collapse operations on the shared board collapse state
 * (boardCollapse.ts): the collapse-empty / expand-all toggle helpers, and the
 * auto-open on task arrival — a 0 → ≥1 count transition expands a collapsed
 * column, while a column that becomes empty is never auto-closed.
 *
 * boardCollapse reads localStorage at import time, so every test resets the
 * module registry and seeds storage before a fresh dynamic import: each test
 * gets the module scope (hadSavedState, collapsedIds) built from exactly the
 * storage it seeded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const COLLAPSE_KEY = "repoos.board.collapsed";

/** The board columns WorkView renders, draft included (rendered separately). */
const BOARD_IDS = ["draft", "inbox", "ready", "active", "review", "done"];

type Counts = Record<string, number>;

/** Store-agnostic byStatus stand-in: an array of the given length per status. */
function boardWith(counts: Counts) {
  return (s: string) => new Array(counts[s] ?? 0);
}

type Collapse = typeof import("../src/lib/boardCollapse");

function load(): Promise<Collapse> {
  return import("../src/lib/boardCollapse");
}

function savedIds(): string[] {
  const raw = localStorage.getItem(COLLAPSE_KEY);
  return raw === null ? [] : (JSON.parse(raw) as string[]);
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("collapseAllEmpty", () => {
  it("collapses exactly the empty columns, draft included", async () => {
    const bc = await load();
    const byStatus = boardWith({ draft: 0, inbox: 2, ready: 0, active: 1, review: 0, done: 0 });

    expect(bc.collapseAllEmpty(byStatus, BOARD_IDS)).toBe(true);

    expect(bc.isColumnCollapsed("draft")).toBe(true);
    expect(bc.isColumnCollapsed("inbox")).toBe(false);
    expect(bc.isColumnCollapsed("ready")).toBe(true);
    expect(bc.isColumnCollapsed("active")).toBe(false);
    expect(bc.isColumnCollapsed("review")).toBe(true);
    expect(bc.isColumnCollapsed("done")).toBe(true);
  });

  it("leaves a manually collapsed non-empty column untouched", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["active"]));
    const bc = await load();
    const byStatus = boardWith({ inbox: 1, active: 2 });

    bc.collapseAllEmpty(byStatus, BOARD_IDS);

    expect(bc.isColumnCollapsed("active")).toBe(true);
    expect(bc.isColumnCollapsed("inbox")).toBe(false);
  });

  it("is a no-op when there are no empty columns", async () => {
    const bc = await load();
    const byStatus = boardWith({ draft: 1, inbox: 1, ready: 1, active: 1, review: 1, done: 1 });

    expect(bc.collapseAllEmpty(byStatus, BOARD_IDS)).toBe(false);
    expect(savedIds()).toEqual([]);
  });

  it("persists so a fresh module load reads the collapsed set back", async () => {
    const bc = await load();
    const byStatus = boardWith({ done: 1 });

    bc.collapseAllEmpty(byStatus, BOARD_IDS);

    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.isColumnCollapsed("draft")).toBe(true);
    expect(reloaded.isColumnCollapsed("done")).toBe(false);
  });
});

describe("hasExpandedEmptyColumn", () => {
  it("is true while any empty column is expanded, false once they are collapsed", async () => {
    const bc = await load();
    const byStatus = boardWith({ draft: 0, inbox: 1 });

    expect(bc.hasExpandedEmptyColumn(byStatus, BOARD_IDS)).toBe(true);

    bc.collapseAllEmpty(byStatus, BOARD_IDS);
    expect(bc.hasExpandedEmptyColumn(byStatus, BOARD_IDS)).toBe(false);
  });

  it("is vacuously false with no empty columns at all (button acts as expand-all)", async () => {
    const bc = await load();
    const byStatus = boardWith({ draft: 1, inbox: 1, ready: 1, active: 1, review: 1, done: 1 });

    expect(bc.hasExpandedEmptyColumn(byStatus, BOARD_IDS)).toBe(false);
  });
});

describe("expandAll", () => {
  it("expands every column, including manually collapsed non-empty ones", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["draft", "active"]));
    const bc = await load();
    const byStatus = boardWith({ draft: 0, ready: 0, active: 1 });

    bc.collapseAllEmpty(byStatus, BOARD_IDS); // draft + ready join the saved set
    expect(bc.expandAll(BOARD_IDS)).toBe(true);

    for (const id of BOARD_IDS) expect(bc.isColumnCollapsed(id)).toBe(false);
    expect(savedIds()).toEqual([]);
  });

  it("is a no-op when nothing is collapsed", async () => {
    const bc = await load();

    expect(bc.expandAll(BOARD_IDS)).toBe(false);
  });
});

describe("revealOnArrival / revealArrivals", () => {
  it("auto-expands collapsed columns on a 0 → ≥1 transition and persists", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["draft", "done"]));
    const bc = await load();

    bc.revealArrivals({}, { draft: 1, done: 2, inbox: 0 });

    expect(bc.isColumnCollapsed("draft")).toBe(false);
    expect(bc.isColumnCollapsed("done")).toBe(false);
    expect(savedIds()).toEqual([]);
  });

  it("ignores counts that did not transition from zero", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["done"]));
    const bc = await load();

    bc.revealArrivals({ done: 3 }, { done: 4 });

    expect(bc.isColumnCollapsed("done")).toBe(true);
    expect(savedIds()).toEqual(["done"]);
  });

  it("leaves a collapsed empty column collapsed across unrelated re-renders", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["ready"]));
    const bc = await load();

    bc.revealArrivals({ ready: 0 }, { ready: 0 });

    expect(bc.isColumnCollapsed("ready")).toBe(true);
  });

  it("never auto-closes a column that becomes empty (one-directional)", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["done"]));
    const bc = await load();

    // A task arrives → the column opens so it is visible.
    bc.revealArrivals({ done: 0 }, { done: 1 });
    expect(bc.isColumnCollapsed("done")).toBe(false);

    // Its last task moves out → nothing collapses the column again.
    bc.revealArrivals({ done: 1 }, { done: 0 });
    expect(bc.isColumnCollapsed("done")).toBe(false);
    expect(savedIds()).toEqual([]);
  });
});
