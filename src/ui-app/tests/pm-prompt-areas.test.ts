/**
 * The PM agent's area guidance (#0583): the vocabulary reaches the prompt, and
 * a PM that answers with a list-valued frontmatter `area` parses fine.
 */
import { describe, expect, it } from "vitest";
import { pmPrompt, parseGeneratedTask } from "../../server/freeform.js";
import { effectiveAreaNames } from "../../core/areas.js";

describe("pmPrompt — the area vocabulary reaches the PM", () => {
  it("lists the declared vocabulary and forbids inventing values", () => {
    const prompt = pmPrompt("fix the thing", ["web", "server", "docs"]);
    expect(prompt).toContain("CHOOSE from: web, server, docs");
    expect(prompt).toContain("proposed new area");
  });

  it("stays generic when no vocabulary is declared", () => {
    expect(pmPrompt("fix the thing")).not.toContain("CHOOSE from");
  });
});

describe("parseGeneratedTask — list-valued area output", () => {
  const OUTPUT = (area: string) =>
    [
      "---",
      'id: "0001"',
      "title: Test task",
      "type: feature",
      "priority: p2",
      `area: ${area}`,
      "---",
      "## Problem",
      "",
      "Broken.",
    ].join("\n");

  it("parses a list-valued area into the comma-joined input", () => {
    const fields = parseGeneratedTask(OUTPUT("[web, server]"));
    expect(fields.hadFrontmatter).toBe(true);
    expect(fields.area).toBe("web, server");
  });

  it("still parses the single-value spelling", () => {
    const fields = parseGeneratedTask(OUTPUT("web"));
    expect(fields.area).toBe("web");
  });

  it("and the legacy `+` spelling", () => {
    const fields = parseGeneratedTask(OUTPUT("web + server"));
    expect(fields.area).toBe("web, server");
  });
});

describe("effectiveAreaNames", () => {
  it("pulls from config and preview targets together", () => {
    expect(
      effectiveAreaNames({
        areas: [{ name: "web" }],
        preview: { targets: [{ name: "t", areas: ["docs"], command: "x" }] },
      }),
    ).toEqual(["web", "docs"]);
  });
});
