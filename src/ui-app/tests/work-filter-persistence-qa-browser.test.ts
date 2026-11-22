// @vitest-environment jsdom
/**
 * #1257 — QA pass: Work board search, saved filters and sort persistence.
 *
 * Covers reload, project switch and clear-all for the Work queue search and
 * quick filters (URL-backed, #1138) on the phone queue (375 px) and on the
 * desktop board (768 and 1280 px). The interaction assertions run on the real
 * components in jsdom against fixtures. The active-filter chip bar is then
 * rendered in headless WebKit at 375 / 768 / 1280 px, where every chip and the
 * clear control must stay inside the viewport. No browser window is opened and
 * no live server is involved.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import BoardQueueFilters from "../src/components/BoardQueueFilters.vue";
import BoardQueueSearch from "../src/components/BoardQueueSearch.vue";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import WorkView from "../src/views/WorkView.vue";
import { useRepoStore } from "../src/stores/repo";
import * as apiMod from "../src/api";
import type { Task } from "../src/types";
import {
  ignoredWorkQueueFilterChips,
  NO_WORK_QUEUE_FILTERS,
  type WorkQueueFilterChip,
  type WorkQueueFilters,
  type WorkQueueSort,
} from "../src/lib/workQueueFilters";

const uiRoot = resolve(__dirname, "..");

const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string | string[]>,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => routeState.router,
}));

const api = vi.spyOn(apiMod, "api");
const buttonStub = {
  template: "<button v-bind='$attrs'><slot /></button>",
  inheritAttrs: false,
};
const selectStub = { template: "<div><slot /></div>" };

/** Desktop board stub that lists the task ids each column receives. */
const boardColumnStub = {
  props: ["col", "tasks"],
  template:
    "<div class='desktop-board-column' :data-status='col.id'>" +
    "<span v-for='t in tasks' :key='t.id' class='board-task' :data-task-id='t.id' /></div>",
};

function workViewStubs() {
  return {
    BoardColumn: boardColumnStub,
    IntegrationStatusBar: { template: "<div class='integration-status-bar' />" },
    RouterLink: { template: "<a><slot /></a>" },
    Button: buttonStub,
    Select: selectStub,
    // The real sort trigger is 210px wide (WorkView), and its menu stays closed.
    // Keep both in the header's layout so the row fits as it does in the app.
    SelectTrigger: { template: "<div><slot /></div>" },
    SelectContent: { template: "<div hidden><slot /></div>" },
    SelectItem: selectStub,
    SelectViewport: selectStub,
    SelectValue: selectStub,
    PipelineView: true,
    MobileWorkQueue: { template: "<div class='mobile-queue-stub' />" },
  };
}

function stubViewport(width: number): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: width < 720,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal("innerWidth", width);
}

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id} about the ${id === "0001" ? "login" : "billing"} flow`,
    type: "feature",
    status: "ready",
    priority: "p1",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "tester",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    path: `work/${id}-task.md`,
    absPath: `/work/${id}-task.md`,
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    ...extra,
  } as Task;
}

/** Project A: two tasks match the login search, one does not. */
const projectA = (): Task[] => [
  task("0001", { priority: "p1", area: "web" }),
  task("0002", { priority: "p2", area: "api", title: "Retry the billing webhook" }),
  task("0003", { priority: "p1", area: "web", title: "Billing export" }),
];

/** Every wrapper mounted in a case, unmounted after it so no board outlives its test. */
const mounted: { unmount: () => void }[] = [];

function mountDesktop(query: Record<string, string | string[]>) {
  routeState.query = query;
  const wrapper = mount(WorkView, { global: { stubs: workViewStubs() } });
  mounted.push(wrapper);
  return wrapper;
}

function visibleIds(wrapper: ReturnType<typeof mountDesktop>): string[] {
  return wrapper.findAll(".board-task").map((el) => el.attributes("data-task-id") ?? "");
}

function chipKeys(wrapper: ReturnType<typeof mountDesktop>): (string | undefined)[] {
  return wrapper
    .findAll(".board-queue-filters [data-filter-key]")
    .map((el) => el.attributes("data-filter-key"));
}

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  routeState.query = {};
  routeState.router.replace.mockReset();
  routeState.router.push.mockReset();
  api.mockReset();
  stubViewport(1280);
  const repo = useRepoStore();
  repo.loading = false;
  repo.tasks = projectA();
});

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  api.mockReset();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Work board queue filters on desktop (768 / 1280 px)", () => {
  it("applies the URL search and priority and shows only the priority chip", async () => {
    const wrapper = mountDesktop({ q: "login", priority: "p1" });
    await flushPromises();
    expect(visibleIds(wrapper)).toEqual(["0001"]);
    expect(chipKeys(wrapper)).toEqual(["priority"]);
    expect(
      (wrapper.find('[data-testid="board-queue-search"]').element as HTMLInputElement).value,
    ).toBe("login");
    expect(wrapper.find(".board-queue-filters").text()).not.toContain("Search:");
    expect(wrapper.find(".board-queue-filters").text()).toContain("Priority: P1");
  });

  it("a search alone shows no filter bar on the board: the search box has its own clear", async () => {
    const wrapper = mountDesktop({ q: "login" });
    await flushPromises();
    expect(visibleIds(wrapper)).toEqual(["0001"]);
    expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
    expect(wrapper.find('[data-testid="board-queue-search-clear"]').exists()).toBe(true);
  });

  it("shows no chip bar and hides nothing without queue filters", async () => {
    const wrapper = mountDesktop({});
    await flushPromises();
    expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
    expect(visibleIds(wrapper).sort()).toEqual(["0001", "0002", "0003"]);
  });

  it("reload keeps the same filters and the same visible tasks", async () => {
    const first = mountDesktop({ q: "billing", area: "web" });
    await flushPromises();
    const before = visibleIds(first);
    first.unmount();

    const reloaded = mountDesktop({ q: "billing", area: "web" });
    await flushPromises();
    expect(visibleIds(reloaded)).toEqual(before);
    expect(before).toEqual(["0003"]);
    expect(chipKeys(reloaded)).toEqual(["area"]);
  });

  it("the pipeline shows neither the search box nor the filter bar", async () => {
    window.localStorage.setItem("repoos.work.view-mode", "pipeline");
    const wrapper = mountDesktop({ q: "login", priority: "p1" });
    await flushPromises();
    expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
    expect(wrapper.find('[data-testid="board-queue-search"]').exists()).toBe(false);
  });

  it("the search comes back, with its text, when switching from Pipeline to Board", async () => {
    const wrapper = mountDesktop({ q: "login" });
    await flushPromises();
    for (const view of ["Pipeline", "Board"]) {
      const toggle = wrapper.findAll(".view-toggle-btn").find((button) => button.text() === view);
      expect(toggle).toBeDefined();
      await toggle!.trigger("click");
      expect(wrapper.find('[data-testid="board-queue-search"]').exists()).toBe(view === "Board");
      expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
    }
    expect(wrapper.get<HTMLInputElement>('[data-testid="board-queue-search"]').element.value).toBe(
      "login",
    );
    expect(visibleIds(wrapper)).toEqual(["0001"]);
  });

  it("an unusable URL value shows an ignored chip and Clear removes it", async () => {
    const wrapper = mountDesktop({ priority: "p9", task: "0001" });
    await flushPromises();
    expect(visibleIds(wrapper).sort()).toEqual(["0001", "0002", "0003"]);
    const ignored = wrapper.find('.board-queue-filters [data-filter-key="priority"]');
    expect(ignored.text()).toBe("Ignored filter: priority=p9");
    expect(ignored.classes()).toContain("filter-chip-ignored");
    await wrapper.find(".board-queue-filters .filter-clear").trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledWith({ query: { task: "0001" } });
  });

  it("clear-all removes only the queue filter keys and keeps the drawer and status", async () => {
    const wrapper = mountDesktop({
      q: "login",
      priority: "p1",
      area: "web",
      story: "auth",
      mine: "1",
      task: "0001",
      tab: "review",
      status: "ready",
    });
    await flushPromises();
    await wrapper.find(".board-queue-filters .filter-clear").trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledTimes(1);
    expect(routeState.router.replace).toHaveBeenCalledWith({
      query: { task: "0001", tab: "review", status: "ready" },
    });
  });

  it("the board search box shows the URL query and writes q, keeping the other keys", async () => {
    const wrapper = mountDesktop({ priority: "p1", task: "0001" });
    await flushPromises();
    const input = wrapper.find('[data-testid="board-queue-search"]');
    expect((input.element as HTMLInputElement).value).toBe("");
    await input.setValue("login");
    expect(routeState.router.replace).toHaveBeenCalledTimes(1);
    expect(routeState.router.replace).toHaveBeenCalledWith({
      query: { priority: "p1", task: "0001", q: "login" },
    });
  });

  it("the board search box reflects a q that arrives from the URL", async () => {
    const wrapper = mountDesktop({ q: "billing" });
    await flushPromises();
    const input = wrapper.find('[data-testid="board-queue-search"]');
    expect((input.element as HTMLInputElement).value).toBe("billing");
    expect(visibleIds(wrapper).sort()).toEqual(["0002", "0003"]);
  });

  it("the board search clear button removes only q", async () => {
    const wrapper = mountDesktop({ q: "login", area: "web", status: "ready" });
    await flushPromises();
    await wrapper.find('[data-testid="board-queue-search-clear"]').trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledWith({
      query: { area: "web", status: "ready" },
    });
  });

  it("keeps the query visible and clearable when switching between views", async () => {
    window.localStorage.setItem("repoos.work.view-mode", "pipeline");
    routeState.query = { q: "login" };
    const wrapper = mount(WorkView, {
      global: {
        stubs: {
          ...workViewStubs(),
          Button: false,
          Select: false,
          SelectTrigger: false,
          SelectContent: false,
          SelectItem: false,
          SelectViewport: false,
          SelectValue: false,
        },
      },
    });
    await flushPromises();
    // The pipeline has no search box; the URL value is kept for the board.
    expect(wrapper.find('[data-testid="board-queue-search"]').exists()).toBe(false);
    const boardButton = wrapper
      .findAll(".view-toggle-btn")
      .find((button) => button.text() === "Board");
    expect(boardButton).toBeDefined();
    await boardButton!.trigger("click");
    expect(wrapper.get<HTMLInputElement>('[data-testid="board-queue-search"]').element.value).toBe(
      "login",
    );
    expect(visibleIds(wrapper)).toEqual(["0001"]);
    await wrapper.get('[data-testid="board-queue-search-clear"]').trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledWith({ query: {} });
  });

  it("a fresh project (new origin, no URL filters) starts unfiltered", async () => {
    const wrapper = mountDesktop({ q: "login" });
    await flushPromises();
    wrapper.unmount();

    // Switching project lands on that project's own /work with no carried query.
    const repo = useRepoStore();
    repo.tasks = [task("0900", { title: "Other project login task" })];
    const next = mountDesktop({});
    await flushPromises();
    expect(next.find(".board-queue-filters").exists()).toBe(false);
    expect(visibleIds(next)).toEqual(["0900"]);
  });
});

// #1260: the board applies the queue sort and shows phone-only status values
// as ignored notices, so no URL value on a board width is dropped silently.
describe("Work board applies the queue sort and notices phone-only status (#1260)", () => {
  /** Dated fixtures so the sort has a visible order: 0003 is oldest, 0002 newest. */
  function datedTasks(): void {
    useRepoStore().tasks = [
      task("0001", { updated_at: "2026-11-02T00:00:00Z" }),
      task("0002", { updated_at: "2026-11-03T00:00:00Z" }),
      task("0003", { updated_at: "2026-11-01T00:00:00Z" }),
    ];
  }

  for (const width of [768, 1280]) {
    it(`applies sort=oldest on the board at ${width}px and shows it as a chip`, async () => {
      stubViewport(width);
      datedTasks();
      const wrapper = mountDesktop({ sort: "oldest" });
      await flushPromises();
      expect(visibleIds(wrapper)).toEqual(["0003", "0001", "0002"]);
      expect(chipKeys(wrapper)).toEqual(["sort"]);
      expect(wrapper.find(".board-queue-filters").text()).toContain("Sort: Oldest updated");
    });

    it(`shows a notice for a phone-only status and keeps every task at ${width}px`, async () => {
      stubViewport(width);
      datedTasks();
      const wrapper = mountDesktop({ status: "held" });
      await flushPromises();
      expect(visibleIds(wrapper).sort()).toEqual(["0001", "0002", "0003"]);
      const notice = wrapper.find('.board-queue-filters [data-filter-key="status"]');
      expect(notice.text()).toBe("Ignored filter: status=held (not a board column)");
      expect(notice.classes()).toContain("filter-chip-ignored");
    });
  }

  it("Clear removes the applied sort and the ignored status, and keeps the drawer", async () => {
    datedTasks();
    const wrapper = mountDesktop({ sort: "oldest", status: "held", task: "0001" });
    await flushPromises();
    expect(chipKeys(wrapper)).toEqual(["sort", "status"]);
    await wrapper.find(".board-queue-filters .filter-clear").trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledWith({ query: { task: "0001" } });
  });

  it("the Sort control shows the URL sort, not the stored order, while the URL sets one", async () => {
    datedTasks();
    useRepoStore().setSortOrder("recent");
    routeState.query = { sort: "oldest" };
    const wrapper = mount(WorkView, {
      global: {
        stubs: {
          ...workViewStubs(),
          Select: {
            props: ["modelValue"],
            template: "<div class='sort-select' :data-model='String(modelValue)'><slot /></div>",
          },
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.find(".sort-select").attributes("data-model")).toBe("null");
    expect(visibleIds(wrapper)).toEqual(["0003", "0001", "0002"]);
  });

  it("a board status column is applied and keeps its own bar, not a notice", async () => {
    datedTasks();
    const wrapper = mountDesktop({ status: "ready" });
    await flushPromises();
    expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
    expect(wrapper.find(".filter-bar").text()).toContain("Ready");
  });

  it("the phone queue owns sort and status at 375px, so the board bar is not rendered", async () => {
    stubViewport(375);
    datedTasks();
    const wrapper = mountDesktop({ sort: "oldest", status: "held" });
    await flushPromises();
    expect(wrapper.find(".board-queue-filters").exists()).toBe(false);
  });

  it("the phone queue applies sort=oldest and labels it", async () => {
    routeState.query = { sort: "oldest" };
    const wrapper = mount(MobileWorkQueue, {
      global: {
        stubs: {
          Button: buttonStub,
          Select: selectStub,
          SelectTrigger: selectStub,
          SelectContent: selectStub,
          SelectItem: selectStub,
          SelectViewport: selectStub,
          SelectValue: selectStub,
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();
    expect(wrapper.find(".mobile-sort").text()).toContain("Oldest");
  });
});

describe("Work queue filters on the phone queue (375 px)", () => {
  function mountQueue(query: Record<string, string | string[]>) {
    routeState.query = query;
    const wrapper = mount(MobileWorkQueue, {
      global: {
        stubs: {
          Button: buttonStub,
          Select: selectStub,
          SelectTrigger: selectStub,
          SelectContent: selectStub,
          SelectItem: selectStub,
          SelectViewport: selectStub,
          SelectValue: selectStub,
        },
      },
    });
    mounted.push(wrapper);
    return wrapper;
  }

  it("reload restores the search from the URL", async () => {
    const wrapper = mountQueue({ q: "login" });
    await flushPromises();
    const input = wrapper.find<HTMLInputElement>('[data-testid="mobile-queue-search"]');
    expect(input.element.value).toBe("login");
    expect(wrapper.findAll(".mobile-task-card").length).toBe(1);
  });

  it("Reset clears every queue key from the URL, including sort and status", async () => {
    const wrapper = mountQueue({
      q: "login",
      priority: "p1",
      mine: "1",
      sort: "oldest",
      status: "review",
    });
    await flushPromises();
    await wrapper.find(".mobile-reset").trigger("click");
    expect(routeState.router.replace).toHaveBeenCalledWith({ query: {} });
  });

  it("Reset is disabled when nothing is filtered", async () => {
    const wrapper = mountQueue({});
    await flushPromises();
    expect(wrapper.find(".mobile-reset").attributes("disabled")).toBeDefined();
  });
});

describe("Board filter chip bar at 375 / 768 / 1280 px (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS for BoardQueueFilters and the scope id its markup carries. */
  function scopedCss(markup: string, component = "BoardQueueFilters.vue"): string {
    const source = readFileSync(resolve(uiRoot, "src/components", component), "utf8");
    const style = parse(source, { filename: component }).descriptor.styles[0]?.content ?? "";
    const scopeId = markup.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${component} scope ID was not present`);
    const compiled = compileStyle({
      filename: component,
      id: scopeId,
      source: style,
    });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  async function openChipBar(
    filters: WorkQueueFilters,
    width: number,
    label: string,
    extra: {
      ignored?: WorkQueueFilterChip[];
      applied?: boolean;
      sort?: WorkQueueSort | null;
    } = {},
  ): Promise<Page> {
    const wrapper = mount(BoardQueueFilters, { props: { filters, ...extra } });
    const markup = wrapper.html();
    wrapper.unmount();
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scopedCss(markup)}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="main" style="padding: 16px">${markup}</div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: resolve(shots, `${label}-${width}.jpg`), fullPage: true });
    }
    return page;
  }

  const longFilters: WorkQueueFilters = {
    query: "retry the billing webhook for the nightly export job across every region",
    priority: "p1",
    area: "web,api",
    story: "billing-reliability-q4",
    mine: true,
  };
  const shortFilters: WorkQueueFilters = {
    query: "login",
    priority: "p1",
    area: "any",
    story: "any",
    mine: false,
  };

  for (const width of [375, 768, 1280]) {
    it(`shows the applied sort and the status notice inside ${width}px (#1260)`, async () => {
      const page = await openChipBar(NO_WORK_QUEUE_FILTERS, width, "sort-and-status", {
        sort: "oldest",
        ignored: ignoredWorkQueueFilterChips({ status: "held" }),
      });
      try {
        const labels = await page
          .locator(".board-queue-filters [data-filter-key]")
          .allTextContents();
        expect(labels).toEqual([
          "Sort: Oldest updated",
          "Ignored filter: status=held (not a board column)",
        ]);
        expect(
          await page
            .locator(".board-queue-filters [data-filter-key='status']")
            .getAttribute("class"),
        ).toContain("filter-chip-ignored");
        const off = await page.evaluate(() => {
          const limit = window.innerWidth;
          return Array.from(document.querySelectorAll(".board-queue-filters *"))
            .map((el) => ({ el, r: (el as HTMLElement).getBoundingClientRect() }))
            .filter(({ r }) => !(r.width === 0 && r.height === 0))
            .filter(({ r }) => r.left < -0.5 || r.right > limit + 0.5)
            .map(({ el }) => el.className || el.tagName);
        });
        expect(off, `chips off-viewport at ${width}px`).toEqual([]);
      } finally {
        await page.close();
      }
    });

    it(`keeps every chip and Clear filters inside ${width}px`, async () => {
      const page = await openChipBar(longFilters, width, "long-filters");
      try {
        const result = await page.evaluate(() => {
          const off: string[] = [];
          const limit = window.innerWidth;
          for (const el of Array.from(document.querySelectorAll(".board-queue-filters *"))) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < -0.5 || r.right > limit + 0.5) off.push(el.className || el.tagName);
          }
          return { scrollWidth: document.documentElement.scrollWidth, limit, off };
        });
        expect(result.scrollWidth, `document overflows at ${width}px`).toBeLessThanOrEqual(
          result.limit,
        );
        expect(result.off, `chips off-viewport at ${width}px`).toEqual([]);
        expect(await page.locator(".board-queue-filters .filter-clear").isVisible()).toBe(true);
        // Four quick-filter chips: the search has no chip (#1278).
        expect(await page.locator(".board-queue-filters [data-filter-key]").count()).toBe(4);
      } finally {
        await page.close();
      }
    });

    it(`keeps the pipeline note and an ignored chip inside ${width}px`, async () => {
      const page = await openChipBar(longFilters, width, "pipeline-note", {
        applied: false,
        ignored: [
          {
            key: "priority",
            label: "Ignored filter: priority=a-very-long-unusable-value-0123456789abcdefghij",
            ignored: true,
          },
        ],
      });
      try {
        const result = await page.evaluate(() => {
          const off: string[] = [];
          const limit = window.innerWidth;
          for (const el of Array.from(document.querySelectorAll(".board-queue-filters *"))) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < -0.5 || r.right > limit + 0.5) off.push(el.className || el.tagName);
          }
          return { scrollWidth: document.documentElement.scrollWidth, limit, off };
        });
        expect(result.scrollWidth, `document overflows at ${width}px`).toBeLessThanOrEqual(
          result.limit,
        );
        expect(result.off, `pipeline note or ignored chip off-viewport at ${width}px`).toEqual([]);
        expect(await page.locator(".board-queue-filter-note").isVisible()).toBe(true);
        expect(await page.locator(".filter-chip-ignored").count()).toBe(1);
      } finally {
        await page.close();
      }
    });

    it(`shows the short set of chips at ${width}px without wrapping the clear control away`, async () => {
      const page = await openChipBar(shortFilters, width, "short-filters");
      try {
        expect(await page.locator(".board-queue-filters [data-filter-key]").count()).toBe(1);
        expect(await page.locator(".board-queue-filters .filter-clear").isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });

    it(`shows Clear filters and no chip when only the search is set at ${width}px`, async () => {
      const page = await openChipBar(
        { query: "login", priority: "", area: "any", story: "any", mine: false },
        width,
        "search-only",
      );
      try {
        expect(await page.locator(".board-queue-filters [data-filter-key]").count()).toBe(0);
        expect(await page.locator(".board-queue-filters .filter-clear").isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });
  }

  /** The desktop board's search box, rendered the same way as the chip bar. */
  async function openSearchBox(value: string, width: number, label: string): Promise<Page> {
    const wrapper = mount(BoardQueueSearch, { props: { modelValue: value } });
    const markup = wrapper.html();
    wrapper.unmount();
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scopedCss(markup, "BoardQueueSearch.vue")}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="main" style="padding: 16px">${markup}</div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: resolve(shots, `${label}-${width}.jpg`), fullPage: true });
    }
    return page;
  }

  for (const width of [375, 768, 1280]) {
    it(`keeps the board search box and its clear control inside ${width}px`, async () => {
      const page = await openSearchBox(
        "retry the billing webhook for the nightly export job across every region",
        width,
        "search-long",
      );
      try {
        const result = await page.evaluate(() => {
          const off: string[] = [];
          const limit = window.innerWidth;
          for (const el of Array.from(document.querySelectorAll(".board-queue-search *"))) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < -0.5 || r.right > limit + 0.5) off.push(el.className || el.tagName);
          }
          const input = document.querySelector<HTMLElement>('[data-testid="board-queue-search"]');
          return {
            scrollWidth: document.documentElement.scrollWidth,
            limit,
            off,
            inputWidth: input?.getBoundingClientRect().width ?? 0,
          };
        });
        expect(result.scrollWidth, `document overflows at ${width}px`).toBeLessThanOrEqual(
          result.limit,
        );
        expect(result.off, `search box off-viewport at ${width}px`).toEqual([]);
        // The header search is 150px at its narrowest (the sidebar-open title row),
        // which leaves its input about 75px for the icon and clear control.
        expect(result.inputWidth, `search input too narrow at ${width}px`).toBeGreaterThan(60);
        expect(await page.locator('[data-testid="board-queue-search-clear"]').isVisible()).toBe(
          true,
        );
      } finally {
        await page.close();
      }
    });

    it(`shows the search box with no clear control when empty at ${width}px`, async () => {
      const page = await openSearchBox("", width, "search-empty");
      try {
        expect(await page.locator('[data-testid="board-queue-search"]').isVisible()).toBe(true);
        expect(await page.locator('[data-testid="board-queue-search-clear"]').count()).toBe(0);
      } finally {
        await page.close();
      }
    });
  }

  /** The scoped `<style>` blocks of one SFC, compiled under the scope id its markup carries. */
  function scopedStyles(component: string, scopeId: string): string {
    const source = readFileSync(resolve(uiRoot, component), "utf8");
    const blocks = parse(source, { filename: component }).descriptor.styles.filter((s) => s.scoped);
    return blocks
      .map((block) => {
        const compiled = compileStyle({ filename: component, id: scopeId, source: block.content });
        if (compiled.errors.length) throw compiled.errors[0]!;
        return compiled.code;
      })
      .join("\n");
  }

  /** The scope id an element carries, e.g. `data-v-1a2b3c`. */
  function scopeIdOf(wrapper: ReturnType<typeof mountDesktop>, selector: string): string {
    const el = wrapper.get(selector).element;
    const id = Array.from(el.attributes)
      .map((attr) => attr.name)
      .find((name) => name.startsWith("data-v-"));
    if (!id) throw new Error(`${selector} has no scope ID`);
    return id;
  }

  // #1278: the search sits in the header row beside the toggles. At these widths
  // the header copy, search, toggles, sort, view switch and New task must not
  // overflow the page or collide with each other. The page is rendered inside
  // the app shell (a sidebar column, 60px at 720-900px and 210px above), so the
  // header gets the same width the real page does.
  for (const width of [720, 768, 900, 1000, 1280]) {
    it(`keeps the Work header row free of overflow and collisions at ${width}px`, async () => {
      const wrapper = mountDesktop({ q: "login" });
      await flushPromises();
      const markup = wrapper.get(".work-header").html();
      const workScope = scopeIdOf(wrapper, ".work-header");
      const searchScope = scopeIdOf(wrapper, ".board-queue-search");
      const css = [
        scopedStyles("src/views/WorkView.vue", workScope),
        scopedStyles("src/components/BoardQueueSearch.vue", searchScope),
      ].join("\n");
      wrapper.unmount();

      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.setContent(
          `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
            `<style>${globalCss}</style><style>${css}</style>` +
            `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
            `<div class="body" style="min-height: 900px">` +
            `<aside class="sidebar"></aside>` +
            `<main class="main"><div class="work-page">${markup}</div></main></div>`,
        );
        const shots = process.env.QA_SHOTS;
        if (shots) {
          mkdirSync(shots, { recursive: true });
          await page.screenshot({
            path: resolve(shots, `work-header-${width}.jpg`),
            fullPage: true,
          });
        }
        const result = await page.evaluate(() => {
          const header = document.querySelector(".work-header");
          const parts = [
            ...Array.from(document.querySelectorAll(".work-header-copy")),
            ...Array.from(
              document.querySelectorAll(
                ".work-header-actions > :not(.work-header-search-controls), .work-header-search-controls > *",
              ),
            ),
          ]
            .map((el) => ({ name: el.className || el.tagName, rect: el.getBoundingClientRect() }))
            .filter((p) => p.rect.width > 0 && p.rect.height > 0);
          const limit = window.innerWidth;
          const off = parts
            .filter((p) => p.rect.left < -0.5 || p.rect.right > limit + 0.5)
            .map((p) => String(p.name));
          const collisions: string[] = [];
          for (let i = 0; i < parts.length; i += 1) {
            for (let j = i + 1; j < parts.length; j += 1) {
              const a = parts[i]!.rect;
              const b = parts[j]!.rect;
              const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > 0.5 && overlapY > 0.5) {
                collisions.push(`${parts[i]!.name} x ${parts[j]!.name}`);
              }
            }
          }
          const search = document.querySelector<HTMLElement>(".board-queue-search");
          const searchTop = Math.round(search?.getBoundingClientRect().top ?? -1);
          const toggleTop = Math.round(
            document.querySelector(".queue-visibility")?.getBoundingClientRect().top ?? -2,
          );
          return {
            scrollWidth: document.documentElement.scrollWidth,
            limit,
            headerExists: header !== null,
            off,
            collisions,
            searchWidth: search?.getBoundingClientRect().width ?? 0,
            searchTop,
            toggleTop,
            titleTop: Math.round(
              document.querySelector(".page-title")?.getBoundingClientRect().top ?? -1,
            ),
          };
        });
        expect(result.headerExists).toBe(true);
        expect(result.scrollWidth, `document overflows at ${width}px`).toBeLessThanOrEqual(
          result.limit,
        );
        expect(result.off, `header item off-viewport at ${width}px`).toEqual([]);
        expect(result.collisions, `header items collide at ${width}px`).toEqual([]);
        // Half of the old 420px search, so about 210px (#1278).
        expect(result.searchWidth, `search not half width at ${width}px`).toBeLessThanOrEqual(210);
        expect(result.searchWidth, `search too narrow at ${width}px`).toBeGreaterThanOrEqual(150);
        expect(
          Math.abs(result.searchTop - result.titleTop),
          `search is not aligned with the title row at ${width}px`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(result.searchTop - result.toggleTop),
          `search is off the toggles' row at ${width}px`,
        ).toBeLessThanOrEqual(2);
        expect(await page.locator(".client-board-link").count()).toBe(0);
      } finally {
        await page.close();
      }
    });
  }
});
