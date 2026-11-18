// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8").replace(
  '@import "tailwindcss";',
  "",
);

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Settings Support actions at phone width",
  () => {
    let browser: Browser | undefined;
    let launchError: string | null = null;

    beforeAll(async () => {
      try {
        browser = await webkit.launch();
      } catch (error) {
        launchError = error instanceof Error ? error.message : String(error);
      }
    });

    afterAll(async () => {
      await browser?.close();
    });

    it("wraps the long report action inside the padded card at 375px", async (ctx) => {
      if (!browser) return ctx.skip(`WebKit could not launch: ${launchError ?? "unknown error"}`);

      const page = await browser.newPage({ viewport: { width: 375, height: 844 } });
      try {
        await page.setContent(
          `<style>
          ${css}
          html, body { width: 100%; margin: 0; }
          .support-bug-report-section { width: 263px; padding: 18px; border: 1px solid; }
          .bug-report-actions button {
            display: inline-flex; flex: 0 0 auto; white-space: nowrap;
            padding: 10px 14px; font: 13px Arial;
          }
        </style>
        <section class="support-bug-report-section">
          <div class="bug-report-actions">
            <button>Generate editable bug report with AI</button>
            <button>Write it manually</button>
          </div>
        </section>`,
        );

        const geometry = await page.evaluate(() => {
          const actions = document.querySelector<HTMLElement>(".bug-report-actions")!;
          const actionRect = actions.getBoundingClientRect();
          const buttons = [...actions.querySelectorAll("button")].map((button) => {
            const rect = button.getBoundingClientRect();
            return { left: rect.left, right: rect.right, height: rect.height };
          });
          return {
            actionLeft: actionRect.left,
            actionRight: actionRect.right,
            buttons,
            pageWidth: document.documentElement.scrollWidth,
          };
        });

        expect(geometry.pageWidth).toBeLessThanOrEqual(375);
        for (const button of geometry.buttons) {
          expect(button.left).toBeGreaterThanOrEqual(geometry.actionLeft);
          expect(button.right).toBeLessThanOrEqual(geometry.actionRight);
        }
        expect(geometry.buttons[0]?.height).toBeGreaterThan(34);
      } finally {
        await page.close();
      }
    });
  },
);
