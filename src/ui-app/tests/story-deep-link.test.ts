/**
 * Task drawer → Stories panel deep links (#0553).
 */
import { describe, expect, it } from "vitest";
import { storyDeepLinkRef, storyOpenLabel } from "../src/lib/story-deep-link";
import type { StoryDefinition } from "../../core/story-display";

const alphaDef: StoryDefinition = {
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

  it("returns empty ref and label when no story is assigned", () => {
    expect(storyDeepLinkRef("", [alphaDef])).toBe("");
    expect(storyDeepLinkRef("   ", [alphaDef])).toBe("");
    expect(storyOpenLabel("", [alphaDef])).toBe("");
  });
});
