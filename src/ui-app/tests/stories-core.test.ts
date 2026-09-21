/**
 * Stories core (#0480): the optional `story` frontmatter field and the pure
 * grouping/ordering helpers behind the Stories page. A story is derived
 * entirely from its tagged tasks — no file, status or store of its own.
 */
import { describe, expect, it } from "vitest";
import {
  deriveStories,
  groupTasksByStory,
  normalizeStoryName,
  sortStories,
  storyKey,
  type StoryTaskLike,
} from "../../core/stories";
import { parseTask, serializeTask } from "../../core/task";
import type { Task } from "../../core/types";

function parse(content: string): Task {
  return parseTask({
    content,
    absPath: "/tmp/repo/work/0001-x.md",
    root: "/tmp/repo",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

const task = (over: Partial<StoryTaskLike> = {}): StoryTaskLike => ({
  status: "ready",
  needsInput: false,
  updated_at: null,
  ...over,
});

describe("story name normalization", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeStoryName("  Email   launch ")).toBe("Email launch");
    expect(normalizeStoryName("Email\tlaunch")).toBe("Email launch");
  });

  it("rejects non-strings and empties", () => {
    expect(normalizeStoryName(undefined)).toBe("");
    expect(normalizeStoryName(null)).toBe("");
    expect(normalizeStoryName(123)).toBe("");
    expect(normalizeStoryName({ name: "x" })).toBe("");
    expect(normalizeStoryName("   ")).toBe("");
  });

  it("keys case-insensitively and whitespace-insensitively", () => {
    expect(storyKey(" Project  Updates Email ")).toBe(storyKey("project updates email"));
  });
});

describe("parseTask / serializeTask story field", () => {
  it("normalizes a whitespace-padded story on read", () => {
    const t = parse(`---\nid: "0001"\ntitle: T\nstory: "  Email   launch "\n---\n`);
    expect(t.story).toBe("Email launch");
  });

  it("treats a task with no story as untagged (empty string)", () => {
    const t = parse(`---\nid: "0001"\ntitle: T\n---\n`);
    expect(t.story).toBe("");
  });

  it("round-trips a story and preserves unknown legacy frontmatter", () => {
    const t = parse(
      `---\nid: "0001"\ntitle: T\nstory: Project updates email\nlegacy_field: keep me\n---\nBody\n`,
    );
    const text = serializeTask(t);
    expect(text).toContain("story: Project updates email");
    expect(text).toContain("legacy_field: keep me");
    const reparsed = parse(text);
    expect(reparsed.story).toBe("Project updates email");
    expect(reparsed.extra.legacy_field).toBe("keep me");
  });

  it("omits the key entirely when no story is set", () => {
    const t = parse(`---\nid: "0001"\ntitle: T\n---\n`);
    expect(serializeTask(t)).not.toContain("story:");
  });
});

describe("groupTasksByStory", () => {
  it("drops untagged tasks and groups case-insensitively", () => {
    const groups = groupTasksByStory([
      task({ story: "Project updates email", status: "done" }),
      task({ story: "project updates email", status: "active" }),
      task({ story: "Project Updates Email", status: "ready" }),
      task({ story: "" }),
      task({}),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(3);
    expect(groups[0].done).toBe(1);
    expect(groups[0].active).toBe(1);
  });

  it("retains a stable display name across differing spellings", () => {
    const groups = groupTasksByStory([
      task({ story: "email launch" }),
      task({ story: "Email Launch" }),
      task({ story: "Email Launch" }),
    ]);
    expect(groups[0].name).toBe("Email Launch");
  });

  it("derives completion only when every task is done", () => {
    const open = groupTasksByStory([
      task({ story: "S", status: "done" }),
      task({ story: "S", status: "review" }),
    ]);
    expect(open[0].complete).toBe(false);
    const closed = groupTasksByStory([
      task({ story: "S", status: "done" }),
      task({ story: "S", status: "done" }),
    ]);
    expect(closed[0].complete).toBe(true);
  });

  it("counts attention and tracks the most recent activity", () => {
    const [group] = groupTasksByStory([
      task({ story: "S", status: "active", needsInput: true, updated_at: "2026-09-01T00:00:00Z" }),
      task({ story: "S", status: "review", updated_at: "2026-09-03T00:00:00Z" }),
    ]);
    expect(group.attention).toBe(1);
    expect(group.review).toBe(1);
    expect(group.lastActivity).toBe("2026-09-03T00:00:00Z");
  });
});

describe("sortStories ordering", () => {
  it("puts attention first, then active work, then the rest, with completed last", () => {
    const groups = groupTasksByStory([
      task({ story: "Complete", status: "done", updated_at: "2026-09-05T00:00:00Z" }),
      task({ story: "Quiet", status: "ready", updated_at: "2026-09-04T00:00:00Z" }),
      task({ story: "Active", status: "active", updated_at: "2026-09-02T00:00:00Z" }),
      task({
        story: "Attention",
        status: "active",
        needsInput: true,
        updated_at: "2026-09-01T00:00:00Z",
      }),
    ]);
    expect(sortStories(groups).map((g) => g.name)).toEqual([
      "Attention",
      "Active",
      "Quiet",
      "Complete",
    ]);
  });

  it("orders within a bucket by most recent activity", () => {
    const stories = deriveStories([
      task({ story: "Older", status: "ready", updated_at: "2026-09-01T00:00:00Z" }),
      task({ story: "Newer", status: "ready", updated_at: "2026-09-09T00:00:00Z" }),
    ]);
    expect(stories.map((g) => g.name)).toEqual(["Newer", "Older"]);
  });
});
