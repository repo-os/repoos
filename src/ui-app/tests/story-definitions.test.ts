/**
 * Story definition files + merge with task-derived roll-ups (#0486).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import {
  collisionFreeStoryPath,
  findStoryDefinitionByKey,
  parseGeneratedStoryDefinition,
  rewriteStoryDefinition,
  storyFreeformPrompt,
  writeStoryDefinition,
} from "../../core/story-definition-files";
import { mergeStoriesForDisplay } from "../../core/story-display";
import { storyKey } from "../../core/stories";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    stories: { enabled: true },
  };
}

describe("story definition files", () => {
  it("writes a definition under stories/ and rejects duplicates case-insensitively", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-def-"));
    try {
      const c = config(root);
      const first = writeStoryDefinition(c, {
        name: "Project Updates",
        body: "Ship the email list.",
        createdBy: "hello@repoos.org",
      });
      expect(first.path).toMatch(/^stories\/.+\.md$/);
      expect(readFileSync(join(root, first.path), "utf8")).toContain("name: Project Updates");
      expect(findStoryDefinitionByKey(c, storyKey("project updates"))?.name).toBe(
        "Project Updates",
      );
      expect(() =>
        writeStoryDefinition(c, { name: "project updates", body: "Again.", createdBy: "x" }),
      ).toThrow(/already exists/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("picks collision-safe filenames", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-slug-"));
    try {
      const c = config(root);
      mkdirSync(join(root, "stories"), { recursive: true });
      const p1 = collisionFreeStoryPath(c, "Email launch");
      writeStoryDefinition(c, { name: "Email launch", body: "One.", createdBy: "a" });
      const p2 = collisionFreeStoryPath(c, "Email launch");
      expect(p2).not.toBe(p1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("mergeStoriesForDisplay", () => {
  it("includes registered stories with zero tasks and merges by key", () => {
    const merged = mergeStoriesForDisplay(
      [{ story: "Tagged slice", status: "ready", updated_at: "2026-09-01T00:00:00Z" }],
      [
        {
          key: storyKey("Tagged slice"),
          name: "Tagged slice",
          path: "stories/tagged-slice.md",
          body: "Registered body",
          createdAt: "2026-09-01T00:00:00Z",
          createdBy: "a",
        },
        {
          key: storyKey("Planned only"),
          name: "Planned only",
          path: "stories/planned-only.md",
          body: "No tasks yet.",
          createdAt: "2026-09-02T00:00:00Z",
          createdBy: "a",
        },
      ],
    );
    expect(merged).toHaveLength(2);
    const tagged = merged.find((s) => s.name === "Tagged slice")!;
    expect(tagged.total).toBe(1);
    expect(tagged.registered).toBe(true);
    expect(tagged.excerpt).toContain("Registered");
    const planned = merged.find((s) => s.name === "Planned only")!;
    expect(planned.total).toBe(0);
    expect(planned.registered).toBe(true);
  });
});

describe("parseGeneratedStoryDefinition", () => {
  it("requires frontmatter for a successful PM parse", () => {
    const ok = parseGeneratedStoryDefinition(
      "---\nname: Email launch\n---\n\nScope here.",
      "",
      "raw",
    );
    expect(ok.hadFrontmatter).toBe(true);
    expect(ok.name).toBe("Email launch");
    const bad = parseGeneratedStoryDefinition("Just chatting.", "", "raw desc");
    expect(bad.hadFrontmatter).toBe(false);
  });
});

describe("parseGeneratedStoryDefinition task ids", () => {
  it("reads a tasks list, normalizing ids, and unwraps a whole-answer code fence", () => {
    const parsed = parseGeneratedStoryDefinition(
      '```markdown\n---\nname: Mobile\ntasks: ["0297", 302, "#0003"]\n---\n\nScope.\n```',
      "",
      "raw",
    );
    expect(parsed.hadFrontmatter).toBe(true);
    expect(parsed.taskIds).toEqual(["0297", "0302", "0003"]);
  });

  it("keeps the human's name over the PM's proposal", () => {
    const parsed = parseGeneratedStoryDefinition("---\nname: PM name\n---\n\nBody", "Mine", "d");
    expect(parsed.name).toBe("Mine");
  });
});

describe("storyFreeformPrompt", () => {
  it("lists candidate tasks so the PM can pull them into the story", () => {
    const prompt = storyFreeformPrompt("", "Mobile app", [
      { id: "0297", title: "Build a native mobile app", status: "done" },
    ]);
    expect(prompt).toContain("0297 · done · Build a native mobile app");
    expect(prompt).toContain("tasks");
  });
});

describe("rewriteStoryDefinition", () => {
  it("renames the file to the new slug and preserves authorship", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-rw-"));
    try {
      const c = config(root);
      const first = writeStoryDefinition(c, {
        name: "Placeholder text",
        body: "Raw.",
        createdBy: "hello@repoos.org",
      });
      const { definition, previousPath } = rewriteStoryDefinition(c, first.path, {
        name: "Real name",
        body: "Fleshed out.",
      });
      expect(definition.path).toBe("stories/real-name.md");
      expect(previousPath).toBe(first.path);
      expect(definition.createdBy).toBe("hello@repoos.org");
      expect(readFileSync(join(root, definition.path), "utf8")).toContain("Fleshed out.");
      writeStoryDefinition(c, { name: "Taken", body: "x", createdBy: "a" });
      expect(() =>
        rewriteStoryDefinition(c, definition.path, { name: "taken", body: "y" }),
      ).toThrow(/already exists/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
