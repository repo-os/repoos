// @vitest-environment jsdom
/**
 * #1246 — QA pass: task cards in every state with extreme content.
 *
 * Mounts the real `TaskCard` in jsdom for each fixture (every card state the
 * board can show, plus long titles, unbroken titles, many labels and missing
 * fields), serializes it, and renders it in headless WebKit at 375 / 768 /
 * 1280 px. Every descendant of a card must stay inside the card (the card is
 * `overflow-hidden`, so a child that spills is silently clipped), the card must
 * stay inside the viewport, and no placeholder text such as `undefined` may
 * leak into a card. Archived tasks never reach a card: the store parks them,
 * which is asserted directly in jsdom.
 *
 * Only fixtures and headless WebKit are used; no visible browser is opened.
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import { makeTask, FakeEventSource } from "./component-test-helpers";
import type { Task } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

// The board shares the viewport between its columns, so the card's width
// depends on how many columns are visible. These are representative widths:
// one full-width card on a phone, two columns on a tablet, and five columns on
// a laptop, where the narrow card is the stress case.
const CARD_WIDTH: Record<(typeof VIEWPORTS)[number], number> = {
  375: 351,
  768: 336,
  1280: 220,
};

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const LONG_TITLE =
  "Reconcile the nightly board refresh with the review-round audit trail so every reviewer verdict, check rerun and handoff retry keeps its original context across restarts and reloads of the server";
const UNBROKEN_TITLE = "unbroken_" + "segment".repeat(30);
const MANY_AREAS = [
  "web",
  "core",
  "server",
  "cli",
  "ui",
  "docs",
  "release",
  "integrations",
  "storage",
  "billing",
];
const MANY_TAGS = Array.from({ length: 14 }, (_, i) => `label-${i}-with-a-long-name`);
const MANY_BLOCKERS = ["1402", "1403", "1404", "1405"].map((id) => ({
  id,
  state: "waiting" as const,
}));

/** Every card state and extreme-content fixture, keyed by a legible name. */
const FIXTURES: Record<string, { over: Partial<Task>; paused?: boolean }> = {
  baseline: { over: { id: "1401", title: "Short ready task", status: "ready" } },
  "long-title": { over: { id: "1411", title: LONG_TITLE, status: "active" } },
  "unbroken-title": { over: { id: "1412", title: UNBROKEN_TITLE, status: "ready" } },
  "many-labels": {
    over: {
      id: "1413",
      title: "Many labels and blockers",
      status: "ready",
      area: MANY_AREAS.join(","),
      areas: MANY_AREAS,
      tags: MANY_TAGS,
      blockedBy: MANY_BLOCKERS,
      type: "architecture-refactor-with-a-very-long-type-name",
    },
  },
  held: {
    over: {
      id: "1414",
      title: "Held until design sign-off",
      status: "ready",
      isHeld: true,
      holdReason:
        "waiting on the design review for the whole onboarding flow, including the mobile variants and the empty states",
      holdBy: "t@t",
      holdUntil: FUTURE,
    },
  },
  paused: { over: { id: "1415", title: "Paused engineer", status: "active" }, paused: true },
  "needs-input": {
    over: {
      id: "1416",
      title: "Agent asked a question",
      status: "active",
      needsInput: true,
      needsInputReason: "cto-escalation",
      needsInputDetail:
        "The agent needs a decision on whether archived tasks keep their checks, their review history and their attached screenshots, or whether those are dropped when a task is archived.",
    },
  },
  "human-assigned": {
    over: {
      id: "1417",
      title: "Human step: sign the release note",
      status: "ready",
      assignee: "human",
      assignedTo: "a-reviewer-with-a-long-handle@example.test",
    },
  },
  "review-needs-merge": {
    over: {
      id: "1418",
      title: "Review branch drifted from main",
      status: "review",
      needsMerge: true,
      area: "web,core,server",
      areas: ["web", "core", "server"],
    },
  },
  "feature-long-id": {
    over: {
      id: "123456789",
      title: "Feature card with a long id and a p1 badge",
      status: "ready",
      type: "feature",
      priority: "p1",
    },
  },
  "hotfix-long-id": {
    over: {
      id: "123456789",
      title: "Hotfix on main with a long id, a feature type and a p1 badge",
      status: "active",
      type: "feature",
      priority: "p1",
      hotfix: true,
      hotfixTarget: "main",
    },
  },
  "review-hotfix-merge": {
    over: {
      id: "123456789",
      title: "Review hotfix that also needs a merge",
      status: "review",
      needsMerge: true,
      type: "feature",
      priority: "p1",
      hotfix: true,
      hotfixTarget: "main",
    },
  },
  "missing-fields": {
    over: {
      id: "1419",
      title: "",
      status: "ready",
      type: "" as Task["type"],
      priority: "" as Task["priority"],
      area: "",
      areas: [],
      branch: "",
      body: "",
      created_at: null,
      updated_at: null,
    },
  },
};

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

function stubFetch(task: Task) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index")) return json({ tasks: [task], counts: {}, taskCount: 1 });
      if (url.includes("/diff-stats"))
        return json({ ok: true, stats: { filesChanged: 0, additions: 0, deletions: 0 } });
      return json({});
    }),
  );
}

/** Mount the real TaskCard for one fixture and return its serialized markup. */
async function cardMarkup(name: string): Promise<string> {
  const { over, paused } = FIXTURES[name]!;
  const task = makeTask({ title: "Test task", status: "ready", ...over });
  const pinia: Pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal("EventSource", FakeEventSource);
  stubFetch(task);
  const repo = useRepoStore();
  await repo.init();
  if (paused) repo.pausedIds = [task.id];
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const markup = wrapper.html();
  wrapper.unmount();
  document.body.innerHTML = "";
  return markup;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Task card states at 375/768/1280 (WebKit, fixtures)", () => {
  let browser: Browser;
  let globalCss: string;
  const markups = new Map<string, string>();

  beforeAll(async () => {
    for (const name of Object.keys(FIXTURES)) markups.set(name, await cardMarkup(name));
    browser = await webkit.launch();
    const assetDir = resolve(uiRoot, "../../dist/ui/assets");
    const cssAsset = (await readdir(assetDir)).find((name) => /^index-.*\.css$/.test(name));
    if (!cssAsset) throw new Error("Built global UI stylesheet was not found");
    globalCss = await readFile(resolve(assetDir, cssAsset), "utf8");
  });
  afterAll(async () => {
    await browser?.close();
  });

  /** One card in a column of the width the board gives it at this viewport. */
  async function openCard(name: string, width: number): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<main style="padding:12px"><div style="width:${CARD_WIDTH[width as (typeof VIEWPORTS)[number]]}px">${markups.get(name)}</div></main>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      // JPEG keeps the 1280px capture under the staged-artifact scan limit.
      await page.screenshot({ path: resolve(shots, `card-${name}-${width}.jpg`), fullPage: true });
    }
    return page;
  }

  /** Descendants of each card that spill past the card edge (the card clips
   *  overflow, so a spill is invisible to the reader) or past the viewport. */
  async function clipping(
    page: Page,
  ): Promise<{ cards: number; spills: string[]; offscreen: boolean }> {
    return page.evaluate(() => {
      const vw = window.innerWidth;
      const inHorizontalScroller = (start: Element): boolean => {
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
      const spills: string[] = [];
      const cards = [...document.querySelectorAll<HTMLElement>(".task-card")];
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        if (box.right > vw + 1 || box.left < -1)
          spills.push(`card #${card.dataset.taskId} off viewport`);
        for (const el of card.querySelectorAll<HTMLElement>("*")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (el.closest("details:not([open])")) continue;
          if (inHorizontalScroller(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > box.right + 1 || rect.left < box.left - 1) {
            spills.push(
              `${el.tagName.toLowerCase()}.${String(el.className).split(" ").filter(Boolean).join(".")} at ${Math.round(rect.left)}..${Math.round(rect.right)} (card ${Math.round(box.left)}..${Math.round(box.right)})`,
            );
          }
        }
      }
      const offscreen = document.documentElement.scrollWidth > vw + 1;
      return { cards: cards.length, spills, offscreen };
    });
  }

  it.each(
    VIEWPORTS.flatMap((width) => Object.keys(FIXTURES).map((name) => [name, width] as const)),
  )("%s card renders without clipping or overflow at %spx", async (name, width) => {
    const page = await openCard(name, width);
    try {
      const result = await clipping(page);
      expect(result.cards, `${name} renders exactly one card`).toBe(1);
      expect(result.spills, `${name} at ${width}px spills outside its card`).toEqual([]);
      expect(result.offscreen, `${name} at ${width}px widens the document`).toBe(false);
      // Placeholder text must never leak into a card when a field is missing.
      const text = (await page.locator(".task-card").first().innerText()).trim();
      expect(text).not.toMatch(/\b(undefined|null|NaN)\b|\[object Object\]/);
    } finally {
      await page.close();
    }
  });

  it.each(VIEWPORTS)("each state shows its own badge or status at %spx", async (width) => {
    const expectations: Array<[string, string]> = [
      ["held", ".tc-held"],
      [
        "needs-input",
        ".tc-needs-input, .tc-needs-input-icon, [data-test-id='task-card-needs-input-detail']",
      ],
      ["human-assigned", ".tc-human-chip"],
      ["review-needs-merge", ".tc-merge"],
    ];
    for (const [name, selector] of expectations) {
      const page = await openCard(name, width);
      try {
        expect(await page.locator(selector).count(), `${name} shows ${selector}`).toBeGreaterThan(
          0,
        );
      } finally {
        await page.close();
      }
    }
  });

  it.each(
    VIEWPORTS.flatMap((width) => Object.keys(FIXTURES).map((name) => [name, width] as const)),
  )("%s top line stays on one row at %spx (#1279)", async (name, width) => {
    const page = await openCard(name, width);
    try {
      const row = await page
        .locator(".tc-top-line")
        .first()
        .evaluate((el) => {
          const children = [...el.children] as HTMLElement[];
          return {
            rowHeight: el.getBoundingClientRect().height,
            tallestChild: Math.max(...children.map((c) => c.getBoundingClientRect().height)),
          };
        });
      // A wrapped flex row is taller than its tallest control; a control that
      // wraps its own text is taller than one line of the card's chips.
      expect(row.rowHeight, `${name} top line wraps at ${width}px`).toBeLessThanOrEqual(
        row.tallestChild + 1,
      );
      expect(row.tallestChild, `${name} top line item wraps at ${width}px`).toBeLessThanOrEqual(24);
    } finally {
      await page.close();
    }
  });
});

describe("Task card top line (jsdom, measured fit)", () => {
  /** The type chip's text, with its clipping stubbed (jsdom has no layout). */
  async function typeChipText(name: string, type: string, clipped: boolean) {
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return clipped && this.textContent?.trim() === type ? 120 : 40;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(60);
    const dom = document.createElement("div");
    dom.innerHTML = await cardMarkup(name);
    return dom.querySelector(`.tc-top-line [data-tip="${type}"]`)?.textContent?.trim();
  }

  it.each([
    ["feature-long-id", "feature", true, "feat"],
    ["feature-long-id", "feature", false, "feature"],
    // Only feature shortens; any other type that still clips is hidden.
    ["baseline", "bug", true, undefined],
  ])("%s type %s (clipped: %s) shows %s (#1279)", async (name, type, clipped, shown) => {
    expect(await typeChipText(name, type, clipped)).toBe(shown);
  });

  it("hides the type when even feat is clipped; the id keeps its text (#1279)", async () => {
    // Every type chip (full word or feat) reports clipping, so the type gives way.
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return this.getAttribute("data-tip") === "feature" ? 120 : 40;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(60);
    const dom = document.createElement("div");
    dom.innerHTML = await cardMarkup("feature-long-id");
    expect(dom.querySelector('.tc-top-line [data-tip="feature"]')).toBeNull();
    expect(dom.querySelector(".tc-top-line")?.textContent).toContain("#123456789");
  });

  it("moves clipped hotfix and merge badges to the chip row; the type stays (#1279)", async () => {
    // Only the badges report clipping, so the type is left alone.
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return this.classList.contains("hotfix-badge") || this.classList.contains("tc-merge")
        ? 120
        : 40;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(60);
    const dom = document.createElement("div");
    dom.innerHTML = await cardMarkup("review-hotfix-merge");
    const topLine = dom.querySelector(".tc-top-line");
    expect(topLine?.querySelector(".tc-merge, .hotfix-badge")).toBeNull();
    expect(dom.querySelector(".tc-merge")).not.toBeNull();
    expect(dom.querySelector(".hotfix-badge")).not.toBeNull();
    expect(topLine?.querySelector('[data-tip="feature"]')?.textContent?.trim()).toBe("feature");
  });

  it("re-fits the type label when the hotfix target changes (#1279)", async () => {
    let clipped = false;
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
      return clipped && this.textContent?.trim() === "feature" ? 120 : 40;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(60);
    const task = makeTask({
      id: "1420",
      status: "active",
      type: "feature",
      priority: "p1",
      hotfix: true,
      hotfixTarget: "branch",
    });
    const pinia: Pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal("EventSource", FakeEventSource);
    stubFetch(task);
    await useRepoStore().init();
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    const chipText = () => wrapper.find(".tc-top-line [data-tip='feature']").text();
    expect(chipText()).toBe("feature");

    clipped = true;
    // The props type from `withDefaults` does not accept a partial `task` here.
    await wrapper.setProps({ task: { ...task, hotfixTarget: "main" } } as never);
    await settle();
    expect(chipText()).toBe("feat");
    wrapper.unmount();
  });

  it("the number is plain text, not a copy button, on the board card (#1279)", async () => {
    const dom = document.createElement("div");
    dom.innerHTML = await cardMarkup("baseline");
    const number = dom.querySelector(".tc-top-line")?.firstElementChild;
    expect(number?.tagName).toBe("SPAN");
    expect(number?.textContent?.trim()).toBe("#1401");
    expect(dom.querySelector(".copyable-number")).toBeNull();
  });
});

describe("Task card states (jsdom, store and markup rules)", () => {
  it("archived tasks never render as board cards and sit in archivedTasks", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.tasks = [makeTask({ id: "1420", status: "ready", isArchived: true })];
    expect(repo.byStatus("ready")).toEqual([]);
    expect(repo.archivedTasks.map((t) => t.id)).toEqual(["1420"]);
  });

  it("a paused card shows the stalled paused badge, not a running one", async () => {
    const markup = await cardMarkup("paused");
    expect(markup).toContain("tc-stalled");
  });
});
