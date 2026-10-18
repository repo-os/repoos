import { describe, expect, it } from "vitest";
import {
  appendBundleItem,
  applyBundleBodyMutation,
  assertEasterEggsBundleTitle,
  EasterEggsBundleError,
  editBundleItemSubsection,
  nextBundleItemId,
  setBundleItemChecked,
} from "../../core/easter-eggs-bundle";

const BUNDLE_TITLE = "Easter eggs bundle: example themes";

const TWO_ITEM_BODY = `## Items

- [ ] **E1 · First item** (web) — fix one. Source: #0001.
- [ ] **E2 · Second item** (web) — fix two. Source: #0002.

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with \`--section\`; never resend the whole body.

## E1 · First item

### Problem
One.

### Desired UX
UX one.

### Acceptance criteria
- Test: one

### Notes for AI
Notes one.

## E2 · Second item

### Problem
Two.

### Acceptance criteria
- Test: two

### Notes for AI
Notes two.

## Activity

- 2026-01-01T00:00:00Z · created
`;

describe("easter-eggs bundle mutations (#0824)", () => {
  it("add appends one list line and one section; other bytes unchanged", () => {
    const before = TWO_ITEM_BODY;
    const after = appendBundleItem(before, {
      title: "Third item",
      area: "docs",
      fix: "fix three",
      source: "#0003",
      test: "third test",
    });
    expect(nextBundleItemId(before)).toBe(3);
    expect(after).toContain("**E3 · Third item** (docs) — fix three. Source: #0003.");
    expect(after).toContain("## E3 · Third item");
    expect(after).toContain("- Test: third test");
    const prefix = before.slice(0, before.indexOf("## Activity"));
    expect(after.startsWith(prefix)).toBe(true);
    expect(after.endsWith(before.slice(before.indexOf("## Activity")))).toBe(true);
    expect((after.match(/\*\*E1 ·/g) ?? []).length).toBe(1);
    expect((after.match(/\*\*E2 ·/g) ?? []).length).toBe(1);
  });

  it("ids increment and never reuse after E1 is removed from the list only", () => {
    const body = appendBundleItem(TWO_ITEM_BODY, {
      title: "Third",
      area: "web",
      fix: "f",
      source: "human",
    });
    expect(nextBundleItemId(body)).toBe(4);
  });

  it("done and undo toggle only the target checkbox", () => {
    const done = setBundleItemChecked(TWO_ITEM_BODY, "E2", true);
    expect(done).toContain("- [x] **E2 · Second item**");
    expect(done).toContain("- [ ] **E1 · First item**");
    const undone = setBundleItemChecked(done, "E2", false);
    expect(undone).toContain("- [ ] **E2 · Second item**");
  });

  it("errors clearly on unknown item id", () => {
    expect(() => setBundleItemChecked(TWO_ITEM_BODY, "E9", true)).toThrow(EasterEggsBundleError);
    expect(() => setBundleItemChecked(TWO_ITEM_BODY, "E9", true)).toThrow(/E9/);
    expect(() => editBundleItemSubsection(TWO_ITEM_BODY, "E9", "Problem", "nope")).toThrow(/E9/);
  });

  it("refuses non-bundle titles unless force", () => {
    expect(() =>
      applyBundleBodyMutation("Regular task title", TWO_ITEM_BODY, {
        action: "done",
        item: "E1",
      }),
    ).toThrow(/easter-eggs bundle/);
    const forced = applyBundleBodyMutation("Regular task title", TWO_ITEM_BODY, {
      action: "done",
      item: "E1",
      force: true,
    });
    expect(forced).toContain("- [x] **E1 ·");
  });

  it("assertEasterEggsBundleTitle matches the prefix", () => {
    expect(() => assertEasterEggsBundleTitle(BUNDLE_TITLE)).not.toThrow();
    expect(() => assertEasterEggsBundleTitle("Not a bundle")).toThrow(EasterEggsBundleError);
  });

  it("edit replaces one subsection inside an item", () => {
    const out = editBundleItemSubsection(TWO_ITEM_BODY, "E1", "Desired UX", "Updated UX.");
    expect(out).toContain("### Desired UX\nUpdated UX.");
    expect(out).not.toContain("UX one.");
    expect(out.indexOf("Updated UX.")).toBeLessThan(out.indexOf("## E2"));
  });
});
