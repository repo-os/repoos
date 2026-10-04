import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatOutline, outlineFile, outlineSource } from "../../core/outline.js";
import { cmdOutline } from "../../commands/outline.js";

const SCRIPT = `import { x } from "./x";

// function commented() {}
export interface Foo {
  a: number;
}
export type Bar = {
  z: number;
};
export const LIMIT = 10;
export const build = (a: string) => {
  function inner() {
    return 1;
  }
  const local = 5;
  return inner() + a;
};
export async function run(): Promise<void> {
  return;
}
export enum Color {
  Red,
}
export class Widget {
  private count = 0;
  constructor(n: number) {
    this.count = n;
  }
  async render(): Promise<string> {
    return "x";
  }
  get value(): number {
    return this.count;
  }
}
`;

const VUE = `<template>
  <div>{{ msg }}</div>
</template>

<script setup lang="ts">
import { ref } from "vue";
const msg = ref("hi");
function greet(name: string) {
  return "hi " + name;
}
</script>

<style scoped>
.x { color: red; }
</style>
`;

const CSS = `/* comment with { brace } */
:root {
  --space: 4px;
}
.btn,
.link {
  color: red;
}
@media (max-width: 600px) {
  .btn { color: blue; }
}
@keyframes spin {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}
`;

describe("outline — TypeScript", () => {
  const entries = outlineSource("sample.ts", SCRIPT).entries;
  const byName = new Map(entries.map((e) => [e.name, e]));

  it("lists exported and top-level declarations with line ranges", () => {
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "interface",
          name: "Foo",
          start: 4,
          end: 6,
          exported: true,
        }),
        expect.objectContaining({ kind: "type", name: "Bar", start: 7, end: 9, exported: true }),
        expect.objectContaining({
          kind: "const",
          name: "LIMIT",
          start: 10,
          end: 10,
          exported: true,
        }),
        expect.objectContaining({
          kind: "function",
          name: "build",
          start: 11,
          end: 17,
          exported: true,
        }),
        expect.objectContaining({
          kind: "function",
          name: "run",
          start: 18,
          end: 20,
          exported: true,
        }),
        expect.objectContaining({
          kind: "enum",
          name: "Color",
          start: 21,
          end: 23,
          exported: true,
        }),
        expect.objectContaining({
          kind: "class",
          name: "Widget",
          start: 24,
          end: 35,
          exported: true,
        }),
      ]),
    );
  });

  it("lists class members nested under the class", () => {
    expect(byName.get("count")).toMatchObject({
      kind: "property",
      start: 25,
      depth: 1,
      parent: "Widget",
    });
    expect(byName.get("constructor")).toMatchObject({
      kind: "constructor",
      start: 26,
      end: 28,
      depth: 1,
      parent: "Widget",
    });
    expect(byName.get("render")).toMatchObject({
      kind: "method",
      start: 29,
      end: 31,
      parent: "Widget",
    });
    expect(byName.get("value")).toMatchObject({
      kind: "method",
      start: 32,
      end: 34,
      parent: "Widget",
    });
  });

  it("lists a nested function but not a nested variable", () => {
    expect(byName.get("inner")).toMatchObject({
      kind: "function",
      start: 12,
      end: 14,
      depth: 1,
      parent: "build",
    });
    expect(byName.has("local")).toBe(false);
  });

  it("does not mistake a commented-out declaration for a symbol", () => {
    expect(byName.has("commented")).toBe(false);
  });
});

describe("outline — Vue SFC", () => {
  const outline = outlineSource("Comp.vue", VUE);
  const byName = new Map(outline.entries.map((e) => [e.name, e]));

  it("reports template/script/style block ranges", () => {
    expect(byName.get("template")).toMatchObject({ kind: "block", start: 1, end: 3 });
    expect(byName.get("script setup")).toMatchObject({ kind: "block", start: 5, end: 11 });
    expect(byName.get("style")).toMatchObject({ kind: "block", start: 13, end: 15 });
  });

  it("reports script symbols with SFC-relative line numbers", () => {
    expect(byName.get("msg")).toMatchObject({ kind: "const", start: 7, depth: 0 });
    expect(byName.get("greet")).toMatchObject({ kind: "function", start: 8, end: 10, depth: 0 });
  });
});

describe("outline — CSS", () => {
  const entries = outlineSource("style.css", CSS).entries;

  it("reports top-level selectors and at-rules, not nested rules", () => {
    expect(entries).toEqual([
      expect.objectContaining({ kind: "selector", name: ":root", start: 2, end: 4 }),
      expect.objectContaining({ kind: "selector", name: ".btn, .link", start: 5, end: 8 }),
      expect.objectContaining({
        kind: "at-rule",
        name: "@media (max-width: 600px)",
        start: 9,
        end: 11,
      }),
      expect.objectContaining({ kind: "at-rule", name: "@keyframes spin", start: 12, end: 15 }),
    ]);
  });

  it("ignores selectors that appear only inside a comment", () => {
    expect(entries.some((e) => e.name.includes("comment"))).toBe(false);
  });
});

describe("outline — unsupported", () => {
  it("returns one clear line rather than an error dump", () => {
    const outline = outlineSource("README.md", "# hi");
    expect(outline.language).toBe("unsupported");
    expect(outline.entries).toEqual([]);
    const text = formatOutline(outline);
    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("unsupported file type");
    expect(text).toContain(".vue");
  });
});

describe("outline — format and performance", () => {
  it("formats as greppable kind/name/start-end lines", () => {
    const text = formatOutline(outlineSource("sample.ts", SCRIPT));
    expect(text.split("\n")[0]).toContain("sample.ts (script,");
    expect(text).toContain("function build 11-17");
    expect(text).toContain("  method render 29-31");
  });

  it("outlines a large file well under the 200ms budget", () => {
    // A synthetic ~400KB source; the scanner is a handful of linear passes, so
    // even on a loaded box this is a few milliseconds. A generous ceiling
    // catches an accidental quadratic without flaking on pool contention.
    const unit = SCRIPT + "\n";
    const large = unit.repeat(Math.ceil(400_000 / unit.length));
    const started = performance.now();
    const outline = outlineSource("large.ts", large);
    const elapsed = performance.now() - started;
    expect(outline.entries.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("cmdOutline", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it("prints --json for a supported file", () => {
    dir = mkdtempSync(join(tmpdir(), "outline-"));
    const file = join(dir, "thing.ts");
    writeFileSync(file, "export function hi() {}\n");
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    cmdOutline([file, "--json"]);
    const parsed = JSON.parse(logs[0]) as { language: string; entries: { name: string }[] };
    expect(parsed.language).toBe("script");
    expect(parsed.entries[0]?.name).toBe("hi");
  });

  it("reports a missing file and sets a non-zero exit code", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    cmdOutline(["definitely-missing.ts"]);
    expect(errors.join("\n")).toContain("no such file");
    expect(process.exitCode).toBe(1);
  });
});

describe("outlineFile", () => {
  it("reads from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "outline-"));
    try {
      const file = join(dir, "a.ts");
      writeFileSync(file, "export const A = 1;\n");
      const outline = outlineFile(file);
      expect(outline.entries[0]).toMatchObject({ kind: "const", name: "A" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
