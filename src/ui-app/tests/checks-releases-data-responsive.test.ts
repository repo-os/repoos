// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const checks = readFileSync(resolve(__dirname, "../src/views/ChecksView.vue"), "utf8");
const releases = readFileSync(resolve(__dirname, "../src/views/ReleasesView.vue"), "utf8");
const style = (source: string) => source.split("<style scoped>")[1]!.split("</style>")[0]!;

describe.skipIf(!existsSync(webkit.executablePath()))(
  "Checks and Releases long data (WebKit)",
  () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await webkit.launch({ headless: true });
    });
    afterAll(async () => {
      await browser?.close();
    });

    it.each([375, 768, 1280])(
      "keeps long check rows and release channel data usable at %i px",
      async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        try {
          await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px;font:14px sans-serif}.fixture{max-width:100%;border:1px solid #888;padding:14px}.ck-steps{list-style:none;padding:0;margin:0;display:grid;gap:10px}.ck-step{display:flex;gap:12px;border:1px solid #888;padding:14px 16px 14px 12px}.ck-step-body{flex:1;min-width:0}.ck-step-top{display:flex;flex-wrap:wrap;gap:8px}.rel-card{margin-top:16px;padding:16px;border:1px solid #888}.rel-dist-sub{color:#555;font-size:12px;overflow-wrap:anywhere}.rel-dist-title-row{display:flex;justify-content:space-between;gap:12px}.rel-dist-title{min-width:0;overflow-wrap:anywhere} ${style(checks)} ${style(releases)}</style>
        <main class="fixture"><h1>Checks</h1><ol class="ck-steps">${Array.from({ length: 24 }, (_, i) => `<li class="ck-step"><span>${i + 1}</span><div class="ck-step-body"><div class="ck-step-top"><span class="ck-step-name">${"integration-verification-".repeat(8)} ${i}</span></div><code class="ck-step-cmd">bun run test -- --changed ${"very-long-directory-name/".repeat(5)}</code></div></li>`).join("")}</ol><section class="rel-card"><div class="rel-dist-title-row"><h2 class="rel-dist-title">Published to</h2><button>Check again</button></div><p class="rel-dist-sub">${"registry.example.org/packages/repoos-with-an-extremely-long-channel-description/ ".repeat(8)}</p>${Array.from({ length: 24 }, (_, i) => `<p class="rel-provider-meta">channel-${i} · ${"https://packages.example.org/".repeat(5)}</p>`).join("")}</section></main>`);
          // A delayed data arrival models the empty/loading interval before a large result set.
          await page.waitForTimeout(40);
          const result = await page.evaluate(() => ({
            bodyWidth: document.body.scrollWidth,
            viewport: innerWidth,
            rows: document.querySelectorAll(".ck-step").length,
            releases: document.querySelectorAll(".rel-provider-meta").length,
            buttonVisible: (() => {
              const r = document.querySelector("button")!.getBoundingClientRect();
              return r.width > 0 && r.right <= innerWidth;
            })(),
            longTitleWraps: getComputedStyle(document.querySelector(".ck-step-name")!).overflowWrap,
          }));
          expect(result.rows).toBe(24);
          expect(result.releases).toBe(24);
          expect(result.bodyWidth).toBeLessThanOrEqual(result.viewport);
          expect(result.buttonVisible).toBe(true);
          expect(result.longTitleWraps).toBe("anywhere");
        } finally {
          await page.close();
        }
      },
    );
  },
);
