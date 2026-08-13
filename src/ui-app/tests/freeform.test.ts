import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "../../core/frontmatter";
import { createRepoOS } from "../../core/repoos";
import {
  explanationTitle,
  parseGeneratedTask,
  pmPrompt,
} from "../../server/freeform";

describe("parseGeneratedTask", () => {
  it("extracts title, fields, and body from the agent's generated file", () => {
    const out = [
      "---",
      'id: "0001"',
      "title: Make issues editable in the UI",
      "type: feature",
      "priority: p1",
      "area: web",
      "assigned_to: ai",
      "---",
      "",
      "## Problem",
      "",
      "Tasks are read-only.",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Editable fields",
    ].join("\n");
    const parsed = parseGeneratedTask(out);
    expect(parsed.title).toBe("Make issues editable in the UI");
    expect(parsed.type).toBe("feature");
    expect(parsed.priority).toBe("p1");
    expect(parsed.area).toBe("web");
    expect(parsed.assignedTo).toBe("ai");
    expect(parsed.body).toContain("## Acceptance criteria");
    expect(parsed.body).toContain("- [ ] Editable fields");
  });

  it("keeps the raw output as the body when the agent returns no frontmatter", () => {
    const out = "I keep losing my cursor in the editor.";
    const parsed = parseGeneratedTask(out);
    expect(parsed.body).toBe(out);
    expect(parsed.title).toBe("I keep losing my cursor in the editor.");
  });

  it("ignores invalid type/priority values", () => {
    const out = [
      "---",
      "title: Weird task",
      "type: not-a-type",
      "priority: p9",
      "---",
      "",
      "## Problem",
    ].join("\n");
    const parsed = parseGeneratedTask(out);
    expect(parsed.type).toBeUndefined();
    expect(parsed.priority).toBeUndefined();
    expect(parsed.title).toBe("Weird task");
  });

  it("extracts the real title and sections from an unclosed-frontmatter agent output", () => {
    const out = [
      "---",
      "title: Fix the unclosed frontmatter bug",
      "type: bug",
      "priority: p1",
      "area: core",
      "## Problem",
      "",
      "The parser eats the title.",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Real title",
    ].join("\n");
    const parsed = parseGeneratedTask(out);
    expect(parsed.title).toBe("Fix the unclosed frontmatter bug");
    expect(parsed.type).toBe("bug");
    expect(parsed.priority).toBe("p1");
    expect(parsed.area).toBe("core");
    expect(parsed.body).toContain("## Problem");
    expect(parsed.body).toContain("- [ ] Real title");
    expect(parsed.body).not.toContain("---");
  });
});

describe("explanationTitle", () => {
  it("uses the first line of the explanation", () => {
    expect(explanationTitle("make issues editable in the UI\nand draggable")).toBe(
      "make issues editable in the UI",
    );
  });

  it("truncates a long single-line explanation with an ellipsis", () => {
    const long =
      "make issues editable in the UI and also allow reordering them by drag and drop across columns please and thank you";
    const title = explanationTitle(long);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("skips a leading --- delimiter line when picking the title", () => {
    expect(explanationTitle("---\nreal title line\nmore detail")).toBe("real title line");
  });

  it("never returns a literal delimiter even for delimiter-only input", () => {
    expect(explanationTitle("---\n")).toBe("Untitled task");
    expect(explanationTitle("--- ## Problem the parser eats the title")).not.toBe("---");
  });
});

describe("freeform → createTask round-trip (0065)", () => {
  it("writes a clean single-frontmatter file from an unclosed-frontmatter agent output", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-freeform-"));
    try {
      const repoos = createRepoOS(root);
      const out = [
        "---",
        "title: Add per-task agent and model overrides to the task Agent tab and freeform creation",
        "type: feature",
        "priority: p2",
        "area: web",
        "assigned_to: ai",
        "## Problem",
        "",
        "The Agents page locks the defaults.",
        "",
        "## Acceptance criteria",
        "",
        "- [ ] Real title",
      ].join("\n");
      const fields = parseGeneratedTask(out);
      const created = repoos.createTask(fields);
      const content = readFileSync(created.absPath, "utf8");
      const parsed = parseDocument(content);
      expect(parsed.data.title).toBe(
        "Add per-task agent and model overrides to the task Agent tab and freeform creation",
      );
      expect(parsed.data.type).toBe("feature");
      expect(parsed.data.area).toBe("web");
      expect(parsed.body).toContain("## Problem");
      expect(parsed.body).toContain("- [ ] Real title");
      expect(parsed.body).not.toContain("---");
      expect(content.split("---")).toHaveLength(3); // one opening + one closing
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseGeneratedTask with kiro-rendered output (0155)", () => {
  it("parses kiro-cli rendered output with box-drawing delimiters after ANSI stripping", () => {
    // This simulates the output from kiro-cli after ANSI codes have been stripped by runPrompt.
    // The horizontal rule is rendered as box-drawing characters instead of literal ---.
    const out = [
      "> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "id: \"0001\"",
      "title: Add file tree navigation and refresh button to context page",
      "type: feature",
      "priority: p2",
      "area: web",
      "assigned_to: ai",
      "> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "## Problem",
      "",
      "The context page currently lists many docs in a flat layout.",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Replace flat doc list with a collapsible file tree view",
    ].join("\n");
    const parsed = parseGeneratedTask(out);
    expect(parsed.title).toBe("Add file tree navigation and refresh button to context page");
    expect(parsed.type).toBe("feature");
    expect(parsed.priority).toBe("p2");
    expect(parsed.area).toBe("web");
    expect(parsed.assignedTo).toBe("ai");
    expect(parsed.body).toContain("## Problem");
    expect(parsed.body).toContain("- [ ] Replace flat doc list");
  });
});

describe("pmPrompt", () => {
  it("carries the explanation and the task-file conventions", () => {
    const prompt = pmPrompt("make issues editable");
    expect(prompt).toContain("make issues editable");
    expect(prompt).toContain("Acceptance criteria");
    expect(prompt).toContain("assigned_to");
    expect(prompt).toContain("do NOT include");
    expect(prompt).toContain("starting with the opening '---'");
  });
});
