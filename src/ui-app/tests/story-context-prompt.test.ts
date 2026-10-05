/**
 * The engineer and reviewer prompts carry a "Story context" block when a task
 * is tagged with a story that has a definition file (#0691): the story title,
 * the path to its definition, the sibling tasks, and a bounded excerpt. It is
 * omitted when there is no story, or when the tag names no definition file —
 * and its excerpt size is configurable.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import {
  DEFAULT_STORY_EXCERPT_BYTES,
  buildStoryContext,
  excerptStoryBody,
  storyContextSummary,
  storyExcerptBytes,
} from "../../core/story-context";
import { missionFor } from "../../server/agents";
import { reviewMission } from "../../server/review";

const WORKDIR = "/Users/nick/code/nick/repoos-worktrees/feat/0691-story-context";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-story-context-"));
  dirs.push(root);
  return root;
}

function config(root: string, overrides: Partial<RepoOSConfig> = {}): RepoOSConfig {
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
    ...overrides,
  };
}

function writeStory(root: string, file: string, name: string, body: string): void {
  mkdirSync(join(root, "stories"), { recursive: true });
  writeFileSync(
    join(root, "stories", file),
    `---\nname: ${name}\nnumber: "0007"\n---\n${body}\n`,
    "utf8",
  );
}

function writeTaskFile(
  root: string,
  file: string,
  fields: { id: string; title: string; status: string; story?: string },
): void {
  mkdirSync(join(root, "work"), { recursive: true });
  const storyLine = fields.story ? `story: ${fields.story}\n` : "";
  writeFileSync(
    join(root, "work", file),
    `---\nid: "${fields.id}"\ntitle: ${fields.title}\nstatus: ${fields.status}\n${storyLine}---\nBody.\n`,
    "utf8",
  );
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "0691",
    title: "Include the story context",
    type: "feature",
    status: "active",
    priority: "p3",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/0691-story-context",
    tags: [],
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    created_at: null,
    updated_at: null,
    path: "work/0691-story-context.md",
    absPath: "/tmp/work/0691-story-context.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...overrides,
  };
}

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };
const reviewer: Agent = { name: "reviewer", cli: "qwen code", model: "default", enabled: true };

describe("buildStoryContext", () => {
  it("includes the story title, path, siblings and definition excerpt", () => {
    const root = tempRoot();
    writeStory(root, "field-report.md", "Field report", "The shared background for the run.");
    writeTaskFile(root, "0001-a.md", {
      id: "0001",
      title: "First sibling",
      status: "done",
      story: "Field report",
    });
    writeTaskFile(root, "0002-b.md", {
      id: "0002",
      title: "Second sibling",
      status: "active",
      story: "Field report",
    });

    const block = buildStoryContext(task({ story: "Field report" }), config(root));

    expect(block).toBeTruthy();
    expect(block).toContain("## Story context");
    expect(block).toContain("#0007 — Field report");
    expect(block).toContain("stories/field-report.md");
    expect(block).toContain("#0001 First sibling (done)");
    expect(block).toContain("#0002 Second sibling (active)");
    // The task itself is never listed as its own sibling.
    expect(block).not.toContain("#0691");
    expect(block).toContain("The shared background for the run.");
  });

  it("matches the tag case-insensitively and ignores tasks in other stories", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Body.");
    writeTaskFile(root, "0003-c.md", {
      id: "0003",
      title: "Same story",
      status: "ready",
      story: "  slice  ",
    });
    writeTaskFile(root, "0004-d.md", {
      id: "0004",
      title: "Other story",
      status: "ready",
      story: "Something else",
    });

    const block = buildStoryContext(task({ story: "SLICE" }), config(root));

    expect(block).toContain("#0003 Same story");
    expect(block).not.toContain("#0004");
  });

  it("bounds a long definition and points the agent at the file", () => {
    const root = tempRoot();
    const long = Array.from({ length: 400 }, (_, i) => `Line ${i} of a very long story.`).join(
      "\n",
    );
    writeStory(root, "long.md", "Long story", long);

    const block = buildStoryContext(task({ story: "Long story" }), config(root));

    expect(block).toBeTruthy();
    expect(block).toContain(`first ${DEFAULT_STORY_EXCERPT_BYTES} bytes`);
    expect(block).toContain("read the file for the rest");
    expect(block).not.toContain("Line 399 of a very long story.");
  });

  it("omits the block when the task has no story", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Body.");
    expect(buildStoryContext(task({ story: "" }), config(root))).toBeNull();
    expect(buildStoryContext(task({ story: undefined }), config(root))).toBeNull();
  });

  it("omits the block for a tag-only story with no definition file", () => {
    const root = tempRoot();
    writeTaskFile(root, "0005-e.md", {
      id: "0005",
      title: "Tag only",
      status: "ready",
      story: "Unregistered slice",
    });
    expect(buildStoryContext(task({ story: "Unregistered slice" }), config(root))).toBeNull();
  });

  it("honors the configured excerpt size", () => {
    const root = tempRoot();
    const body = Array.from({ length: 200 }, (_, i) => `Detail line number ${i}.`).join("\n");
    writeStory(root, "slice.md", "Slice", body);

    const small = buildStoryContext(
      task({ story: "Slice" }),
      config(root, { stories: { enabled: true, excerptBytes: 1024 } }),
    );
    expect(small).toContain("first 1024 bytes");
    expect(small).not.toContain("Detail line number 199.");
  });
});

describe("storyExcerptBytes", () => {
  it("defaults to a few KB and clamps out-of-range values", () => {
    expect(storyExcerptBytes({ stories: { enabled: true } })).toBe(DEFAULT_STORY_EXCERPT_BYTES);
    expect(storyExcerptBytes({ stories: { enabled: true, excerptBytes: 0 } })).toBe(512);
    expect(storyExcerptBytes({ stories: { enabled: true, excerptBytes: 10 * 1024 * 1024 } })).toBe(
      64 * 1024,
    );
    expect(storyExcerptBytes({})).toBe(DEFAULT_STORY_EXCERPT_BYTES);
  });
});

describe("excerptStoryBody", () => {
  it("returns a short body unchanged and cuts a long one on a line boundary", () => {
    expect(excerptStoryBody("Short.", 4096)).toBe("Short.");
    const cut = excerptStoryBody("aaaa\nbbbb\ncccc", 10);
    expect(cut.startsWith("aaaa\nbbbb")).toBe(true);
    expect(cut).toContain("truncated at 10 bytes");
    expect(Buffer.byteLength(cut.split("\n\n[Story definition")[0], "utf8")).toBeLessThanOrEqual(
      10,
    );
  });
});

describe("storyContextSummary", () => {
  it("names the story for an activity entry, and stays silent without one", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Body.");
    expect(storyContextSummary(task({ story: "Slice" }), config(root))).toContain('"Slice"');
    expect(storyContextSummary(task({ story: "Missing" }), config(root))).toBeNull();
  });
});

describe("prompt builders", () => {
  it("adds the story block to the engineer mission", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Engineer-visible background.");
    const cfg = config(root);

    const mission = missionFor(
      task({ story: "Slice" }),
      "feat/0691-story-context",
      WORKDIR,
      agent,
      cfg,
    );

    expect(mission).toContain("## Story context");
    expect(mission).toContain("Engineer-visible background.");
    expect(mission).toContain("stories/slice.md");
  });

  it("adds the story block to the reviewer mission", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Reviewer-visible background.");
    const cfg = config(root);

    const mission = reviewMission(task({ story: "Slice" }), reviewer, WORKDIR, "main", cfg);

    expect(mission).toContain("## Story context");
    expect(mission).toContain("Reviewer-visible background.");
  });

  it("leaves an untagged engineer mission unchanged", () => {
    const root = tempRoot();
    writeStory(root, "slice.md", "Slice", "Body.");
    const cfg = config(root);

    const mission = missionFor(task({ story: "" }), "feat/0691-story-context", WORKDIR, agent, cfg);

    expect(mission).not.toContain("## Story context");
  });
});
