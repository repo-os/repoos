/**
 * Full-file diff syntax highlighting (#0449).
 *
 * Three things are load-bearing and tested here: path→language detection is
 * explicit and complete for the scoped set, unsupported/oversized input always
 * degrades to escaped plain text rather than throwing, and tokenized output
 * escapes untrusted repository text so `DiffView`'s `v-html` can never turn a
 * file's contents into markup.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_HIGHLIGHT_TOTAL_LINES,
  detectLanguage,
  escapeHtml,
  highlightPair,
  renderTokenLines,
} from "../src/lib/syntax-highlight";

/** Decode the token HTML back to its text and assert nothing was added/lost. */
function textOf(html: string): string {
  return html
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("detectLanguage", () => {
  it("maps the scoped web languages by extension", () => {
    expect(detectLanguage("src/app.ts")).toBe("typescript");
    expect(detectLanguage("src/app.mts")).toBe("typescript");
    expect(detectLanguage("src/app.cts")).toBe("typescript");
    expect(detectLanguage("src/App.tsx")).toBe("tsx");
    expect(detectLanguage("src/app.js")).toBe("javascript");
    expect(detectLanguage("src/app.mjs")).toBe("javascript");
    expect(detectLanguage("src/app.cjs")).toBe("javascript");
    expect(detectLanguage("src/App.jsx")).toBe("jsx");
    expect(detectLanguage("src/views/DiffView.vue")).toBe("vue");
    expect(detectLanguage("package.json")).toBe("json");
    expect(detectLanguage("tsconfig.jsonc")).toBe("jsonc");
    expect(detectLanguage("repoos.toml")).toBe("toml");
    expect(detectLanguage("ci.yml")).toBe("yaml");
    expect(detectLanguage(".github/workflows/ci.yaml")).toBe("yaml");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("docs/guide.markdown")).toBe("markdown");
    expect(detectLanguage("src/style.css")).toBe("css");
    expect(detectLanguage("index.html")).toBe("html");
    expect(detectLanguage("index.htm")).toBe("html");
  });

  it("maps the native and build-tool languages by extension", () => {
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("src/lib.rs")).toBe("rust");
    expect(detectLanguage("Main.kt")).toBe("kotlin");
    expect(detectLanguage("build.gradle.kts")).toBe("kotlin");
    expect(detectLanguage("app/build.gradle")).toBe("groovy");
    expect(detectLanguage("Main.java")).toBe("java");
    expect(detectLanguage("scripts/run.py")).toBe("python");
    expect(detectLanguage("scripts/run.sh")).toBe("shellscript");
    expect(detectLanguage("scripts/run.bash")).toBe("shellscript");
    expect(detectLanguage("scripts/run.zsh")).toBe("shellscript");
    expect(detectLanguage("db/query.sql")).toBe("sql");
  });

  it("is case-insensitive and handles paths", () => {
    expect(detectLanguage("SRC/App.TS")).toBe("typescript");
    expect(detectLanguage("/abs/path/deep/lib.rs")).toBe("rust");
  });

  it("returns null for unknown or extensionless files", () => {
    expect(detectLanguage("notes.txt")).toBeNull();
    expect(detectLanguage("logo.svg")).toBeNull();
    expect(detectLanguage("Makefile")).toBeNull();
    expect(detectLanguage(".gitignore")).toBeNull();
    expect(detectLanguage("trailing.")).toBeNull();
    expect(detectLanguage("")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes markup without dropping characters", () => {
    const source = '<img src=x onerror="alert(1)"> & </script>';
    const escaped = escapeHtml(source);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("&lt;img");
    expect(escaped).toContain("&amp;");
  });
});

describe("renderTokenLines", () => {
  const tokens = [
    [
      {
        content: "const",
        variants: {
          light: { color: "#CF222E", fontStyle: 0 },
          dark: { color: "#FF7B72", fontStyle: 0 },
        },
      },
      {
        content: " x = <",
        variants: {
          light: { color: "#0550AE", fontStyle: 1 },
          dark: { color: "#79C0FF", fontStyle: 1 },
        },
      },
    ],
  ];

  it("carries both theme colours and font styles as custom properties", () => {
    const [line] = renderTokenLines(tokens);
    expect(line).toContain("--shiki-light:#CF222E");
    expect(line).toContain("--shiki-dark:#FF7B72");
    expect(line).toContain("font-style:italic");
  });

  it("escapes token text and preserves its exact content", () => {
    const [line] = renderTokenLines(tokens);
    expect(line).not.toContain("= <");
    expect(line).toContain("&lt;");
    expect(textOf(line!)).toBe("const x = <");
  });

  it("renders tokenless text without a span", () => {
    expect(renderTokenLines([[{ content: "<b>" }]])).toEqual(["&lt;b&gt;"]);
  });
});

describe("highlightPair", () => {
  it("falls back to escaped plain text for unsupported files", async () => {
    const result = await highlightPair({
      filename: "notes.txt",
      before: ["<b>before</b>"],
      after: ["<b>after</b>"],
    });
    expect(result.language).toBeNull();
    expect(result.highlighted).toBe(false);
    expect(result.notice).toBeNull();
    expect(result.before).toEqual(["&lt;b&gt;before&lt;/b&gt;"]);
    expect(result.after).toEqual(["&lt;b&gt;after&lt;/b&gt;"]);
  });

  it("keeps line alignment and highlights both panes", async () => {
    const before = ["const a = 1;", "const b = 2;"];
    const after = ["const a = 1;", "const b = 3;", "const c = 4;"];
    const result = await highlightPair({ filename: "src/app.ts", before, after });

    expect(result.language).toBe("typescript");
    expect(result.highlighted).toBe(true);
    expect(result.notice).toBeNull();
    expect(result.before).toHaveLength(before.length);
    expect(result.after).toHaveLength(after.length);
    expect(result.before.every((line) => line.includes("diff-tok"))).toBe(true);
    expect(result.after.every((line) => line.includes("diff-tok"))).toBe(true);
    expect(textOf(result.before[1]!)).toBe("const b = 2;");
    expect(textOf(result.after[2]!)).toBe("const c = 4;");
  });

  it("never lets repository text become markup", async () => {
    const payload = '<img src=x onerror="globalThis.pwned=1">';
    const result = await highlightPair({
      filename: "src/app.ts",
      before: [`const x = "${payload}";`],
      after: [`const x = "${payload}";`],
    });
    expect(result.highlighted).toBe(true);
    const html = result.after[0]!;
    // The payload is escaped, never emitted as a real tag. Shiki may still
    // tokenize the words inside it, which is fine — only raw `<img` matters.
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;");
  });

  it("degrades oversized pairs to plain text with an explanation", async () => {
    const before: string[] = [];
    const after = Array.from(
      { length: MAX_HIGHLIGHT_TOTAL_LINES + 1 },
      (_, i) => `const x${i} = 1;`,
    );
    const result = await highlightPair({ filename: "src/huge.ts", before, after });

    expect(result.highlighted).toBe(false);
    expect(result.language).toBe("typescript");
    expect(result.notice).toMatch(/too large/i);
    expect(result.after).toHaveLength(after.length);
    expect(result.after[0]).not.toContain("diff-tok");
    expect(textOf(result.after[0]!)).toBe("const x0 = 1;");
  });

  it("handles an empty side (added or deleted files)", async () => {
    const added = await highlightPair({
      filename: "src/new.ts",
      before: [],
      after: ["export {};"],
    });
    expect(added.before).toEqual([]);
    expect(added.after).toHaveLength(1);
    expect(added.highlighted).toBe(true);

    const deleted = await highlightPair({
      filename: "src/gone.ts",
      before: ["export {};"],
      after: [],
    });
    expect(deleted.before).toHaveLength(1);
    expect(deleted.after).toEqual([]);
  });
});
