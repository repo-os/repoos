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
  declarationMatchesDeletedShot,
  declarationRawMatchesDeletedShot,
  declaredShotMatchesShot,
  declaredShotsSectionContent,
  parseShotEntry,
  removeDeclarationsForDeletedShot,
  removeDeclaredShots,
  sameDeclaredShot,
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

  it("removes a valid entry while another entry fails validation (#0778)", () => {
    const mixed = `## Shots\n\n${FENCED(
      JSON.stringify([
        { target: "default", route: "/", label: "Board", state: "board:notARealFixture" },
        { target: "default", route: "/agents", label: "Agents" },
      ]),
    )}`;
    const { content, removed, errors } = removeDeclaredShots(mixed, (s) => s.label === "Agents");
    expect(errors).toEqual([]);
    expect(removed).toBe(1);
    const parsed = JSON.parse(content!.match(/```json\n([\s\S]*?)\n```/)![1]!) as unknown[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ state: "board:notARealFixture" });
  });

  it("removes only the selected entry when twin invalid entries share label/route/target (#0778 review)", () => {
    // Two entries that no longer parse (unknown state) and share every shallow
    // field but differ in selector: deleting the captured shot must remove
    // exactly its own declaration, not both twins.
    const capturedDeclared = { target: "default", route: "/", label: "Board", selector: ".a" };
    const twin = `## Shots\n\n${FENCED(
      JSON.stringify([
        { target: "default", route: "/", label: "Board", selector: ".a", state: "board:nope" },
        { target: "default", route: "/", label: "Board", selector: ".b", state: "board:nope" },
      ]),
    )}`;
    const shotRef = { label: "Board", route: "/", target: "default" };
    const { content, removed, errors } = removeDeclaredShots(
      twin,
      (s) => declarationMatchesDeletedShot(s, shotRef, capturedDeclared),
      (raw) => declarationRawMatchesDeletedShot(raw, shotRef, capturedDeclared),
    );
    expect(errors).toEqual([]);
    expect(removed).toBe(1);
    const parsed = JSON.parse(content!.match(/```json\n([\s\S]*?)\n```/)![1]!) as unknown[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ selector: ".b" });
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

  it("never lets a declaration with no identifying fields claim any shot", () => {
    // Steps-only or highlight-only entries cannot be attributed to a specific
    // capture — treating the absent fields as wildcards would let one claim
    // ANY deleted shot (review round 1).
    expect(declaredShotMatchesShot({ steps: [{ click: ".x" }] }, {})).toBe(false);
    expect(declaredShotMatchesShot({ highlight: ".y" }, { target: "default" })).toBe(false);
  });
});

describe("sameDeclaredShot (#0627 review round 1)", () => {
  it("is true for identical entries in any construction order", () => {
    expect(
      sameDeclaredShot({ target: "default", label: "A" }, { label: "A", target: "default" }),
    ).toBe(true);
    expect(sameDeclaredShot({}, {})).toBe(true);
  });

  it("is false when selector or steps differ, even with equal label/route/target", () => {
    const base = { target: "default", route: "/", label: "A" };
    expect(sameDeclaredShot(base, { ...base, selector: ".x" })).toBe(false);
    expect(sameDeclaredShot(base, { ...base, highlight: ".x" })).toBe(false);
    expect(sameDeclaredShot(base, { ...base, steps: [{ click: ".a" }] })).toBe(false);
    expect(
      sameDeclaredShot(
        { ...base, steps: [{ click: ".a" }, { waitMs: 100 }] },
        { ...base, steps: [{ click: ".a" }] },
      ),
    ).toBe(false);
  });

  it("is false when only the state fixture differs (#0778)", () => {
    const base = { target: "default", route: "/", label: "A" };
    expect(
      sameDeclaredShot(
        { ...base, state: "board:withReviewTask" },
        { ...base, state: "closeOut:active" },
      ),
    ).toBe(false);
    expect(sameDeclaredShot({ ...base, state: "board:withReviewTask" }, base)).toBe(false);
  });
});

describe("removeDeclarationsForDeletedShot (#0778 review round 3)", () => {
  const ref = { target: "default", route: "/", label: "Board" };
  const stored = { ...ref, selector: ".a", state: "board:withReviewTask" };
  const editedInvalid = { ...ref, selector: ".a", state: "board:notARealFixture" };
  const twinInvalid = { ...ref, selector: ".b", state: "board:notARealFixture" };
  const listBody = (items: unknown[]) => `## Shots\n\n${FENCED(JSON.stringify(items))}`;
  const keptEntries = (content: string) =>
    JSON.parse(content.match(/```json\n([\s\S]*?)\n```/)![1]!) as unknown[];

  it("removes only the edited invalid entry when a twin shares label/route/target", () => {
    const { content, removed, errors } = removeDeclarationsForDeletedShot(
      listBody([editedInvalid, twinInvalid]),
      ref,
      stored,
    );
    expect(errors).toEqual([]);
    expect(removed).toBe(1);
    expect(keptEntries(content)).toEqual([twinInvalid]);
  });

  it("uses steps to distinguish invalid twins when their other fields match", () => {
    const captured = {
      ...ref,
      selector: ".same",
      steps: [{ click: ".captured" }],
      state: "board:withReviewTask",
    };
    const edited = { ...captured, state: "board:notARealFixture" };
    const twin = {
      ...captured,
      steps: [{ click: ".twin" }],
      state: "board:notARealFixture",
    };
    const { content, removed, errors } = removeDeclarationsForDeletedShot(
      listBody([edited, twin]),
      ref,
      captured,
    );
    expect(errors).toEqual([]);
    expect(removed).toBe(1);
    expect(keptEntries(content)).toEqual([twin]);
  });

  it("removes the lone invalid entry after a post-capture edit (no twin)", () => {
    const { content, removed } = removeDeclarationsForDeletedShot(
      listBody([{ ...ref, state: "board:notARealFixture" }]),
      ref,
      { ...ref, selector: ".drawer" },
    );
    expect(removed).toBe(1);
    expect(keptEntries(content)).toEqual([]);
  });

  it("removes nothing when two invalid twins tie for closest (ambiguous)", () => {
    const twinB = { ...ref, selector: ".b", state: "board:notARealFixture" };
    const twinC = { ...ref, selector: ".c", state: "board:notARealFixture" };
    // The stored declaration matches neither exactly, and both twins are
    // equidistant from it (state is unscored, each differs only in selector),
    // so there is no single selected entry to remove.
    const { content, removed } = removeDeclarationsForDeletedShot(listBody([twinB, twinC]), ref, {
      ...ref,
      selector: ".a",
    });
    expect(removed).toBe(0);
    expect(content).toBe("");
  });

  it("still removes every shallow match for a legacy shot with no stored declaration", () => {
    const { content, removed } = removeDeclarationsForDeletedShot(
      listBody([editedInvalid, twinInvalid]),
      ref,
    );
    expect(removed).toBe(2);
    expect(keptEntries(content)).toEqual([]);
  });

  it("removes THE exact valid entry when the shot carries its declaration", () => {
    const other = { ...ref, selector: ".other" };
    const { content, removed } = removeDeclarationsForDeletedShot(
      listBody([other, stored]),
      ref,
      stored,
    );
    expect(removed).toBe(1);
    expect(keptEntries(content)).toEqual([other]);
  });

  it("leaves a VALID re-stated entry behind when only its state was edited (#0778 review)", () => {
    // Post-capture, the user corrected a declaration's state fixture to
    // another VALID one and then deleted that capture. The stored declaration
    // is the state the capture ran WITH, so the edited entry is structurally
    // not the shot that was removed — and it cannot be attributed safely: a
    // twin that differs only in state is a declaration for a DIFFERENT
    // capture, and dropping it would delete the wrong entry. The conservative
    // call is to keep the stale declaration: its image delete still succeeds,
    // the kept entry is valid so it just re-captures (its NEW state) on the
    // next handoff, and the user trims it by hand. Locked here so the intent
    // is explicit, not accidental — unlike the invalid-state case above, raw
    // closeness never runs for an entry that still parses.
    const captured = { ...ref, selector: ".a", state: "closeOut:active" };
    const restated = { ...captured, state: "card:doneError" };
    const { content, removed, errors } = removeDeclarationsForDeletedShot(
      listBody([restated]),
      ref,
      captured,
    );
    expect(errors).toEqual([]);
    expect(removed).toBe(0);
    expect(keptEntries(content)).toEqual([restated]);
  });
});
