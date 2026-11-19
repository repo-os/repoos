// @vitest-environment jsdom
/**
 * #1253 — QA pass: Model providers and API key screens at 375/768/1280px.
 * The real ModelProvidersPanel is driven in jsdom with fake keys
 * (`sk-or-v1-fake-1253`) and a stubbed fetch, then its markup plus the built
 * global stylesheet and the compiled scoped styles are rendered in headless
 * WebKit. Each state must:
 *
 *   - keep every visible element inside the viewport,
 *   - show Saved / Not set beside a live provider, and never the key value,
 *   - keep the key field masked (`type="password"`),
 *   - explain a rejected key, an unreachable provider and a refused save in
 *     plain English, with the next step in the same message.
 *
 * Nothing here reads or writes a real `.env`; the save path is stubbed.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per state and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ModelProvidersPanel from "../src/components/ModelProvidersPanel.vue";

const FAKE_KEY = "sk-or-v1-fake-1253";
const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

const REJECTED =
  "OpenRouter rejected the API key. Check the key was copied in full, then use Replace key to paste it again.";
const UNREACHABLE =
  "OpenRouter could not be reached. Check your internet connection, then press Retry.";
const MULTI_LINE =
  "That doesn't look like a valid OpenRouter key — it spans more than one line. Paste the key again as a single line.";
const EMPTY_SAVE = "Paste your OpenRouter API key to save it. To remove the saved key, use Clear.";

interface StubRoute {
  match: (url: string) => boolean;
  status?: number;
  body: unknown;
}

/** Fake fetch: the first route whose matcher hits answers; anything else is an empty 200. */
function stubFetch(routes: StubRoute[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const hit = routes.find((r) => r.match(url));
      const status = hit?.status ?? 200;
      return {
        ok: status < 400,
        status,
        headers: { get: () => "application/json" },
        json: async () => hit?.body ?? {},
      } as unknown as Response;
    }),
  );
}

const providersRoute = (hasKey: boolean): StubRoute => ({
  match: (url) =>
    url.includes("/api/model-providers") && !url.includes("/usage") && !url.includes("/key"),
  body: {
    providers: [
      {
        id: "openrouter",
        label: "OpenRouter",
        kind: "live",
        dashboardUrl: "https://openrouter.ai/credits",
        note: "Credit balance, daily/weekly/monthly spend and rate limits.",
        hasKey,
      },
      {
        id: "opencode-go",
        label: "opencode Go",
        kind: "live",
        dashboardUrl: "https://opencode.ai/auth",
        note: "Rolling usage windows. No dollar balance exists.",
        hasKey: false,
      },
      {
        id: "cursor",
        label: "Cursor",
        kind: "link",
        dashboardUrl: "https://cursor.com/dashboard/spending",
        note: "Usage and allowance live in Cursor’s Spending dashboard.",
        hasKey: false,
      },
    ],
    at: new Date().toISOString(),
  },
});

const usageError = (error: string, status = 502): StubRoute => ({
  match: (url) => url.includes("/api/model-providers/openrouter/usage"),
  status,
  body: { error },
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Model providers and API key screens QA at 375/768/1280 (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS for the panel, keyed by the scope id its markup carries. */
  function scopedCss(markup: string): string {
    const source = readFileSync(resolve(uiRoot, "src/components/ModelProvidersPanel.vue"), "utf8");
    const style = parse(source, { filename: "ModelProvidersPanel.vue" }).descriptor.styles[0];
    const marker = markup.indexOf("mp-panel");
    const tagStart = markup.lastIndexOf("<", marker);
    const scopeId = markup
      .slice(tagStart, markup.indexOf(">", marker))
      .match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error("ModelProvidersPanel scope ID was not present on .mp-panel");
    const compiled = compileStyle({
      filename: "ModelProvidersPanel.vue",
      id: scopeId,
      source: style?.content ?? "",
    });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  /** Mount the real panel against the current fetch stub and capture its markup. */
  async function captureMarkup(
    before?: (wrapper: VueWrapper) => Promise<void>,
  ): Promise<{ markup: string; css: string }> {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ModelProvidersPanel, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true, Transition: true } },
    });
    await flushPromises();
    await nextTick();
    if (before) await before(wrapper);
    const markup = document.body.innerHTML;
    const css = scopedCss(markup);
    wrapper.unmount();
    document.body.innerHTML = "";
    return { markup, css };
  }

  async function openFixturePage(
    label: string,
    markup: string,
    css: string,
    width: number,
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${css}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="main">${markup}</div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content a
   *  horizontal scroller clips or a closed <details> hides. */
  async function expectFits(page: Page, what: string, width: number): Promise<void> {
    const result = await page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (!el.offsetParent && style.position !== "fixed") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}.${String(el.className)} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return { documentWidth: document.documentElement.scrollWidth, overflowers };
    });
    expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
    expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
      width + 1,
    );
  }

  /** The rendered page must show the expected copy and never the fake key. */
  async function expectCopy(page: Page, expected: string[], what: string): Promise<void> {
    const text = (await page.locator(".mp-panel").textContent()) ?? "";
    for (const line of expected) {
      expect(text, `${what} is missing "${line}"`).toContain(line);
    }
    expect(await page.content(), `${what} echoes the key`).not.toContain(FAKE_KEY);
  }

  it.each(VIEWPORTS)("missing key: Not set, masked field, no key text at %spx", async (width) => {
    stubFetch([providersRoute(false)]);
    const { markup, css } = await captureMarkup();
    const page = await openFixturePage("api-key-missing", markup, css, width);
    try {
      await expectFits(page, "missing-key state", width);
      await expectCopy(page, ["Not set"], "missing-key state");
      const field = page.locator('[data-provider-id="openrouter"] input[type="password"]');
      expect(await field.count()).toBe(1);
      expect(await field.getAttribute("placeholder")).toBe("Paste your OpenRouter API key");
      expect(
        await page.locator('[data-test-id="model-providers-key-status"]').first().textContent(),
      ).toBe("Not set");
    } finally {
      await page.close();
    }
  });

  it.each(VIEWPORTS)(
    "saved key with a rejected key: Saved and a next step at %spx",
    async (width) => {
      stubFetch([providersRoute(true), usageError(REJECTED)]);
      const { markup, css } = await captureMarkup();
      const page = await openFixturePage("api-key-rejected", markup, css, width);
      try {
        await expectFits(page, "rejected-key state", width);
        await expectCopy(
          page,
          ["Saved", REJECTED, "Retry", "Replace key", "Clear"],
          "rejected-key state",
        );
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)("saved key with provider offline: next step at %spx", async (width) => {
    stubFetch([providersRoute(true), usageError(UNREACHABLE)]);
    const { markup, css } = await captureMarkup();
    const page = await openFixturePage("api-key-offline", markup, css, width);
    try {
      await expectFits(page, "offline state", width);
      await expectCopy(page, ["Saved", UNREACHABLE], "offline state");
    } finally {
      await page.close();
    }
  });

  it.each(VIEWPORTS)(
    "a save that the server refuses keeps the field masked at %spx",
    async (width) => {
      stubFetch([
        {
          match: (url) => url.includes("/key"),
          status: 400,
          body: { error: MULTI_LINE },
        },
        providersRoute(false),
      ]);
      const { markup, css } = await captureMarkup(async (wrapper) => {
        const row = wrapper.find('[data-provider-id="openrouter"]');
        await row.find(".mp-key-form input").setValue(`${FAKE_KEY}\nsecond line`);
        await row.find(".mp-key-form button").trigger("click");
        await flushPromises();
        await nextTick();
      });
      const page = await openFixturePage("api-key-refused-save", markup, css, width);
      try {
        await expectFits(page, "refused-save state", width);
        await expectCopy(page, [MULTI_LINE], "refused-save state");
        expect(
          await page.locator('[data-provider-id="openrouter"] input[type="password"]').count(),
        ).toBe(1);
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)("an empty Save explains itself instead of clearing at %spx", async (width) => {
    stubFetch([providersRoute(true), usageError(REJECTED)]);
    const { markup, css } = await captureMarkup(async (wrapper) => {
      const row = wrapper.find('[data-provider-id="openrouter"]');
      await row
        .findAll("button")
        .find((b) => b.text() === "Replace key")!
        .trigger("click");
      await nextTick();
      await row.find(".mp-key-form button").trigger("click");
      await flushPromises();
      await nextTick();
    });
    const page = await openFixturePage("api-key-empty-save", markup, css, width);
    try {
      await expectFits(page, "empty-save state", width);
      await expectCopy(page, [EMPTY_SAVE], "empty-save state");
    } finally {
      await page.close();
    }
  });
});
