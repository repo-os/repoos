// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(__dirname, "../src/components/SystemResourcePanel.vue"),
  "utf8",
);
const panelCss = component.split("<style scoped>")[1]!.split("</style>")[0]!;

describe("Control dashboard process table", () => {
  it("keeps the process columns readable inside a horizontal scroller", () => {
    expect(panelCss).toMatch(/\.process-table-wrap\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(panelCss).toMatch(/\.process-table-header\s*\{[^}]*min-width:\s*560px;/s);
    expect(panelCss).toMatch(/\.process-row\s*\{[^}]*min-width:\s*560px;/s);
  });
});

describe.skipIf(!existsSync(webkit.executablePath()))("Control dashboard process table (WebKit)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await webkit.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it.each([375, 1280])("contains the process table at %i px", async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 812 } });
    try {
      await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 16px; font: 12px sans-serif; }
          .resource-panel { width: 100%; padding: 16px; border: 1px solid #777; }
          ${panelCss}
        </style>
        <section class="resource-panel">
          <div class="process-table-wrap">
            <div class="process-table-header">
              <span class="col-pid">PID</span><span class="col-task">Task</span>
              <span class="col-cpu">CPU</span><span class="col-mem">Memory</span>
              <span class="col-time">Runtime</span><span class="col-kill"></span>
            </div>
            <div class="process-row">
              <span class="col-pid">12345</span><span class="col-task">serve</span>
              <span class="col-cpu">12%</span><span class="col-mem">120 MB</span>
              <span class="col-time">2m 10s</span><span class="col-kill">kill</span>
            </div>
          </div>
        </section>
      `);
      const geometry = await page.locator(".process-table-wrap").evaluate((wrap) => {
        const row = wrap.querySelector<HTMLElement>(".process-row")!;
        return {
          wrapperWidth: (wrap as HTMLElement).clientWidth,
          contentWidth: (wrap as HTMLElement).scrollWidth,
          rowWidth: row.getBoundingClientRect().width,
          viewport: innerWidth,
        };
      });
      expect(geometry.wrapperWidth).toBeLessThanOrEqual(geometry.viewport - 32);
      expect(geometry.rowWidth).toBeGreaterThanOrEqual(560);
      if (width === 375) expect(geometry.contentWidth).toBeGreaterThan(geometry.wrapperWidth);
      else expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.wrapperWidth);
    } finally {
      await page.close();
    }
  });
});
