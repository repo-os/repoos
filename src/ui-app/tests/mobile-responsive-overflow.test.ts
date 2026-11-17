// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const src = resolve(__dirname, "../src");
const queue = readFileSync(resolve(src, "components/MobileWorkQueue.vue"), "utf8");
const drawer = readFileSync(resolve(src, "components/TaskDrawer.vue"), "utf8");
const inputs = readFileSync(resolve(src, "views/InputsView.vue"), "utf8");
const agents = readFileSync(resolve(src, "views/AgentsView.vue"), "utf8");
const css = readFileSync(resolve(src, "style.css"), "utf8");
const queueCss = queue.split("<style scoped>")[1]!.split("</style>")[0]!;

describe("320px responsive content fit", () => {
  it.each([
    [
      "Work queue status and sort controls reflow without overlap",
      queue,
      /@media \(max-width: 420px\)\s*\{\s*\.mobile-queue-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*\}\s*\.mobile-status-filter\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s,
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

describe.skipIf(!existsSync(webkit.executablePath()))("narrow responsive controls (WebKit)", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await webkit.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each([320, 390])("keeps the Work status filter full width at %i px", async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    try {
      await page.setContent(
        `<style>${css.replace('@import "tailwindcss";', "")}\n${queueCss.replaceAll(":deep(button)", "button")}</style>
          <main class="mobile-work"><div class="mobile-queue-controls">
            <div class="mobile-queue-row">
              <label class="mobile-status-filter"><span>Show</span><button aria-label="Filter tasks by status"><span>Needs attention</span></button></label>
              <button class="mobile-sort"><span>Updated</span><strong>Newest</strong></button>
              <button class="mobile-reset">Reset</button>
            </div>
          </div></main>`,
      );
      const geometry = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>(".mobile-queue-row")!;
        const filter = document.querySelector<HTMLElement>(".mobile-status-filter")!;
        const trigger = filter.querySelector<HTMLElement>("button")!;
        const sort = document.querySelector<HTMLElement>(".mobile-sort")!;
        const reset = document.querySelector<HTMLElement>(".mobile-reset")!;
        const rect = (element: HTMLElement) => {
          const { x, y, width, right } = element.getBoundingClientRect();
          return { x, y, width, right };
        };
        return {
          columns: getComputedStyle(row).gridTemplateColumns,
          filterColumn: getComputedStyle(filter).gridColumn,
          filter: rect(filter),
          trigger: rect(trigger),
          sort: rect(sort),
          reset: rect(reset),
          viewport: innerWidth,
        };
      });
      expect(geometry.columns.split(" ")).toHaveLength(2);
      expect(geometry.filterColumn).toBe("1 / -1");
      expect(geometry.trigger.width).toBeGreaterThan(250);
      expect(geometry.trigger.right).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.sort.y).toBe(geometry.reset.y);
      expect(geometry.sort.x).toBeLessThan(geometry.reset.x);
    } finally {
      await page.close();
    }
  });

  it("keeps the Secrets environment selector reachable at 320 px", async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    try {
      await page.setContent(
        `<style>${css.replace('@import "tailwindcss";', "")}</style>
          <main class="secrets-page"><header class="page-header"><div><h1 class="page-title">Secrets</h1></div>
            <div class="page-header-actions"><div class="secrets-env-control">
              <div class="secrets-picker-wrap"><span class="secrets-label">Environment</span>
                <button class="secrets-picker"><span>production</span><span>⌄</span></button>
              </div><span class="secrets-view-note">Changes here do not switch running processes.</span>
            </div></div></header></main>`,
      );
      const geometry = await page.evaluate(() => {
        const control = document.querySelector<HTMLElement>(".secrets-env-control")!;
        const wrap = document.querySelector<HTMLElement>(".secrets-picker-wrap")!;
        const picker = document.querySelector<HTMLElement>(".secrets-picker")!;
        const rect = (element: HTMLElement) => {
          const { x, y, width, right } = element.getBoundingClientRect();
          return { x, y, width, right };
        };
        return {
          control: rect(control),
          wrap: rect(wrap),
          picker: rect(picker),
          viewport: innerWidth,
        };
      });
      expect(geometry.control.width).toBeGreaterThan(0);
      expect(geometry.picker.width).toBeGreaterThan(0);
      expect(geometry.picker.right).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.picker.x).toBeGreaterThanOrEqual(geometry.wrap.x);
    } finally {
      await page.close();
    }
  });
});
