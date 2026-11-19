/**
 * Icon-only control names (QA #1250). A button or link with no visible text
 * must carry its own accessible name in `aria-label` / `aria-labelledby`, or an
 * `<img alt>`. A `title` alone is not enough: `installTooltips()` strips the
 * `title` on first hover or focus and moves it to `data-tip`, so the name
 * disappears for screen readers after the first interaction.
 *
 * The guard scans every template under src/ui-app/src. The table below pins
 * the wording of the controls fixed in this pass, and the term check keeps the
 * same thing called the same thing across views.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SRC = resolve(__dirname, "../src");

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return path.endsWith(".vue") ? [path] : [];
  });
}

/** Returns `file:line` for each button/link that has no accessible name. */
function unnamedIconControls(source: string, file: string): string[] {
  const offenders: string[] = [];
  // The open tag is quote-aware, so a `>` inside an attribute value such as
  // `:disabled="i > 0"` does not end the tag early.
  const re = /<(button|a)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const attrs = match[2];
    const body = match[3];
    if (/aria-label|aria-labelledby/.test(attrs)) continue;
    const text = body
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<img\b[^>]*\balt="[^"]+"[^>]*>/g, "x")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\{[\s\S]*?\}\}/g, "x")
      .trim();
    if (text.length) continue;
    const line = source.slice(0, match.index).split("\n").length;
    offenders.push(`${file}:${line}`);
  }
  return offenders;
}

describe("icon-only controls have their own accessible name", () => {
  it("no button or link relies on a title alone for its name", () => {
    const offenders = vueFiles(SRC).flatMap((path) =>
      unnamedIconControls(readFileSync(path, "utf8"), relative(SRC, path)),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ["components/IntegrationStatusBar.vue", 'aria-label="Collapse integration pipeline"'],
    [
      "components/AgentCard.vue",
      ":aria-label=\"instrExpanded ? 'Collapse instructions' : 'Expand instructions'\"",
    ],
    ["components/AgentModelModal.vue", 'aria-label="Remove from favorites"'],
    ["components/AgentModelModal.vue", 'aria-label="Add to favorites"'],
    ["views/DiffView.vue", 'aria-label="Previous file"'],
    ["views/DiffView.vue", 'aria-label="Next file"'],
  ])("%s names its icon control with %s", (file, attr) => {
    expect(readFileSync(join(SRC, file), "utf8")).toContain(attr);
  });

  it.each([
    ["components/TaskDrawer.vue", 'title="Open full-screen diff"'],
    ["components/DiffFileViewer.vue", 'title="Open full-screen diff"'],
  ])("%s uses the shared full-screen diff wording", (file, attr) => {
    expect(readFileSync(join(SRC, file), "utf8")).toContain(attr);
  });

  it("flags a title-only icon button and accepts the same button once it has aria-label", () => {
    const bad = '<button type="button" title="Close" @click="x()"><X /></button>';
    const good =
      '<button type="button" title="Close" aria-label="Close" @click="x()"><X /></button>';
    expect(unnamedIconControls(bad, "fixture.vue")).toHaveLength(1);
    expect(unnamedIconControls(good, "fixture.vue")).toEqual([]);
  });

  it.each([
    [
      "a > inside a quoted attribute does not hide an unnamed icon button",
      '<button type="button" :disabled="i > 0" title="Previous file" @click="prev()"><ChevronLeft /></button>',
    ],
    [
      "a > inside a title does not hide an unnamed icon button",
      "<button :title=\"a > b ? 'x' : 'y'\" @click=\"go()\"><Star /></button>",
    ],
    [
      "bound attributes do not exempt an unnamed icon button",
      '<button v-bind="attrs" title="Close"><X /></button>',
    ],
    [
      "an empty img alt is not a name",
      '<button @click="x()"><img src="/a.webp" alt="" /></button>',
    ],
  ])("flags an unnamed icon control: %s", (_label, markup) => {
    expect(unnamedIconControls(markup, "fixture.vue")).toHaveLength(1);
  });

  it("accepts a quoted > when the control has its own aria-label", () => {
    const markup = '<button :disabled="i > 0" aria-label="Previous file"><ChevronLeft /></button>';
    expect(unnamedIconControls(markup, "fixture.vue")).toEqual([]);
  });
});
