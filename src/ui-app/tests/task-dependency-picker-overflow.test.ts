// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(__dirname, "../src/components/TaskDependencyPicker.vue"),
  "utf8",
);
const pickerCss = component.split("<style scoped>")[1]!.split("</style>")[0]!;

describe.skipIf(!existsSync(webkit.executablePath()))(
  "TaskDependencyPicker overflow (WebKit)",
  () => {
    let browser: Browser;

    beforeAll(async () => {
      browser = await webkit.launch();
    });

    afterAll(async () => {
      await browser?.close();
    });

    it.each([375, 1280])("keeps long task titles inside the picker at %i px", async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 16px; font: 14px sans-serif; }
          .task-dependency-picker { width: min(100%, 320px); --border: #777; --muted: #eee; --ring: #00f; --foreground: #111; }
          ${pickerCss}
        </style>
        <div class="task-dependency-picker">
          <label for="deps">Depends on</label>
          <input id="deps" value="">
          <ul class="dependency-options" aria-label="Depends on options">
            <li><button class="dependency-option" type="button">
              <span class="dependency-check" aria-hidden="true"></span>
              <span class="dependency-copy"><strong>#0101</strong> A very long candidate title that should stay on one line and truncate within the available picker width rather than widening the list</span>
              <span class="dependency-status">ready</span>
            </button></li>
          </ul>
        </div>
      `);

        const geometry = await page.locator(".dependency-options").evaluate((list) => {
          const row = list.querySelector<HTMLElement>("li")!;
          const button = row.querySelector<HTMLElement>("button")!;
          const title = button.querySelector<HTMLElement>(".dependency-copy")!;
          const rect = (element: HTMLElement) => {
            const { width, right } = element.getBoundingClientRect();
            return {
              width,
              right,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            };
          };
          return {
            list: rect(list as HTMLElement),
            row: rect(row),
            button: rect(button),
            title: rect(title),
          };
        });

        expect(geometry.list.scrollWidth).toBeLessThanOrEqual(geometry.list.clientWidth);
        expect(geometry.row.right).toBeLessThanOrEqual(geometry.list.right + 1);
        expect(geometry.button.scrollWidth).toBeLessThanOrEqual(geometry.button.clientWidth);
        expect(geometry.title.scrollWidth).toBeGreaterThan(geometry.title.clientWidth);
      } finally {
        await page.close();
      }
    });
  },
);
