import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../../core/frontmatter.js";

const doc = (titleRaw: string) =>
  `---\nid: "0052"\ntitle: ${titleRaw}\ntype: bug\n---\nBody\n`;

const roundTrip = (title: string) => {
  const serialized = serializeDocument({ title }, "Body\n", ["title"]);
  const parsed = parseDocument(serialized);
  return parsed.data.title;
};

describe("frontmatter quote escaping", () => {
  it("unescapes \\\" inside double-quoted values", () => {
    const out = parseDocument(doc(String.raw`"Make default \"Assign To\" set to AI"`));
    expect(out.data.title).toBe('Make default "Assign To" set to AI');
  });

  it("parses the canonical single-escape stored form to plain quotes", () => {
    const out = parseDocument(
      doc(String.raw`"Replace \"branch\" terminology with \"worktree\""`),
    );
    expect(out.data.title).toBe(
      'Replace "branch" terminology with "worktree"',
    );
  });

  it("round-trips an embedded-quote title without accumulating backslashes", () => {
    const title = 'Replace "branch" terminology with "worktree" in docs';
    expect(roundTrip(title)).toBe(title);
    expect(roundTrip(title)).toBe(title);
  });

  it("keeps serialize(parse(y)) stable for the canonical escaped form", () => {
    const canonical = doc(String.raw`"Make default \"Assign To\" set to AI"`);
    const parsed = parseDocument(canonical);
    expect(parsed.data.title).toBe('Make default "Assign To" set to AI');
    const reserialized = serializeDocument(parsed.data, parsed.body, [
      "id",
      "title",
      "type",
    ]);
    expect(reserialized).toContain(
      String.raw`title: "Make default \"Assign To\" set to AI"`,
    );
  });

  it("drops one accumulated escape level per parse (0051 stored \\\\\" form)", () => {
    const out = parseDocument(
      doc(String.raw`"Replace \\"branch\\" terminology with \\"worktree\\""`),
    );
    expect(out.data.title).toBe(
      String.raw`Replace \"branch\" terminology with \"worktree\"`,
    );
  });

  it("drops one accumulated escape level per parse (0005 stored \\\\\\\\\" form)", () => {
    const out = parseDocument(
      doc(String.raw`"Make default \\\\"Assign To\\\\" set to AI"`),
    );
    expect(out.data.title).toBe(
      String.raw`Make default \\\"Assign To\\\" set to AI`,
    );
  });

  it("round-trips a literal backslash before a quote", () => {
    const title = String.raw`use \"the\" escape`;
    expect(roundTrip(title)).toBe(title);
  });

  it("behaves exactly as before for unquoted and special-char titles", () => {
    expect(roundTrip("Plain title")).toBe("Plain title");
    expect(roundTrip("Needs: quoting")).toBe("Needs: quoting");
    expect(roundTrip("list [a] of {things}, #ok")).toBe("list [a] of {things}, #ok");
    expect(roundTrip("0123")).toBe("0123");
  });

  it("keeps single-quoted values unescaped", () => {
    const out = parseDocument(doc(`'single "quote" inside'`));
    expect(out.data.title).toBe('single "quote" inside');
  });
});

describe("unclosed frontmatter (0065)", () => {
  const unclosed = `---
title: Fix the unclosed frontmatter bug
type: bug
priority: p1
## Problem

The parser eats the title.
`;

  it("treats a document with no closing --- as frontmatter terminated by EOF", () => {
    const out = parseDocument(unclosed);
    expect(out.hadFrontmatter).toBe(true);
    expect(out.data.title).toBe("Fix the unclosed frontmatter bug");
    expect(out.data.type).toBe("bug");
    expect(out.data.priority).toBe("p1");
    expect(out.body).toBe("## Problem\n\nThe parser eats the title.\n");
  });

  it("does not eat markdown headings as frontmatter comments", () => {
    const out = parseDocument("---\ntitle: X\n## Problem\nbody\n");
    expect(out.body).toBe("## Problem\nbody\n");
  });

  it("still skips real (# ) frontmatter comments", () => {
    const out = parseDocument("---\n# a comment\ntitle: X\n## Problem\nbody\n");
    expect(out.data.title).toBe("X");
    expect(out.body).toBe("## Problem\nbody\n");
  });

  it("keeps a stray horizontal rule (--- then prose) as no-frontmatter", () => {
    const src = "---\nThis is a story about the fence.\n";
    const out = parseDocument(src);
    expect(out.hadFrontmatter).toBe(false);
    expect(out.data).toEqual({});
    expect(out.body).toBe(src);
  });

  it("merges a stray embedded frontmatter block in the body over the closed block", () => {
    const out = parseDocument(corrupted());
    expect(out.hadFrontmatter).toBe(true);
    expect(out.data.id).toBe("0064");
    expect(out.data.title).toBe(
      "Add per-task agent and model overrides to the task Agent tab and freeform creation",
    );
    expect(out.data.area).toBe("web");
    expect(out.body).toBe("## Problem\n\nThe Agents page.\n");
  });

  it("round-trips an affected file to a single clean frontmatter block", () => {
    const out = parseDocument(corrupted());
    const reserialized = serializeDocument(out.data, out.body, [
      "id",
      "title",
      "type",
      "status",
      "priority",
      "area",
      "assigned_to",
    ]);
    expect(reserialized).toBe(
      `---
id: "0064"
title: Add per-task agent and model overrides to the task Agent tab and freeform creation
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
---
## Problem

The Agents page.
`,
    );
    expect(reserialized.split("---")).toHaveLength(3); // one opening + one closing
  });
});

function corrupted(): string {
  return `---
id: "0064"
title: ---
type: feature
status: inbox
priority: p2
area: general
---
---
title: Add per-task agent and model overrides to the task Agent tab and freeform creation
type: feature
priority: p2
area: web
assigned_to: ai
## Problem

The Agents page.
`;
}
