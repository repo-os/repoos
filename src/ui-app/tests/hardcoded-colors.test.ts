/**
 * The hard-coded-color source guard (#0596) — the static half of the contrast
 * work: a component `<style>` block that hard-codes `#hex`/`rgba(255,…)`
 * overrides the theme's tokens and can invert across themes (the task drawer's
 * Changes-tab header shipped near-white text on a near-white header this way).
 * An intentional literal is allowlisted with `/* hardcode-ok: <reason> *​/`,
 * which exempts the rule block it sits in — one reason documents one rule.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { STYLE_BLOCK_EXTENSIONS, hardcodedColorOffenders } from "../../commands/check.js";
import { loadConfig } from "../../core/config.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});
function tmpFile(body: string, name = "Comp.vue"): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-hardcode-"));
  roots.push(dir);
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}
function scan(src: string, path = "Comp.vue"): string[] {
  return hardcodedColorOffenders(src, path);
}

describe("hardcodedColorOffenders (#0596)", () => {
  it("flags #hex and rgba(255,…) literals inside <style> blocks, with path:line", () => {
    const out = scan(
      [
        "<style scoped>",
        ".a { color: #c9d1d9; }",
        ".b { background: rgba(255, 255, 255, 0.04); }",
        "</style>",
      ].join("\n"),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toBe("Comp.vue:2  .a { color: #c9d1d9; }");
    expect(out[1]).toContain("Comp.vue:3");
  });

  it("leaves other rgba() colors and non-style sections alone", () => {
    const src = [
      "<script>",
      'const palette = ["#ef5b5b"];',
      "</script>",
      "<style scoped>",
      ".a { background: rgba(0, 0, 0, 0.04); }",
      ".b { color: var(--red); }",
      "</style>",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  it("ignores hex-looking text inside comments (task ids are #0444-shaped)", () => {
    const src = [
      "<style scoped>",
      "/* #0444: the compose row was flush against the panel edge. */",
      ".a { color: var(--txt); }",
      "</style>",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });

  it("requires a reason after the marker", () => {
    const bare = ["<style scoped>", "/* hardcode-ok */", ".a { color: #fff; }", "</style>"].join(
      "\n",
    );
    expect(scan(bare)).toHaveLength(1);
    const reasoned = [
      "<style scoped>",
      "/* hardcode-ok: fixed dark code pane */",
      ".a { color: #fff; }",
      "</style>",
    ].join("\n");
    expect(scan(reasoned)).toEqual([]);
  });

  it("exempts the rule the marker sits in — line above or same line", () => {
    const above = [
      "<style scoped>",
      ".a {",
      "  /* hardcode-ok: intentional dark pane */",
      "  color: #c9d1d9;",
      "  border: 1px solid #333;",
      "}",
      ".b { color: #abcdef; }",
      "</style>",
    ].join("\n");
    // .a exempt as a whole; .b (a later rule) still flagged.
    expect(scan(above)).toEqual(["Comp.vue:7  .b { color: #abcdef; }"]);

    const sameLine = [
      "<style scoped>",
      ".a { color: #c9d1d9; /* hardcode-ok: why */ }",
      ".b { color: #abcdef; }",
      "</style>",
    ].join("\n");
    expect(scan(sameLine)).toEqual(["Comp.vue:3  .b { color: #abcdef; }"]);
  });

  it("exempts the NEXT rule when the marker sits between rules", () => {
    const src = [
      "<style scoped>",
      "/* hardcode-ok: the whole pane is a fixed palette */",
      ".pane { background: #0d1117; color: #c9d1d9; }",
      ".after { color: #abcdef; }",
      "</style>",
    ].join("\n");
    expect(scan(src)).toEqual(["Comp.vue:4  .after { color: #abcdef; }"]);
  });

  it("survives a multi-line comment containing hex-looking text", () => {
    const src = [
      "<style scoped>",
      ".a {",
      "  /*",
      "   * #c9d1d9 was the old colour (#0596).",
      "   */",
      "  color: var(--txt);",
      "}",
      "</style>",
    ].join("\n");
    expect(scan(src)).toEqual([]);
  });
});

describe("RepoOS dogfoods the hard-coded-color guard", () => {
  const root = resolve(__dirname, "../../..");

  it("declares its component style-block roots in [check]", () => {
    const dirs = loadConfig(root).check?.hardcodedColorDirs ?? [];
    expect(dirs).toContain("src/ui-app/src");
  });

  it("has zero un-annotated hard-coded colors under those roots", () => {
    const cfg = loadConfig(root).check;
    const offenders: string[] = [];
    let files = 0;
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (STYLE_BLOCK_EXTENSIONS.some((x) => e.name.endsWith(x))) {
          files++;
          const rel = relative(root, full);
          offenders.push(...hardcodedColorOffenders(readFileSync(full, "utf8"), rel));
        }
      }
    };
    for (const d of cfg?.hardcodedColorDirs ?? []) walk(join(root, d));
    expect(files).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
