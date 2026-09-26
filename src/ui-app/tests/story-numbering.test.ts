/**
 * Story numbering (#0515): every registered story carries a stable, zero-padded
 * 4-digit `number` — the story counterpart to a task's `id` and an input's
 * `number`, and the thing its `#0007` chip and `?story=0007` deeplink are built
 * from. New stories get the next number at creation; stories written before the
 * field existed are backfilled in place by `ensureStoryNumbers`, which is
 * idempotent and never renumbers or reuses a retired number.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "../../core/repoos";
import {
  ensureStoryNumbers,
  listStoryDefinitions,
  rewriteStoryDefinition,
  writeStoryDefinition,
} from "../../core/story-definition-files";
import { storyPmSessionId, storyPmSessionSlug } from "../../core/stories";
import { mergeStoriesForDisplay } from "../../core/story-display";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repoos-story-number-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a story file by hand to simulate one captured before numbering existed. */
function rawStory(name: string, createdAt: string, extra = ""): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = join(root, "stories", `${slug}.md`);
  mkdirSync(join(root, "stories"), { recursive: true });
  writeFileSync(
    path,
    [
      "---",
      `name: ${name}`,
      ...(extra ? [extra] : []),
      `created_at: "${createdAt}"`,
      'created_by: "human"',
      "---",
      "",
      "Scope for later.",
      "",
    ].join("\n"),
  );
  return `stories/${slug}.md`;
}

describe("story numbering (#0515)", () => {
  it("assigns 0001 to the first story and persists the number in frontmatter", () => {
    const config = createRepoOS(root).config;
    const story = writeStoryDefinition(config, {
      name: "Project Updates",
      body: "Ship the email list.",
      createdBy: "hello@repoos.org",
    });

    expect(story.number).toBe("0001");
    const raw = readFileSync(join(root, story.path), "utf8");
    expect(raw).toMatch(/^number: "0001"$/m);
    expect(listStoryDefinitions(config)[0].number).toBe("0001");
  });

  it("assigns the next number to each new story", () => {
    const config = createRepoOS(root).config;
    writeStoryDefinition(config, { name: "First slice", body: "One." });
    writeStoryDefinition(config, { name: "Second slice", body: "Two." });

    const numbers = listStoryDefinitions(config)
      .map((d) => d.number)
      .sort();
    expect(numbers).toEqual(["0001", "0002"]);
  });

  it("backfills existing stories in place, oldest first, and is idempotent", () => {
    const config = createRepoOS(root).config;
    rawStory("Newer slice", "2026-01-02T00:00:00Z");
    rawStory("Older slice", "2026-01-01T00:00:00Z");

    expect(ensureStoryNumbers(config)).toHaveLength(2);

    const byName = new Map(listStoryDefinitions(config).map((d) => [d.name, d.number]));
    expect(byName.get("Older slice")).toBe("0001");
    expect(byName.get("Newer slice")).toBe("0002");

    // Second run touches nothing.
    expect(ensureStoryNumbers(config)).toEqual([]);
    const after = new Map(listStoryDefinitions(config).map((d) => [d.name, d.number]));
    expect(after.get("Older slice")).toBe("0001");
    expect(after.get("Newer slice")).toBe("0002");
  });

  it("does not renumber stories that already have a number", () => {
    const config = createRepoOS(root).config;
    rawStory("Numbered", "2026-01-01T00:00:00Z", 'number: "0042"');
    rawStory("Unnumbered", "2026-01-02T00:00:00Z");

    ensureStoryNumbers(config);

    const byName = new Map(listStoryDefinitions(config).map((d) => [d.name, d.number]));
    expect(byName.get("Numbered")).toBe("0042");
    expect(byName.get("Unnumbered")).toBe("0043");
  });

  it("does not reuse a retired number after a story is deleted", () => {
    const config = createRepoOS(root).config;
    const first = writeStoryDefinition(config, { name: "First slice", body: "One." });
    writeStoryDefinition(config, { name: "Second slice", body: "Two." });
    rmSync(join(root, first.path));

    const next = writeStoryDefinition(config, { name: "Third slice", body: "Three." });
    expect(next.number).toBe("0003");
  });

  it("keeps the number when the PM agent renames the story and its file", () => {
    const config = createRepoOS(root).config;
    const original = writeStoryDefinition(config, { name: "Placeholder", body: "Rough." });

    // Exactly what `fleshOutStory` does when the PM proposes a real name that
    // slugs differently — the deeplinks already handed out must survive it.
    const { definition, previousPath } = rewriteStoryDefinition(config, original.path, {
      name: "Project updates email",
      body: "The real scope.",
    });

    expect(definition.number).toBe("0001");
    expect(definition.name).toBe("Project updates email");
    expect(previousPath).toBe(original.path);
    expect(readFileSync(join(root, definition.path), "utf8")).toMatch(/^number: "0001"$/m);
  });

  it("normalizes an unpadded or non-numeric frontmatter number", () => {
    const config = createRepoOS(root).config;
    rawStory("Padded", "2026-01-01T00:00:00Z", 'number: "7"');
    rawStory("Garbage", "2026-01-02T00:00:00Z", 'number: "not-a-number"');

    // "7" normalizes to the canonical 4-digit form; the garbage one is treated
    // as "needs a number" rather than rendered as a broken chip.
    expect(listStoryDefinitions(config).find((d) => d.name === "Padded")!.number).toBe("0007");
    expect(listStoryDefinitions(config).find((d) => d.name === "Garbage")!.number).toBe("");

    const changed = ensureStoryNumbers(config);
    expect(changed).toHaveLength(1);
    const byName = new Map(listStoryDefinitions(config).map((d) => [d.name, d.number]));
    expect(byName.get("Padded")).toBe("0007");
    expect(byName.get("Garbage")).toBe("0008");
  });

  it("surfaces the number on the merged roll-up, and leaves tag-only stories null", () => {
    const config = createRepoOS(root).config;
    writeStoryDefinition(config, { name: "Registered", body: "Scope." });
    const merged = mergeStoriesForDisplay(
      [
        { story: "Registered", status: "ready" },
        { story: "Tag only", status: "ready" },
      ],
      listStoryDefinitions(config),
    );

    expect(merged.find((s) => s.name === "Registered")!.number).toBe("0001");
    // A story that exists only as a task tag has no file to hold a number, so
    // the board has nothing stable to show or deep-link.
    const tagOnly = merged.find((s) => s.name === "Tag only")!;
    expect(tagOnly.registered).toBe(false);
    expect(tagOnly.number).toBeNull();
  });
});

describe("story PM session ids (#0515)", () => {
  it("keys a registered story by its number, like a task PM chat", () => {
    expect(storyPmSessionId("project updates email", "0042")).toBe("pm-story-v1:0042");
  });

  it("falls back to a filename-safe slug for a story with no definition file", () => {
    expect(storyPmSessionId("Project Updates: Email!", null)).toBe(
      "pm-story-v1:project-updates-email",
    );
    expect(storyPmSessionSlug("///")).toBe("story");
  });

  it("scopes per user when auth is on, exactly like the task PM chat", () => {
    expect(storyPmSessionId("slice", "0007", "a@example.com")).toBe(
      "pm-story-v1:0007::a@example.com",
    );
  });
});
