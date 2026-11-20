// @vitest-environment jsdom
/**
 * #1252 — QA pass: error pages, 404 routes and deep links at 375/768/1280px.
 *
 * The real `NotFoundView` (unknown route) and the Work page's missing-task
 * notice (a `?task=` id that the board does not have) are mounted in jsdom,
 * their markup is laid out in headless WebKit with the built global
 * stylesheet, and every way-back control must stay inside the viewport at
 * every width. The page itself never widens.
 *
 * Fixtures only: no server, no login. Set `QA_SHOTS=<dir>` to save a
 * screenshot per case and width.
 */
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { mount } from "@vue/test-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { defineComponent, h, type Component } from "vue";
import Button from "../src/components/ui/button.vue";
import RouteNotice from "../src/components/RouteNotice.vue";
import NotFoundView from "../src/views/NotFoundView.vue";

const hoisted = vi.hoisted(() => ({ fullPath: "/no-such-page" as string }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ fullPath: hoisted.fullPath, name: "not-found" }),
}));

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

// Stands in for the router's <router-link>: an anchor carrying the same href
// and the classes the parent passes through, so the layout check sees the
// real control.
const RouterLinkStub = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () => h("a", { href: props.to, ...attrs }, slots.default?.());
  },
});

/** The Work page's missing-task notice, built the same way WorkView builds it. */
const MissingTaskNotice = defineComponent({
  setup() {
    return () =>
      h(
        RouteNotice,
        {
          title: "This task isn't on the board",
          message:
            "Task #9999 could not be found. It may have been deleted, or the link may be mistyped.",
          "data-testid": "work-task-missing",
        },
        { default: () => h(Button, { variant: "outline" }, () => "Back to Work") },
      );
  },
});

function mountCase(component: Component, fullPath: string): string {
  hoisted.fullPath = fullPath;
  const wrapper = mount(component, {
    global: { stubs: { "router-link": RouterLinkStub, RouterLink: RouterLinkStub } },
  });
  const html = wrapper.html();
  wrapper.unmount();
  return html;
}

describe("Error pages and deep-link fallbacks at 375/768/1280 (WebKit, fixtures)", () => {
  let browser: Browser;
  let globalCss: string;

  beforeAll(async () => {
    browser = await webkit.launch();
    const assetDir = resolve(uiRoot, "../../dist/ui/assets");
    const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
    if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
    globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
  });
  afterAll(async () => {
    await browser?.close();
  });

  const cases = [
    {
      name: "unknown route",
      slug: "unknown-route",
      render: () => mountCase(NotFoundView, "/no-such-page?x=1"),
      expectText: ["This page doesn't exist", "/no-such-page?x=1"],
      wayBack: ["Go to Work", "Dashboard"],
    },
    {
      name: "missing task (deleted or never existed)",
      slug: "missing-task",
      render: () => mountCase(MissingTaskNotice, "/work?task=9999"),
      expectText: ["This task isn't on the board", "Task #9999"],
      wayBack: ["Back to Work"],
    },
  ] as const;

  async function openPage(width: number, html: string): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.setContent(
      `<!doctype html><html><head><style>${globalCss}</style></head>` +
        `<body style="margin:0;padding:0 16px;background:var(--bg, #111)">` +
        `<main class="main">${html}</main></body></html>`,
    );
    return page;
  }

  for (const width of VIEWPORTS) {
    for (const c of cases) {
      it(`${c.name} stays readable with a way back at ${width}px`, async () => {
        const html = c.render();
        for (const text of c.expectText) expect(html).toContain(text);
        expect(html).not.toContain("undefined");

        const page = await openPage(width, html);
        try {
          const layout = await page.evaluate(() => {
            const rectOf = (el: Element) => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right, width: r.width, height: r.height };
            };
            const notice = document.querySelector(".route-notice");
            const actions = [...document.querySelectorAll(".route-notice a, .route-notice button")];
            return {
              pageWidth: document.documentElement.scrollWidth,
              viewport: window.innerWidth,
              notice: notice ? rectOf(notice) : null,
              actions: actions.map((el) => ({
                text: el.textContent?.trim() ?? "",
                href: el.getAttribute("href"),
                ...rectOf(el),
              })),
            };
          });

          expect(layout.notice).not.toBeNull();
          expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
          expect(layout.notice!.left).toBeGreaterThanOrEqual(0);
          expect(layout.notice!.right).toBeLessThanOrEqual(layout.viewport);

          const labels = layout.actions.map((a) => a.text);
          for (const label of c.wayBack) expect(labels).toContain(label);
          for (const action of layout.actions) {
            expect(action.height).toBeGreaterThan(0);
            expect(action.left).toBeGreaterThanOrEqual(0);
            expect(action.right).toBeLessThanOrEqual(layout.viewport);
          }

          const shotDir = process.env.QA_SHOTS;
          if (shotDir) {
            mkdirSync(shotDir, { recursive: true });
            await page.screenshot({
              path: resolve(shotDir, `1252-${c.slug}-${width}.png`),
              fullPage: true,
            });
          }
        } finally {
          await page.close();
        }
      });
    }
  }
});
