/**
 * Task drawer → Stories panel deep links (#0553).
 */
import { describe, expect, it } from "vitest";
import { storyDeepLinkRef, storyOpenLabel } from "../src/lib/story-deep-link";
import type { StoryDefinitionRecord } from "../src/types";

const alphaDef: StoryDefinitionRecord = {
  key: "alpha slice",
  name: "Alpha slice",
  number: "0001",
  path: "stories/alpha-slice.md",
  body: "Scope.",
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "human",
};

describe("story deep link helpers (#0553)", () => {
  it("links registered stories by number", () => {
    expect(storyDeepLinkRef("Alpha slice", [alphaDef])).toBe("0001");
    expect(storyOpenLabel("Alpha slice", [alphaDef])).toBe('Open story "Alpha slice" (#0001)');
  });

  it("links tag-only stories by key", () => {
    expect(storyDeepLinkRef("Tag only", [])).toBe("tag only");
    expect(storyOpenLabel("Tag only", [])).toBe('Open story "Tag only"');
  });

  it("links definition records without a number by key", () => {
    const { number: _number, ...numberless } = alphaDef;
    expect(storyDeepLinkRef("  Alpha   slice  ", [numberless])).toBe("alpha slice");
    expect(storyOpenLabel("Alpha slice", [numberless])).toBe('Open story "Alpha slice"');
  });

  it("returns empty ref and label when no story is assigned", () => {
    expect(storyDeepLinkRef("", [alphaDef])).toBe("");
    expect(storyDeepLinkRef("   ", [alphaDef])).toBe("");
    expect(storyOpenLabel("", [alphaDef])).toBe("");
  });

  it("links by key when the definition record has no number yet", () => {
    const pending: StoryDefinitionRecord = { ...alphaDef, number: undefined };
    expect(storyDeepLinkRef("Alpha slice", [pending])).toBe("alpha slice");
    expect(storyOpenLabel("Alpha slice", [pending])).toBe('Open story "Alpha slice"');
  });

  it("normalizes internal whitespace in tag-only keys", () => {
    expect(storyDeepLinkRef("Tag   with   gaps", [])).toBe("tag with gaps");
    expect(storyOpenLabel("Tag   with   gaps", [])).toBe('Open story "Tag with gaps"');
  });
});
