import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(__dirname, "../src");
const queue = readFileSync(resolve(src, "components/MobileWorkQueue.vue"), "utf8");
const drawer = readFileSync(resolve(src, "components/TaskDrawer.vue"), "utf8");
const inputs = readFileSync(resolve(src, "views/InputsView.vue"), "utf8");
const agents = readFileSync(resolve(src, "views/AgentsView.vue"), "utf8");
const css = readFileSync(resolve(src, "style.css"), "utf8");

describe("320px responsive content fit", () => {
  it.each([
    [
      "Work queue status and sort controls reflow without overlap",
      queue,
      /@media \(max-width: 360px\)\s*\{\s*\.mobile-queue-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*\}\s*\.mobile-status-filter\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s,
    ],
    [
      "Work queue sort button can shrink inside its grid cell",
      queue,
      /\.mobile-sort\s*\{[^}]*min-width:\s*0;/s,
    ],
    [
      "task drawer status select gets a full row at phone widths",
      css,
      /@media \(max-width: 719\.98px\)\s*\{[\s\S]*?\.drawer-quickbar \.task-status-select\s*\{[^}]*flex:\s*1 1 100%;[^}]*min-width:\s*0;/s,
    ],
    [
      "input author byline wraps unbroken identifiers",
      inputs,
      /\.input-byline\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
    ],
    [
      "Agents model failure text wraps unbroken credential names",
      css,
      /\.am-list-notice-text\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
    ],
  ])("%s", (_name, source, rule) => {
    expect(source).toMatch(rule);
  });

  it("marks the clipped Inputs byline with its dedicated wrapping class", () => {
    expect(inputs).toContain('class="input-byline">by {{ i.createdBy || "Unknown" }}');
  });

  it("marks the drawer status trigger for the narrow layout rule", () => {
    expect(drawer).toContain('class="task-status-select" :disabled="ui.saving || handoffBusy"');
  });
});
