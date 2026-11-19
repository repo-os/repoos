// @vitest-environment jsdom
import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

describe("real task drawer layout (WebKit)", () => {
  let browser: Browser;
  let globalCss: string;
  let taskDrawerStyle: string;
  let taskDrawerCss: string;

  beforeAll(async () => {
    browser = await webkit.launch();
    const assetDir = resolve(uiRoot, "../../dist/ui/assets");
    const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
    if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
    globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
    const source = await readFile(resolve(uiRoot, "src/components/TaskDrawer.vue"), "utf8");
    const parsed = parse(source, { filename: resolve(uiRoot, "src/components/TaskDrawer.vue") });
    taskDrawerStyle = parsed.descriptor.styles[0]?.content ?? "";
  });

  afterAll(async () => {
    await browser?.close();
  });

  function compileDrawerStyle(markup: string): string {
    const scopeId = markup.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error("TaskDrawer scope ID was not present in the rendered markup");
    const compiled = compileStyle({
      filename: resolve(uiRoot, "src/components/TaskDrawer.vue"),
      id: scopeId,
      source: taskDrawerStyle,
    });
    if (compiled.errors.length) throw compiled.errors[0];
    return compiled.code;
  }

  async function renderDrawerMarkup(width: number, editing: boolean): Promise<string> {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: width,
    });
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          agents: [],
          tasks: [],
          counts: { ...EMPTY_COUNTS, ready: 2 },
          taskCount: 2,
          running: false,
          enabled: false,
          review: null,
          lines: [],
          stats: {},
        }),
      ),
    );

    const pinia = createPinia();
    setActivePinia(pinia);
    useConfigStore(pinia).data = {
      stories: { enabled: false },
      areaVocabulary: [{ name: "web" }, { name: "docs" }],
    };
    useConfigStore(pinia).form.defaultTaskMode = "manual";
    const task = makeTask({ body: "Fixture body" });
    const prerequisite = makeTask({ id: "0002", title: "Prerequisite" });
    useRepoStore(pinia).tasks = [task, prerequisite];
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/work", component: { template: "<div />" } },
        { path: "/settings", component: { template: "<div />" } },
      ],
    });
    await router.push("/work");
    await router.isReady();

    const wrapper = mount(TaskDrawer, {
      attachTo: document.body,
      global: { plugins: [pinia, router], stubs: { teleport: false, Transition: true } },
    });
    const ui = useUiStore(pinia);
    if (editing) {
      ui.open(task);
      ui.activeTab = "details";
    } else {
      ui.openNewTask();
      await flush();
      await wrapper.findAll(".drawer-tabs button")[1]!.trigger("click");
    }
    await flush();
    const markup = document.body.innerHTML;
    taskDrawerCss = compileDrawerStyle(markup);
    wrapper.unmount();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    return markup;
  }

  async function checkActualDrawer(page: Page, markup: string, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${globalCss}</style><style>${taskDrawerCss}</style><style>html, body { width: 100%; margin: 0; overflow: hidden; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>${markup}`,
    );
    const dialog = page.locator(".drawer-wrap");
    await dialog.waitFor();
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector<HTMLElement>(".drawer-body")!;
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        controls: Array.from(
          element.querySelectorAll<HTMLElement>(
            'button, input:not([type="hidden"]), textarea, [role="combobox"]',
          ),
        ).map((control) => {
          const controlRect = control.getBoundingClientRect();
          return {
            name:
              control.getAttribute("aria-label") ||
              control.getAttribute("id") ||
              control.textContent?.trim() ||
              control.tagName,
            left: controlRect.left,
            right: controlRect.right,
            width: controlRect.width,
            height: controlRect.height,
          };
        }),
      };
    });

    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right, JSON.stringify(geometry)).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    );
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    for (const control of geometry.controls) {
      if (control.width === 0 || control.height === 0) continue;
      expect(control.left, `${control.name} starts inside the drawer`).toBeGreaterThanOrEqual(
        geometry.left - 1,
      );
      expect(control.right, `${control.name} ends inside the drawer`).toBeLessThanOrEqual(
        geometry.right + 1,
      );
    }

    const controls = dialog.locator(
      'button, input:not([type="hidden"]), textarea, [role="combobox"]',
    );
    for (let index = 0; index < (await controls.count()); index++) {
      const control = controls.nth(index);
      if (!(await control.isVisible())) continue;
      await control.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const rect = await control.boundingBox();
      if (!rect || rect.width === 0 || rect.height === 0) continue;
      expect(rect.x, `control ${index} is reachable on the left`).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, `control ${index} is reachable on the right`).toBeLessThanOrEqual(
        geometry.viewportWidth + 1,
      );
      expect(rect.y, `control ${index} is reachable at the top`).toBeGreaterThanOrEqual(-1);
      expect(
        rect.y + rect.height,
        `control ${index} is reachable at the bottom`,
      ).toBeLessThanOrEqual(901);
    }
  }

  it.each(VIEWPORTS)("measures the real create and edit drawer at %i px", async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const createMarkup = await renderDrawerMarkup(width, false);
      expect(createMarkup).toContain('id="nt-title"');
      expect(createMarkup).toContain('id="nt-area"');
      expect(createMarkup).toContain('id="nt-dependencies"');
      expect(createMarkup).toContain('type="file"');
      await checkActualDrawer(page, createMarkup, width);

      const editMarkup = await renderDrawerMarkup(width, true);
      expect(editMarkup).toContain('id="et-dependencies"');
      expect(editMarkup).toContain('id="et-area"');
      await checkActualDrawer(page, editMarkup, width);
    } finally {
      await page.close();
    }
  });
});
