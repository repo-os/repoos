/** Failed/skipped capture outcomes surfaced in the Changes tab's UI changes section. */
import { describe, expect, it } from "vitest";
import { shotProblems, uncapturedDeclared } from "../src/lib/shot-rows";
import type { ShotMeta } from "../src/types";

const body = [
  "## Shots",
  "```json",
  '[{"target":"default","route":"/releases","label":"Drawer","steps":[{"click":".x"}]}]',
  "```",
  "",
  "## Activity",
  "",
  "- 2026-10-02T02:10:13Z · status active→review",
  '- 2026-10-02T02:10:24Z · note: shots: failed — capture of Drawer on "default" failed: click: Timeout 5000ms exceeded.',
  "- 2026-10-02T02:11:00Z · note: shots: skipped — Playwright unavailable",
].join("\n");

const shot = (capturedAt: string): ShotMeta => ({
  name: "a.png",
  target: "default",
  route: "/releases",
  label: "Drawer",
  path: "p",
  url: "u",
  size: 1,
  mime: "image/png",
  capturedAt,
});

describe("shotProblems", () => {
  it("reads failed and skipped notes from the activity log", () => {
    const problems = shotProblems(body, []);
    expect(problems.map((p) => p.status)).toEqual(["failed", "skipped"]);
    expect(problems[0]!.detail).toContain("Timeout 5000ms");
  });

  it("drops problems older than the newest captured shot", () => {
    expect(shotProblems(body, [shot("2026-10-02T02:10:30.000Z")]).map((p) => p.status)).toEqual([
      "skipped",
    ]);
  });

  it("is empty with no activity section", () => {
    expect(shotProblems("## Problem\n\nx", [])).toEqual([]);
  });
});

describe("uncapturedDeclared", () => {
  it("lists declared shots with no captured file, with their steps", () => {
    const rows = uncapturedDeclared([], body);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Drawer");
    expect(rows[0]!.stepsText).toBe("click .x");
  });

  it("omits declared shots that were captured", () => {
    expect(uncapturedDeclared([shot("2026-10-02T02:12:00.000Z")], body)).toEqual([]);
  });
});
