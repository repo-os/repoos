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
  createFreeformStoryDefinition,
  findStoryDefinitionByKey,
  listStoryDefinitions,
  parseGeneratedStoryDefinition,
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

describe("createFreeformStoryDefinition", () => {
  it("falls back to human text when the generator fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-ff-"));
    try {
      const c = config(root);
      const result = await createFreeformStoryDefinition(c, {
        description: "Build the onboarding tour.",
        name: "Onboarding tour",
        createdBy: "hello@repoos.org",
        generator: async () => {
          throw new Error("timeout");
        },
      });
      expect(result.fallback).toBe(true);
      expect(result.definition.name).toBe("Onboarding tour");
      expect(listStoryDefinitions(c)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
