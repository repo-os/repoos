/**
 * Single-entry declared-shot helpers (#0627): the Add-shot API and the
 * drawer's delete share `parseShotEntry` (one validator with the CLI),
 * `appendDeclaredShot` / `removeDeclaredShots` (the exact fenced format the
 * capture parser reads) and `declaredShotMatchesShot` (the declaration↔shot
 * match rule, also used by the drawer's pairing).
 */
import { describe, expect, it } from "vitest";
import {
  appendDeclaredShot,
  declaredShotMatchesShot,
  declaredShotsSectionContent,
  parseShotEntry,
  removeDeclaredShots,
} from "../../core/shot-plan.js";

const FENCED = (json: string) => `\`\`\`json\n${json}\n\`\`\``;

describe("parseShotEntry (#0627)", () => {
  it("validates one entry with the same rules the list parser enforces", () => {
    const ok = parseShotEntry({
      target: "default",
      route: "/repo",
      label: "Task drawer open",
      steps: [{ click: ".drawer" }],
    });
    expect(ok.error).toBeUndefined();
    expect(ok.shot).toEqual({
      target: "default",
      route: "/repo",
      label: "Task drawer open",
      steps: [{ click: ".drawer" }],
    });
  });

  it("rejects a bad step and an unknown key, like the list parser", () => {
    expect(parseShotEntry({ steps: [{ click: 1 }] }).error).toContain("step #1");
    expect(parseShotEntry({ steps: [{ wrong: "x" }] }).error).toContain(
      "click/fill/waitFor/waitMs",
    );
    expect(parseShotEntry({ label: 5 }).error).toContain('"label" expects a non-empty string');
    expect(parseShotEntry("nope").error).toContain("each entry must be an object");
  });
});

describe("declaredShotsSectionContent", () => {
  it("writes the fenced JSON block the parser reads back", () => {
    const content = declaredShotsSectionContent([{ target: "default", route: "/" }]);
    expect(content).toBe(FENCED(JSON.stringify([{ target: "default", route: "/" }], null, 2)));
  });
});

describe("appendDeclaredShot", () => {
  const existing = `Intro.\n\n## Shots\n\n${FENCED('[{"target":"default","route":"/"}]')}\n\n## Notes for AI\n- keep`;

  it("appends one entry to an existing list", () => {
    const { content, errors } = appendDeclaredShot(existing, {
      target: "default",
      label: "New",
    });
    expect(errors).toEqual([]);
    // Round-trip: the section parses and holds both entries.
    const parsed = JSON.parse(content.match(/```json\n([\s\S]*?)\n```/)![1]!) as unknown[];
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toEqual({ target: "default", label: "New" });
  });

  it("creates the section when the body has none", () => {
    const { content, errors } = appendDeclaredShot("## Problem\nAdd it.\n", {
      target: "default",
    });
    expect(errors).toEqual([]);
    expect(content).toBe(FENCED(JSON.stringify([{ target: "default" }], null, 2)));
  });

  it("reports an already-malformed list instead of silently dropping it", () => {
    const bad = `## Shots\n\n${FENCED('{"target":')}\n`;
    const { content, errors } = appendDeclaredShot(bad, { target: "default" });
    expect(content).toBe("");
    expect(errors.join(" ")).toContain("does not parse");
  });
});

describe("removeDeclaredShots", () => {
  const body = `## Shots\n\n${FENCED(
    JSON.stringify([
      { target: "default", route: "/", label: "Board" },
      { target: "docs", route: "/guide", label: "Guide" },
    ]),
  )}`;

  it("removes only matching entries and reports the count", () => {
    const { content, removed, errors } = removeDeclaredShots(body, (s) => s.label === "Board");
    expect(errors).toEqual([]);
    expect(removed).toBe(1);
    const parsed = JSON.parse(content!.match(/```json\n([\s\S]*?)\n```/)![1]!) as unknown[];
    expect(parsed).toEqual([{ target: "docs", route: "/guide", label: "Guide" }]);
  });

  it("removes ALL identical matches — delete must not resurrect via re-handoff", () => {
    const dup = `## Shots\n\n${FENCED(
      JSON.stringify([
        { target: "default", route: "/", label: "Board" },
        { target: "default", route: "/", label: "Board" },
      ]),
    )}`;
    const { removed } = removeDeclaredShots(dup, (s) => s.label === "Board");
    expect(removed).toBe(2);
  });

  it("keeps a valid empty list when the last entry is removed", () => {
    const one = `## Shots\n\n${FENCED(JSON.stringify([{ target: "default", route: "/" }]))}`;
    const { content, removed } = removeDeclaredShots(one, () => true);
    expect(removed).toBe(1);
    expect(content).toBe(FENCED("[]"));
  });

  it("removes nothing when no entry matches", () => {
    const { content, removed } = removeDeclaredShots(body, () => false);
    expect(removed).toBe(0);
    expect(content).toBe("");
  });
});

describe("declaredShotMatchesShot", () => {
  it("matches on the fields both sides record, defaults the route to /", () => {
    expect(declaredShotMatchesShot({ route: "/" }, { target: "default" })).toBe(true);
    expect(
      declaredShotMatchesShot(
        { target: "docs", label: "Guide" },
        { target: "docs", label: "Guide" },
      ),
    ).toBe(true);
    // A declared label must match a captured label — a shot without one does
    // not match (same strictness the drawer's pairing always used).
    expect(declaredShotMatchesShot({ label: "Guide" }, { target: "docs" })).toBe(false);
    expect(declaredShotMatchesShot({ label: "Guide" }, { label: "Other" })).toBe(false);
    expect(declaredShotMatchesShot({ route: "/repo" }, { route: undefined })).toBe(false);
  });
});
