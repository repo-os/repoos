/**
 * Inputs board collapse (#0401): separate localStorage key from the Work
 * board so the two boards never share collapse state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const COLLAPSE_KEY = "repoos.inputs.board.collapsed";
const WORK_COLLAPSE_KEY = "repoos.board.collapsed";

type Collapse = typeof import("../src/lib/inputsBoardCollapse");

function load(): Promise<Collapse> {
  return import("../src/lib/inputsBoardCollapse");
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe("inputsBoardCollapse", () => {
  it("toggles and persists under the inputs-specific key", async () => {
    const bc = await load();

    expect(bc.isInputColumnCollapsed("new")).toBe(false);
    bc.toggleInputColumnCollapsed("new");
    expect(bc.isInputColumnCollapsed("new")).toBe(true);
    expect(JSON.parse(localStorage.getItem(COLLAPSE_KEY)!)).toEqual(["new"]);
    expect(localStorage.getItem(WORK_COLLAPSE_KEY)).toBeNull();
  });

  it("does not read the Work board collapse key", async () => {
    localStorage.setItem(WORK_COLLAPSE_KEY, JSON.stringify(["new", "reviewing"]));
    const bc = await load();

    expect(bc.isInputColumnCollapsed("new")).toBe(false);
    expect(bc.isInputColumnCollapsed("reviewing")).toBe(false);
  });

  it("applies empty-column defaults only when no saved state exists", async () => {
    const bc = await load();
    const byStatus = (id: string) => (id === "new" ? [{}] : []);

    bc.applyInputCollapseDefaults(byStatus, ["new", "reviewing", "processed"]);

    expect(bc.isInputColumnCollapsed("new")).toBe(false);
    expect(bc.isInputColumnCollapsed("reviewing")).toBe(true);
    expect(bc.isInputColumnCollapsed("processed")).toBe(true);
  });

  it("skips defaults when the user already has saved collapse state", async () => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(["new"]));
    const bc = await load();
    const byStatus = () => [];

    bc.applyInputCollapseDefaults(byStatus, ["new", "reviewing", "processed"]);

    expect(bc.isInputColumnCollapsed("new")).toBe(true);
    expect(bc.isInputColumnCollapsed("reviewing")).toBe(false);
    expect(bc.isInputColumnCollapsed("processed")).toBe(false);
  });
});
