// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
const inputsCss = readFileSync(resolve(__dirname, "../src/views/InputsView.vue"), "utf8")
  .split("<style scoped>")[1]
  .split("</style>")[0];
const componentCss = ["IntegrationStatusBar", "FloatingHeads"]
  .map(
    (name) =>
      readFileSync(resolve(__dirname, `../src/components/${name}.vue`), "utf8")
        .split("<style scoped>")[1]
        .split("</style>")[0],
  )
  .join("\n");
const content =
  '<div style="height:1600px;flex-shrink:0"></div><button id="last">Last item</button>';
const columns = Array.from(
  { length: 5 },
  (_, i) =>
    `<div class="board-col"><div class="col-head">Column ${i + 1}</div><div class="col-body">${i === 4 ? content : content.replace('id="last"', "")}</div></div>`,
).join("");
const header = '<header style="height:80px;flex-shrink:0">Page header</header>';
// Exercise each scroll ownership pattern with the real shared CSS. The tiny
// fixture deliberately omits application data so these assertions isolate the
// height chain, responsive flow changes and end clearance from network state.
const shells = [
  ["Control / Inputs list", "flow-page", header + content],
  [
    "Stories / Checks / Releases / Deployments / Dev / Secrets / Settings",
    "page-scroll",
    header + `<div class="page-scroll-body">${content}</div>`,
  ],
  ["Work", "work-page", header + `<div class="board">${columns}</div>`],
  [
    "Inputs board",
    "inputs-page inputs-board-page",
    header + `<div class="board inputs-board">${columns}</div>`,
  ],
  ["Agents", "agents-page", header + `<div class="agents-tab-content">${content}</div>`],
  [
    "Context",
    "ctx-page",
    header + `<div class="repo-grid"><div>Files</div><div class="doc-view">${content}</div></div>`,
  ],
] as const;

// Same optional browser dependency as the UI smoke check; no browser install is
// performed by a test. When present this catches CSS geometry jsdom cannot.
describe.skipIf(!existsSync(webkit.executablePath()))(
  "full-height page scrollports (WebKit)",
  () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await webkit.launch();
    });
    afterAll(async () => {
      await browser?.close();
    });

    it.each([320, 390, 760])(
      "keeps pipeline controls outside the head stack at %spx",
      async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 620 } });
        try {
          await page.setContent(
            `<style>${css}\n${componentCss}</style><div id="app"><div class="ibar-wrap"><div class="ibar"><div class="ibar-top">Pipeline<button class="ibar-toggle">⌃</button></div></div></div><div class="floating-heads"><div class="stack"><button class="head-btn">A</button><button class="head-btn">B</button><button class="head-btn">C</button></div></div></div>`,
          );
          const edges = await page.evaluate(() => ({
            pipelineRight: document.querySelector(".ibar-wrap")!.getBoundingClientRect().right,
            headsLeft: document.querySelector(".floating-heads")!.getBoundingClientRect().left,
          }));
          expect(edges.pipelineRight).toBeLessThan(edges.headsLeft);
        } finally {
          await page.close();
        }
      },
    );

    for (const [width, height] of [
      [1280, 620],
      [1280, 1120],
      [800, 620],
      [390, 620],
    ]) {
      it.each(shells)(
        `%s reaches the bottom and exposes its last item at ${width}×${height}`,
        async (_name, rootClass, body) => {
          const page = await browser.newPage({ viewport: { width, height } });
          try {
            await page.setContent(
              `<style>${css}\n${inputsCss}</style><div id="app"><div style="height:64px;flex-shrink:0">Top bar</div><div class="body"><aside class="sidebar"></aside><main class="main"><section id="root" class="${rootClass}">${body}</section></main></div></div>`,
            );
            const geometry = await page.evaluate(() => {
              const root = document.querySelector<HTMLElement>("#root")!;
              const last = document.querySelector<HTMLElement>("#last")!;
              let scroller = last.parentElement!;
              while (
                !/auto|scroll/.test(getComputedStyle(scroller).overflowY) ||
                scroller.scrollHeight <= scroller.clientHeight
              ) {
                scroller = scroller.parentElement!;
              }
              scroller.scrollTop = scroller.scrollHeight;
              const lastRect = last.getBoundingClientRect();
              return {
                rootBottom: root.getBoundingClientRect().bottom,
                scrollBottom: scroller.getBoundingClientRect().bottom,
                scrollTop: scroller.getBoundingClientRect().top,
                lastTop: lastRect.top,
                lastBottom: lastRect.bottom,
              };
            });
            expect(geometry.rootBottom).toBeCloseTo(height, 0);
            expect(geometry.scrollBottom).toBeCloseTo(height, 0);
            expect(geometry.lastTop).toBeGreaterThanOrEqual(geometry.scrollTop);
            expect(geometry.lastBottom).toBeLessThanOrEqual(height - 24);
          } finally {
            await page.close();
          }
        },
      );
    }
  },
);
