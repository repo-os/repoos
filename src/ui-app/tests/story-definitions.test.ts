/**
 * Story definition files + merge with task-derived roll-ups (#0486).
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import {
  collisionFreeStoryPath,
  findStoryDefinitionByKey,
  listStoryDefinitions,
  parseGeneratedStoryDefinition,
  rewriteStoryDefinition,
  storyFreeformPrompt,
  writeStoryDefinition,
} from "../../core/story-definition-files";
import { mergeStoriesForDisplay } from "../../core/story-display";
import { sortStoryGroupsForPage, storyKey } from "../../core/stories";

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

  it("honors a custom storiesDir config value (#0637)", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-dir-"));
    try {
      const c = { ...config(root), storiesDir: "epics" };
      const def = writeStoryDefinition(c, {
        name: "Custom slice",
        body: "Lives elsewhere.",
        createdBy: "hello@repoos.org",
      });
      expect(def.path).toMatch(/^epics\/.+\.md$/);
      expect(readFileSync(join(root, def.path), "utf8")).toContain("name: Custom slice");
      expect(findStoryDefinitionByKey(c, storyKey("custom slice"))?.name).toBe("Custom slice");
      // Collision paths are prefixed with the configured directory too.
      expect(collisionFreeStoryPath(c, "Custom slice")).toMatch(/^epics\//);
      // ...and a definition path outside the configured directory is refused.
      expect(() =>
        writeStoryDefinition(c, { name: "Other", body: "x", path: "stories/other.md" }),
      ).toThrow(/invalid story definition path/);
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
          number: "0001",
          path: "stories/tagged-slice.md",
          body: "Registered body",
          createdAt: "2026-09-01T00:00:00Z",
          createdBy: "a",
        },
        {
          key: storyKey("Planned only"),
          name: "Planned only",
          number: "0002",
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

  it("carries the definition's path and authorship for the side panel's Details tab", () => {
    const merged = mergeStoriesForDisplay(
      [{ story: "Tagged slice", status: "ready" }],
      [
        {
          key: storyKey("Tagged slice"),
          name: "Tagged slice",
          number: "0001",
          path: "stories/tagged-slice.md",
          body: "Registered body",
          createdAt: "2026-09-01T00:00:00Z",
          createdBy: "hello@repoos.org",
        },
      ],
    );
    expect(merged[0].path).toBe("stories/tagged-slice.md");
    expect(merged[0].number).toBe("0001");
    expect(merged[0].createdAt).toBe("2026-09-01T00:00:00Z");
    expect(merged[0].createdBy).toBe("hello@repoos.org");
  });

  it("nulls the definition metadata for a story that exists only as a task tag", () => {
    const merged = mergeStoriesForDisplay([{ story: "Tag only", status: "ready" }], []);
    expect(merged[0].registered).toBe(false);
    expect(merged[0].path).toBeNull();
    expect(merged[0].number).toBeNull();
    expect(merged[0].createdAt).toBeNull();
    expect(merged[0].createdBy).toBeNull();
  });

  it("preserves the caller's member-task type through the merge (#0502)", () => {
    const merged = mergeStoriesForDisplay(
      [{ story: "Tagged slice", status: "ready", marker: "kept" as const }],
      [],
    );
    // The panel navigates to these objects, so the extra field must survive
    // rather than being widened away to the structural minimum.
    expect(merged[0].tasks[0].marker).toBe("kept");
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

describe("story definition last-modified time (#0885)", () => {
  it("records updated_at on create, and bumps it on rewrite", () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), "repoos-story-updated-"));
    try {
      const c = config(root);
      vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
      const first = writeStoryDefinition(c, {
        name: "Agent-discoverable RepoOS",
        body: "Scope.",
        createdBy: "hello@repoos.org",
      });
      expect(first.updatedAt).toBe("2026-10-01T09:00:00.000Z");
      expect(readFileSync(join(root, first.path), "utf8")).toContain(
        'updated_at: "2026-10-01T09:00:00.000Z"',
      );

      // A later edit must move the story's own timestamp, without touching
      // created_at — this is what "most recently updated" sorts on.
      vi.setSystemTime(new Date("2026-10-20T16:00:00Z"));
      const { definition } = rewriteStoryDefinition(c, first.path, {
        name: first.name,
        body: "Edited scope.",
      });
      expect(definition.createdAt).toBe("2026-10-01T09:00:00.000Z");
      expect(definition.updatedAt).toBe("2026-10-20T16:00:00.000Z");
      expect(listStoryDefinitions(c)[0]!.updatedAt).toBe("2026-10-20T16:00:00.000Z");
    } finally {
      vi.useRealTimers();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the file mtime when an older story has no updated_at", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-story-mtime-"));
    try {
      const c = config(root);
      mkdirSync(join(root, "stories"), { recursive: true });
      writeFileSync(
        join(root, "stories", "legacy.md"),
        '---\nname: Legacy\nnumber: "0007"\ncreated_at: "2026-01-01T00:00:00Z"\ncreated_by: "a"\n---\n\nOld.\n',
      );
      const [def] = listStoryDefinitions(c);
      expect(def!.createdAt).toBe("2026-01-01T00:00:00Z");
      expect(def!.updatedAt).toBeTruthy();
      // The fallback is newer than the 2026-01-01 creation stamp, so an old
      // file touched today still orders above one never touched.
      expect(def!.updatedAt! > def!.createdAt).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("carries the definition change into the merged roll-up for recency sorting", () => {
    const merged = mergeStoriesForDisplay(
      [],
      [
        {
          key: storyKey("Fresh"),
          name: "Fresh",
          number: "0011",
          path: "stories/fresh.md",
          body: "",
          createdAt: "2026-10-20T15:00:00Z",
          updatedAt: "2026-10-20T16:00:00Z",
          createdBy: "a",
        },
      ],
    );
    expect(merged[0]!.definitionUpdatedAt).toBe("2026-10-20T16:00:00Z");
  });

  it("puts a story created later first by recency even when its number is smaller", () => {
    // The reported shape: #0011 was created earlier; #0001 was created later.
    // "Most recently updated" follows the timestamps, not the number, while
    // the number sorts still compare the numbers themselves (1 < 11).
    const merged = mergeStoriesForDisplay(
      [],
      [
        {
          key: storyKey("Older larger number"),
          name: "Older larger number",
          number: "0011",
          path: "stories/older.md",
          body: "",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
          createdBy: "a",
        },
        {
          key: storyKey("Newer smaller number"),
          name: "Newer smaller number",
          number: "0001",
          path: "stories/newer.md",
          body: "",
          createdAt: "2026-10-20T16:00:00Z",
          updatedAt: "2026-10-20T16:00:00Z",
          createdBy: "a",
        },
      ],
    );

    expect(sortStoryGroupsForPage(merged, "recent").map((g) => g.name)).toEqual([
      "Newer smaller number",
      "Older larger number",
    ]);
    expect(
      sortStoryGroupsForPage(merged, "taskNumberNewest", (g) => g.number).map((g) => g.name),
    ).toEqual(["Older larger number", "Newer smaller number"]);
    expect(
      sortStoryGroupsForPage(merged, "taskNumberOldest", (g) => g.number).map((g) => g.name),
    ).toEqual(["Newer smaller number", "Older larger number"]);
  });
});
