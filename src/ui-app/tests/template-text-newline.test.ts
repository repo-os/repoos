/**
 * #1268 — a Vue template must not show a literal backslash-n as text. In a
 * template `\n` is two characters, not a line break, so the Skills.sh file
 * review printed `\n` between a file path and its contents. Text nodes are
 * checked across every SFC; a line break belongs in the template itself or in
 * an interpolation such as `{{ "\n" }}`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "@vue/compiler-sfc";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../src");
/** `NodeTypes.TEXT` from @vue/compiler-core; a plain text run in a template. */
const TEXT_NODE = 2;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".vue")) out.push(path);
  }
  return out;
}

/** Text runs in a template AST that contain the two characters `\n`. */
function literalNewlines(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) literalNewlines(child, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;
  const n = node as { type?: number; content?: string; children?: unknown; branches?: unknown };
  if (n.type === TEXT_NODE && typeof n.content === "string" && n.content.includes("\\n")) {
    found.push(n.content.trim().slice(0, 60));
  }
  literalNewlines(n.children, found);
  literalNewlines(n.branches, found);
  return found;
}

describe("#1268 Vue template text never shows a literal \\n", () => {
  const offenders = walk(SRC).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const template = parse(source, { filename: path }).descriptor.template;
    if (!template) return [];
    return literalNewlines(template.ast).map((text) => `${path.slice(SRC.length + 1)}: ${text}`);
  });

  it("finds the templates it scans (guards against a broken parse)", () => {
    expect(walk(SRC).length).toBeGreaterThan(50);
  });

  it("has no template text node with a literal backslash-n", () => {
    expect(offenders).toEqual([]);
  });
});
