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
