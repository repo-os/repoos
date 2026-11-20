/**
 * #1268 — every CSS custom property the UI reads without a fallback must be
 * declared somewhere in the UI source. A `var(--name)` with no declaration and
 * no fallback computes to the property's initial value, so hover, selected,
 * badge and focus styles silently disappear: four Docs and history surfaces
 * shipped that way until this guard existed.
 *
 * "Declared" means a `--name:` in a stylesheet, or a `'--name':` key in a
 * `:style` binding or runtime string. Names that third-party code sets at
 * runtime (Radix sizes its select trigger) are allowed by prefix.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../src");
/** Set by a library at runtime, so no source declares them. */
const RUNTIME_PROVIDED = [/^radix-/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(vue|css|ts)$/.test(name)) out.push(path);
  }
  return out;
}

const files = walk(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

/** Names declared in source: `--x:` in CSS, or `'--x':` / `"--x":` as a key. */
const declared = new Set<string>();
for (const { text } of files) {
  for (const m of text.matchAll(/--([A-Za-z0-9_-]+)['"]?\s*:/g)) declared.add(m[1]!);
}

/** Names read with no fallback: `var(--x)` (a comma-free `var(--x, …)` is fine). */
function unfallbackReads(): Map<string, string[]> {
  const reads = new Map<string, string[]>();
  for (const { path, text } of files) {
    for (const m of text.matchAll(/var\(--([A-Za-z0-9_-]+)\)/g)) {
      const name = m[1]!;
      const where = reads.get(name) ?? [];
      const rel = path.slice(SRC.length + 1);
      if (!where.includes(rel)) where.push(rel);
      reads.set(name, where);
    }
  }
  return reads;
}

describe("#1268 CSS custom properties read without a fallback are declared", () => {
  const reads = unfallbackReads();
  const undeclared = [...reads.keys()]
    .filter((name) => !declared.has(name))
    .filter((name) => !RUNTIME_PROVIDED.some((re) => re.test(name)))
    .sort();

  it("finds the UI's custom property reads (guards against a broken scan)", () => {
    expect(reads.get("txt")?.length ?? 0).toBeGreaterThan(0);
    expect(declared.has("txt")).toBe(true);
  });

  it("declares every property it reads without a fallback", () => {
    const report = undeclared.map((name) => `--${name} read in ${reads.get(name)!.join(", ")}`);
    expect(report, "custom properties read with no fallback and never declared").toEqual([]);
  });
});
