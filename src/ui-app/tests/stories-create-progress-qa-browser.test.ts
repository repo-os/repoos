// @vitest-environment jsdom
/**
 * #1254 — QA pass: Stories create, link and progress flows at 375 / 768 / 1280 px.
 *
 * The real NewStoryPanel and StoriesView render in jsdom against seeded stores
 * and stubbed `fetch` responses (duplicate name, server failure, unreachable
 * server, success). The serialized markup is then injected into headless WebKit
 * with the built global stylesheet and freshly compiled scoped CSS, and each
 * width must pass the no-overflow and no-clipped-control audit. Nothing here
 * opens a visible browser; fixtures only, no live server.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import NewStoryPanel from "../src/components/NewStoryPanel.vue";
import StoriesView from "../src/views/StoriesView.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { SERVER_UNREACHABLE_MESSAGE } from "../src/api";
import { makeTask } from "./component-test-helpers";
import type { StoryDefinitionRecord } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

/** The built global stylesheet: the drawer, dialog and story card rules are global. */
function builtGlobalCss(): string {
  const dir = resolve(uiRoot, "../../dist/ui/assets");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".css") && f.startsWith("index-"));
  } catch {
    throw new Error(
      "dist/ui/assets was not found — run `bun run build` before the QA browser tests",
    );
  }
  if (!files.length) {
    throw new Error("Built global UI stylesheet was not found — run `bun run build`");
  }
  return files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
}

/** Compiled scoped CSS for one SFC, keyed to the scope id the mounted markup carries. */
function scopedCss(component: string, source: string, markup: string, markerClass: string): string {
  if (!markup.includes(markerClass)) return "";
  const parsed = parse(source, { filename: component });
  const marker = markup.indexOf(markerClass);
  const tagStart = markup.lastIndexOf("<", marker);
  const tag = markup.slice(tagStart, markup.indexOf(">", marker));
  const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
  if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
  const blocks = parsed.descriptor.styles;
  if (!blocks.length) throw new Error(`${component} has no <style> blocks`);
  return blocks
    .map((block) => {
      const compiled = compileStyle({
        filename: component,
        id: scopeId,
        source: block.content,
        scoped: true,
      });
      if (compiled.errors.length) throw compiled.errors[0]!;
      return compiled.code;
    })
    .join("\n");
}

const storiesSource = readFileSync(resolve(uiRoot, "src/views/StoriesView.vue"), "utf8");

/**
 * Scoped CSS for a captured page. NewStoryPanel and StoryPanel have no scoped
 * <style> block (their rules are global, in the built stylesheet), so only the
 * stories list contributes scoped rules.
 */
function pageScopedCss(markup: string): string {
  return [
    scopedCss("StoriesView.vue", storiesSource, markup, "story-card"),
    scopedCss("StoriesView.vue", storiesSource, markup, "stories-notice"),
  ].join("\n");
}

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** A long but ordinary story name: the common case that has to wrap. */
const LONG_NAME =
  "Quarterly platform migration story covering the runbook, the cutover checklist and the customer-facing launch notes";

/** One very long unbroken token, the worst case for wrapping an error or name. */
const UNBROKEN = `supercalifragilisticexpialidocious-${"x".repeat(140)}`;

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

/** A story with `total` tagged tasks, the first `done` of them finished. */
function storyFixtureTasks(
  name: string,
  total: number,
  done: number,
  idStart: number,
): ReturnType<typeof makeTask>[] {
  return Array.from({ length: total }, (_, i) => {
    const n = idStart + i;
    return makeTask({
      id: String(n).padStart(4, "0"),
      title: `${name} slice ${i + 1}`,
      status: (i < done ? "done" : i === done ? "active" : "ready") as ReturnType<
        typeof makeTask
      >["status"],
      story: name,
      updated_at: iso(n),
      areas: ["web"],
    });
  });
}

function definition(
  n: number,
  name: string,
  body: string,
  minutesAgo: number,
): StoryDefinitionRecord {
  return {
    key: name.toLowerCase(),
    name,
    number: String(n).padStart(4, "0"),
    path: `stories/story-${String(n).padStart(4, "0")}.md`,
    body,
    createdAt: iso(minutesAgo + 60),
    updatedAt: iso(minutesAgo),
    createdBy: "hello@repoos.org",
  };
}

/** A zero-task registered story, a 40-task story with 10 done, and a long-name story. */
function fixtureStories(): {
  tasks: ReturnType<typeof makeTask>[];
  definitions: StoryDefinitionRecord[];
} {
  const big = "Big rollout";
  const tasks = [...storyFixtureTasks(big, 40, 10, 1), ...storyFixtureTasks(LONG_NAME, 2, 2, 100)];
  const definitions = [
    definition(1, "Empty planning story", "Nothing scheduled yet.", 5000),
    definition(2, big, "Forty slices, ten done.", 1),
    definition(3, LONG_NAME, `Long excerpt. ${UNBROKEN}`, 2000),
  ];
  return { tasks, definitions };
}

function makeAppRouter(): Router {
  const div = { template: "<div />" };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "dashboard", component: div },
      { path: "/work", name: "work", component: div },
      { path: "/stories", name: "stories", component: div },
      { path: "/agents", name: "agents", component: div },
    ],
  });
}

/** Stub `fetch` with one JSON response (or a network failure when `body` is null). */
function stubFetch(status: number, body: unknown | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (body === null) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

/* ── Mount helpers (real components, jsdom) ──────────────────────────────── */

async function mountStoriesView(
  tasks: ReturnType<typeof makeTask>[],
  definitions: StoryDefinitionRecord[],
  openFirst = false,
): Promise<string> {
  setActivePinia(createPinia());
  const config = useConfigStore();
  config.data = { stories: { enabled: true } };
  const repo = useRepoStore();
  repo.tasks = tasks;
  repo.storyDefinitions = definitions;
  const router: Router = makeAppRouter();
  await router.push("/stories");
  await router.isReady();
  const wrapper = mount(StoriesView, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { NewStoryPanel: true, StoryPanel: !openFirst },
    },
  });
  await flushPromises();
  if (openFirst) {
    await wrapper.get("button.story-head").trigger("click");
    await flushPromises();
  }
  await new Promise((r) => setTimeout(r, 0));
  const markup = document.body.innerHTML;
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

/**
 * Open the real New story dialog with a PM agent configured, optionally fill it
 * in and submit. Returns the body markup after the submit settles.
 */
async function mountNewStory(options: {
  name?: string;
  description?: string;
  submit?: boolean;
}): Promise<string> {
  setActivePinia(createPinia());
  const config = useConfigStore();
  config.loaded = true;
  config.agents = [{ name: "pm", enabled: true }] as never;
  useRepoStore().storyDefinitions = [];
  useUiStore().openNewStory();
  const router: Router = makeAppRouter();
  await router.push("/stories");
  await router.isReady();
  const wrapper = mount(NewStoryPanel, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { AgentModelControl: true, VoiceDictate: true, ScreenshotViewer: true },
    },
  });
  await flushPromises();
  if (options.name !== undefined) setField("#ns-story-name", options.name);
  if (options.description !== undefined) setField("#ns-story-desc", options.description);
  if (options.submit) {
    // dispatchEvent, not .click(): the shared Button forwards its listener through
    // Radix's Primitive, which only the native event path reaches under jsdom.
    findButton("Create story")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
  }
  const markup = captureMarkup();
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

/**
 * The serialized markup, with typed field values written into the markup. A
 * live `input.value` or textarea's state is not part of `innerHTML`, so without
 * this the browser fixture would show every field empty.
 */
function captureMarkup(): string {
  for (const input of document.body.querySelectorAll<HTMLInputElement>("input")) {
    input.setAttribute("value", input.value);
  }
  for (const area of document.body.querySelectorAll<HTMLTextAreaElement>("textarea")) {
    area.textContent = area.value;
  }
  return document.body.innerHTML;
}

/** Set a value on a rendered field and fire the event Vue's v-model listens for. */
function setField(selector: string, value: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!el) throw new Error(`field not rendered: ${selector}`);
  el.value = value;
  el.dispatchEvent(new Event("input"));
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label,
  );
}

/* ── The suite ───────────────────────────────────────────────────────────── */

describe.skipIf(!existsSync(webkit.executablePath()))(
  "#1254 Stories create, link and progress QA at 375/768/1280 (WebKit, fixtures)",
  () => {
    let browser: Browser;
    let css: string;

    beforeAll(async () => {
      browser = await webkit.launch();
      css = builtGlobalCss();
    });
    afterAll(async () => {
      await browser?.close();
    });

    async function openFixturePage(label: string, markup: string, width: number): Promise<Page> {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
          `<style>${css}</style><style>${pageScopedCss(markup)}</style>` +
          `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
          `<div class="app-shell"><div class="body"><div class="main">${markup}</div></div></div>`,
      );
      const shots = process.env.QA_SHOTS;
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: resolve(shots, `${label}-${width}.png`), fullPage: true });
      }
      return page;
    }

    /** Off-viewport elements, clipped controls and dead internal links. */
    async function audit(page: Page): Promise<{
      documentWidth: number;
      overflowers: string[];
      clippedControls: string[];
    }> {
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const inHorizontalScroller = (start: Element | null): boolean => {
          for (let el: HTMLElement | null = start as HTMLElement; el; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (
              (s.overflowX === "auto" || s.overflowX === "scroll") &&
              el.scrollWidth > el.clientWidth + 1
            )
              return true;
          }
          return false;
        };
        const describe = (el: Element): string =>
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""}`;
        const overflowers: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          if (inHorizontalScroller(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > vw + 1 || rect.left < -1) {
            overflowers.push(
              `${describe(el)} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
            );
          }
        }
        const clippedControls: string[] = [];
        for (const el of document.body.querySelectorAll<HTMLElement>(
          "button, a[href], select, input, textarea, [role='combobox'], [role='button']",
        )) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (!el.offsetParent && style.position !== "fixed") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) {
              const box = p.getBoundingClientRect();
              if (rect.left < box.left - 1 || rect.right > box.right + 1) {
                clippedControls.push(
                  `${describe(el)} "${(el.textContent ?? "").trim().slice(0, 30)}" clipped by ${describe(p)}`,
                );
                break;
              }
            }
            if (ps.position === "fixed") break;
          }
        }
        return {
          documentWidth: document.documentElement.scrollWidth,
          overflowers,
          clippedControls,
        };
      });
    }

    async function expectFits(page: Page, what: string, width: number): Promise<void> {
      const result = await audit(page);
      expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
      expect(result.clippedControls, `${what} at ${width}px clips a control`).toEqual([]);
      expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
        width + 1,
      );
    }

    /* ── 1. Create: empty form, duplicate name, failure ───────────────────── */

    it.each(VIEWPORTS)(
      "empty create form explains why Create story is off at %spx",
      async (width) => {
        stubFetch(200, {});
        const markup = await mountNewStory({});
        const page = await openFixturePage("create-empty", markup, width);
        try {
          await expectFits(page, "empty create form", width);
          const state = await page.evaluate(() => {
            const create = Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent?.trim() === "Create story",
            );
            return {
              disabled: create?.hasAttribute("disabled") ?? false,
              hint: document.querySelector(".ff-hint")?.textContent?.trim() ?? "",
            };
          });
          expect(state.disabled).toBe(true);
          // A disabled button with no reason is a dead control; say what is missing.
          expect(state.hint).toBe("Add a description to create the story.");
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)(
      "duplicate story name shows the server's plain-English reason and keeps the form at %spx",
      async (width) => {
        const name = `${LONG_NAME}`;
        stubFetch(409, {
          ok: false,
          reason: `A story named "${name}" already exists. Choose a different name.`,
        });
        const markup = await mountNewStory({
          name,
          description: "Duplicate of an existing story.",
          submit: true,
        });
        const page = await openFixturePage("create-duplicate", markup, width);
        try {
          await expectFits(page, "duplicate-name error", width);
          const state = await page.evaluate(() => ({
            error: document.querySelector(".ff-error")?.textContent?.trim() ?? "",
            name:
              (document.querySelector("#ns-story-name") as HTMLInputElement | null)?.value ?? "",
            description:
              (document.querySelector("#ns-story-desc") as HTMLTextAreaElement | null)?.value ?? "",
            saved: document.body.textContent?.includes("Story saved") ?? false,
          }));
          expect(state.error).toContain("already exists");
          expect(state.error).toContain("Choose a different name.");
          // The reader's typing survives the failed submit; nothing was saved.
          expect(state.name).toBe(name);
          expect(state.description).toBe("Duplicate of an existing story.");
          expect(state.saved).toBe(false);
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)(
      "server failure and unreachable server both read as plain English at %spx",
      async (width) => {
        stubFetch(500, { ok: false, reason: `The story store is locked ${UNBROKEN}` });
        const markup = await mountNewStory({
          name: "Failure case",
          description: "Server fails.",
          submit: true,
        });
        const page = await openFixturePage("create-failure", markup, width);
        try {
          await expectFits(page, "server-failure error", width);
          const error = await page.evaluate(
            () => document.querySelector(".ff-error")?.textContent?.trim() ?? "",
          );
          expect(error).toContain("The story store is locked");
        } finally {
          await page.close();
        }

        stubFetch(0, null);
        const offline = await mountNewStory({
          name: "Offline case",
          description: "Server is down.",
          submit: true,
        });
        const offlinePage = await openFixturePage("create-offline", offline, width);
        try {
          await expectFits(offlinePage, "unreachable-server error", width);
          const error = await offlinePage.evaluate(
            () => document.querySelector(".ff-error")?.textContent?.trim() ?? "",
          );
          expect(error).toBe(SERVER_UNREACHABLE_MESSAGE);
        } finally {
          await offlinePage.close();
        }
      },
    );

    /* ── 2. Progress: zero tasks, many tasks, long names ─────────────────── */

    it.each(VIEWPORTS)(
      "stories with zero tasks, 40 tasks and a long name fit at %spx",
      async (width) => {
        stubFetch(200, {});
        const { tasks, definitions } = fixtureStories();
        const markup = await mountStoriesView(tasks, definitions);
        const page = await openFixturePage("progress-list", markup, width);
        try {
          await expectFits(page, "progress list", width);
          const cards = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".story-card")).map((card) => ({
              name: card.querySelector(".story-name")?.textContent?.trim() ?? "",
              width: (card.querySelector(".story-progress-wrap i") as HTMLElement | null)?.style
                .width,
            })),
          );
          const empty = cards.find((c) => c.name === "Empty planning story");
          const big = cards.find((c) => c.name === "Big rollout");
          // Zero tasks reads as 0%, never NaN% or a divide-by-zero artifact.
          expect(empty?.width).toBe("0%");
          expect(big?.width).toBe("25%");
        } finally {
          await page.close();
        }
      },
    );

    it.each(VIEWPORTS)(
      "the story panel for a 40-task story and an empty story fits at %spx",
      async (width) => {
        stubFetch(200, {});
        const { tasks, definitions } = fixtureStories();
        const markup = await mountStoriesView(
          tasks.filter((t) => t.story === "Big rollout"),
          definitions.filter((d) => d.name === "Big rollout"),
          true,
        );
        const page = await openFixturePage("progress-panel", markup, width);
        try {
          await expectFits(page, "story panel", width);
          const summary = await page.evaluate(
            () => document.querySelector(".story-panel-sub")?.textContent?.trim() ?? "",
          );
          expect(summary).toContain("40 tasks");
          expect(summary).toContain("10 done");
        } finally {
          await page.close();
        }
      },
    );
  },
);
