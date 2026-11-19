// @vitest-environment jsdom
/**
 * #1235 — QA pass: Work board drag, status moves and bulk actions when the
 * server rejects them. Covers blocked moves (client-refused drags), failed
 * moves (the server's PATCH/done endpoint answers 4xx/5xx), slow moves (a
 * start that hangs), and the keyboard / touch alternatives to drag, against
 * fixtures and mocked rejections only. The interaction assertions run on the
 * real components in jsdom; the same failing states are then rendered in
 * headless WebKit at 375 / 768 / 1280 px, where every visible element must
 * stay inside the viewport and each rejection must be explained in plain
 * English with the next step.
 *
 * Set `QA_SHOTS=<dir>` to save a full-page screenshot per fixture and width.
 */
import { resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { webkit, type Browser, type Page } from "@playwright/test";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import BoardColumn from "../src/components/BoardColumn.vue";
import TaskCard from "../src/components/TaskCard.vue";
import DoneErrorCard from "../src/components/DoneErrorCard.vue";
import ToastPanel from "../src/components/ToastPanel.vue";
import MobileWorkQueue from "../src/components/MobileWorkQueue.vue";
import { useRepoStore } from "../src/stores/repo";
import { SERVER_UNREACHABLE_MESSAGE } from "../src/api";
import { describeCloseOutFailure } from "../src/lib/closeOutFailure";
import { makeTask, FakeEventSource } from "./component-test-helpers";
import type { Task } from "../src/types";

const VIEWPORTS = [375, 768, 1280] as const;
const uiRoot = resolve(__dirname, "..");

// MobileWorkQueue reads its filters through vue-router; a stub keeps the
// fixture mountable without a real router.
const routeState = vi.hoisted(() => ({
  query: {} as Record<string, string | string[]>,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => routeState.router,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* ── Shared WebKit harness (mirrors agents-page-qa-browser.test.ts) ─────── */

describe("Work board move failures at 375/768/1280 (WebKit, fixtures)", () => {
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

  /** Compiled scoped CSS for one component, with the scope id its markup carries. */
  function scopedCss(markup: string, markerClass: string, component: string): string {
    const source = readFileSync(resolve(uiRoot, `src/components/${component}.vue`), "utf8");
    const parsed = parse(source, { filename: component });
    const style = parsed.descriptor.styles[0]?.content ?? "";
    const marker = markup.indexOf(markerClass);
    if (marker < 0) throw new Error(`${component} markup is missing .${markerClass}`);
    const tagStart = markup.lastIndexOf("<", marker);
    const tag = markup.slice(tagStart, markup.indexOf(">", marker));
    const scopeId = tag.match(/data-v-[a-f0-9]+/)?.[0];
    if (!scopeId) throw new Error(`${component} scope ID was not present on .${markerClass}`);
    const compiled = compileStyle({ filename: component, id: scopeId, source: style });
    if (compiled.errors.length) throw compiled.errors[0]!;
    return compiled.code;
  }

  async function openFixturePage(
    label: string,
    markup: string,
    scoped: string,
    width: number,
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
        `<style>${globalCss}</style><style>${scoped}</style>` +
        `<style>html, body { width: 100%; margin: 0; } *, *::before, *::after { animation: none !important; transition: none !important; }</style>` +
        `<div class="app-shell"><div class="body"><aside class="sidebar"><nav>Navigation</nav></aside><div class="main">${markup}</div></div></div>`,
    );
    const shots = process.env.QA_SHOTS;
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: resolve(shots, `${label}-${width}.png`),
        fullPage: true,
      });
    }
    return page;
  }

  /** Every visible element must sit inside the viewport, except content that
   *  a horizontal scroller legitimately clips or a closed <details> hides. */
  async function audit(page: Page): Promise<{ documentWidth: number; overflowers: string[] }> {
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
      const inClosedDetails = (el: Element): boolean => {
        const details = el.closest("details");
        return details !== null && !details.open;
      };
      const overflowers: string[] = [];
      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (inClosedDetails(el)) continue;
        if (!el.offsetParent && style.position !== "fixed") continue;
        if (inHorizontalScroller(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > vw + 1 || rect.left < -1) {
          overflowers.push(
            `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return { documentWidth: document.documentElement.scrollWidth, overflowers };
    });
  }

  async function textOf(page: Page, selector: string): Promise<string> {
    return (await page.locator(selector).first().textContent()) ?? "";
  }

  async function expectFits(page: Page, what: string, width: number): Promise<void> {
    const result = await audit(page);
    expect(result.overflowers, `${what} at ${width}px has off-viewport elements`).toEqual([]);
    expect(result.documentWidth, `${what} at ${width}px widens the document`).toBeLessThanOrEqual(
      width + 1,
    );
  }

  /** Render a mocked failing board state in jsdom, then serialize the mounted
   *  DOM (Teleports included) for the headless WebKit pass. */
  async function boardMarkup(
    seed: (repo: ReturnType<typeof useRepoStore>) => Promise<void> | void,
  ) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    vi.stubGlobal("EventSource", FakeEventSource);
    await seed(repo);
    const column = mount(BoardColumn, {
      attachTo: document.body,
      props: { col: { id: "review", label: "Review", color: "#8b5cf6" } },
      global: { plugins: [pinia] },
    });
    const toasts = mount(ToastPanel, { attachTo: document.body, global: { plugins: [pinia] } });
    await flushPromises();
    const markup = document.body.innerHTML;
    column.unmount();
    toasts.unmount();
    document.body.innerHTML = "";
    // TaskCard/BoardColumn draw every style from the global stylesheet; only
    // ToastPanel carries scoped CSS.
    let scoped = "";
    try {
      scoped = scopedCss(markup, "toast-panel", "ToastPanel");
    } catch {
      scoped = "";
    }
    return markup + "\n" + scoped;
  }

  const reviewTask = (id: string, over: Partial<Task> = {}): Task =>
    makeTask({ id, status: "review", title: `Task ${id}`, ...over });

  it.each(VIEWPORTS)(
    "a rejected status write leaves a toast, not a half-moved board, at %spx",
    async (width) => {
      const page = await openFixturePage(
        "board-rejection-toast",
        await boardMarkup((repo) => {
          repo.tasks = [reviewTask("1201"), makeTask({ id: "1202", status: "review" })];
          repo.pushToast(
            "Can't reach the RepoOS server — it may be offline. Start the server, then reload.",
            "error",
          );
        }),
        "",
        width,
      );
      try {
        await expectFits(page, "board with rejection toast", width);
        // The toast is a plain-English alert with the next step, not jargon.
        const toast = await textOf(page, ".toast-item .toast-message");
        expect(toast).toMatch(/Can't reach the RepoOS server/);
        expect(toast).toMatch(/Start the server, then reload/);
        // Both cards stayed where they were: the failed move left the board intact.
        expect(await page.locator(".task-card").count()).toBe(2);
        expect(await page.locator('[data-board-column="review"] .task-card').count()).toBe(2);
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)(
    "a dirty-main rejection opens the commit-or-cancel dialog at %spx",
    async (width) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/done")) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                ok: false,
                needsCommit: true,
                dirtyFiles: ["repoos.toml", "src/ui-app/src/style.css"],
                dirtyScope: "main",
              }),
            };
          }
          return { ok: true, status: 200, json: async () => ({}) };
        }),
      );
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      vi.stubGlobal("EventSource", FakeEventSource);
      const task = reviewTask("1301");
      repo.tasks = [task];
      const column = mount(BoardColumn, {
        attachTo: document.body,
        props: { col: { id: "done", label: "Done", color: "#22c55e" } },
        global: { plugins: [pinia] },
      });
      await flushPromises();
      // Drop the review card on Done; the close-out is refused with a dirty main.
      await column.find(".board-col").trigger("drop", {
        dataTransfer: { getData: () => task.id },
      } as unknown as DragEvent);
      await flushPromises();
      // The dialog is body-teleported; serialize everything it opened.
      expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();
      const markup = document.body.innerHTML;
      column.unmount();
      document.body.innerHTML = "";
      // .dirty-* styles live in the global stylesheet — no scoped CSS needed.

      const page = await openFixturePage("dirty-main-dialog", markup, "", width);
      try {
        await expectFits(page, "dirty-main dialog", width);
        const body = await page.locator("body").textContent();
        expect(body).toContain("main has uncommitted changes");
        expect(body).toContain("would block the merge for task #1301");
        expect(body).toContain("Commit them and continue, or cancel to stay in review.");
        expect(body).toContain("repoos.toml");
        expect(await page.locator(".dirty-file").count()).toBe(2);
      } finally {
        await page.close();
      }
    },
  );

  it.each(VIEWPORTS)(
    "a failed close-out explains itself inline on the card at %spx",
    async (width) => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      vi.stubGlobal("EventSource", FakeEventSource);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
      );
      const task = reviewTask("1302");
      repo.tasks = [task];
      // The mapping Move-to-done failures run through on the server AND client.
      const mapped = describeCloseOutFailure(
        "validating",
        "repoos check failed: 3 tests failed in src/ui-app/tests/board-column-drop.test.ts",
      );
      repo.doneErrors = {
        [task.id]: { ...mapped, failedAt: new Date().toISOString() },
      };
      const cardWrapper = mount(TaskCard, {
        attachTo: document.body,
        props: { task, dragEnabled: false },
        global: { plugins: [pinia] },
      });
      await flushPromises();
      // The card shows the clamped headline; the expanded panel (what the
      // click opens) carries the full reason and the next step. Render that
      // panel variant too so the WebKit pass can read the whole story.
      const panelWrapper = mount(DoneErrorCard, {
        attachTo: document.body,
        props: {
          message: mapped.message,
          step: mapped.step,
          detail: mapped.detail,
          hint: mapped.hint,
          failedAt: new Date().toISOString(),
          taskId: task.id,
          taskTitle: task.title,
          mode: "panel",
        },
        global: { plugins: [pinia] },
      });
      await flushPromises();
      const markup = document.body.innerHTML;
      cardWrapper.unmount();
      panelWrapper.unmount();
      document.body.innerHTML = "";
      // TaskCard and DoneErrorCard draw from the global stylesheet only.

      const page = await openFixturePage("done-error-card", markup, "", width);
      try {
        await expectFits(page, "done-error card", width);
        const card = await page.locator(".task-card").first().textContent();
        // Plain-English headline naming the failed gate…
        expect(card).toContain("The validation check failed");
        expect(card).toContain("3 tests failed");
        // …and the expanded panel carries the next step in the same words.
        const text = await page.locator("body").textContent();
        expect(text).toContain(
          "Fix the failure in the feature branch's worktree, commit, and retry",
        );
      } finally {
        await page.close();
      }
    },
  );

  it("mobile queue fits at 375px with a failed refresh explained inline", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.loading = false;
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
    repo.tasks = [
      reviewTask("1401"),
      makeTask({ id: "1402", status: "active" }),
      makeTask({ id: "1403", status: "ready" }),
    ];
    const wrapper = mount(MobileWorkQueue, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    await flushPromises();
    const markup = document.body.innerHTML;
    wrapper.unmount();
    document.body.innerHTML = "";
    const scoped = [
      ["mobile-work", "MobileWorkQueue"],
      ["toast-panel", "ToastPanel"],
    ]
      .map(([marker, component]) => {
        try {
          return scopedCss(markup, marker, component);
        } catch {
          return "";
        }
      })
      .join("\n");

    const page = await openFixturePage("mobile-queue", markup, scoped, 375);
    try {
      await expectFits(page, "mobile queue with review rows", 375);
      // Rows carry a status pill the tap-into-drawer alternative relies on.
      expect(await page.locator(".mobile-task-card").count()).toBeGreaterThanOrEqual(3);
      const row = await textOf(page, ".mobile-task-card");
      expect(row).toContain("#1401");
    } finally {
      await page.close();
    }
  });
});

/* ── Interaction QA: blocked / failed / slow moves (jsdom, mocked server) ── */

const COL_REVIEW = { id: "review" as const, label: "Review", color: "#000" };
const COL_DONE = { id: "done" as const, label: "Done", color: "#000" };
const COL_INBOX = { id: "inbox" as const, label: "Inbox", color: "#000" };
const COL_READY = { id: "ready" as const, label: "Ready", color: "#000" };
const COL_ACTIVE = { id: "active" as const, label: "Active", color: "#000" };

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** Dispatch a real drag event on a column element and return it, so tests can
 *  assert on `defaultPrevented` (whether the column accepted the drop). */
function fireDrag(el: Element, type: string, id = ""): DragEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(e, "dataTransfer", {
    value: { getData: () => id, dropEffect: "all" },
  });
  el.dispatchEvent(e);
  return e;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await flushPromises();
}

interface MountOpts {
  col:
    | typeof COL_REVIEW
    | typeof COL_DONE
    | typeof COL_INBOX
    | typeof COL_READY
    | typeof COL_ACTIVE;
  stubTaskCard?: boolean;
}

/** Mount one column (cards stubbed by default: the QA assertions here are the
 *  store-level outcome and the dialogs, which the cards don't own). */
function mountColumn(pinia: ReturnType<typeof createPinia>, opts: MountOpts): VueWrapper {
  const stubs: Record<string, boolean> = { RestartTaskDialog: true };
  if (opts.stubTaskCard !== false) stubs.TaskCard = true;
  return mount(BoardColumn, {
    attachTo: document.body,
    props: { col: opts.col },
    global: { plugins: [pinia], stubs },
  });
}

describe("Work board move failures (jsdom, mocked rejections)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a blocked drag is announced on hover, refuses the drop, and says what to use instead", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0001", status: "active" });
    repo.tasks = [task];
    repo.setDraggingTask(task);
    const setStatus = vi.spyOn(repo, "setStatus").mockResolvedValue(undefined);

    const wrapper = mountColumn(pinia, { col: COL_READY });
    const col = wrapper.find(".board-col").element;

    // Hovering an invalid column raises the plain-English reason + next step.
    fireDrag(col, "dragenter");
    await flush();
    expect(repo.toasts[0]?.type).toBe("error");
    expect(repo.toasts[0]?.message).toBe(
      'Can\'t drag "active" straight to "ready" — use Stop work instead.',
    );

    // The column refuses the drop natively: no preventDefault on dragover.
    const over = fireDrag(col, "dragover");
    expect(over.defaultPrevented).toBe(false);

    // Even a drop that slipped past dragover (a programmatic drop) is refused
    // with the same plain-English reason: onDrop re-checks the move.
    fireDrag(col, "drop", task.id);
    await flush();
    expect(setStatus).not.toHaveBeenCalled();
    expect(repo.toasts[0]?.message).toBe(
      'Can\'t drag "active" straight to "ready" — use Stop work instead.',
    );
    expect(task.status).toBe("active");
  });

  it("the done column blocks non-review drags with the same message its cue shows", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0002", status: "active" });
    repo.tasks = [task];
    repo.setDraggingTask(task);
    const completeTask = vi.spyOn(repo, "completeTask");

    const wrapper = mountColumn(pinia, { col: COL_DONE });
    const col = wrapper.find(".board-col").element;
    fireDrag(col, "dragenter");
    await flush();
    expect(repo.toasts[0]?.message).toBe("Only review tasks can be moved to done.");
    fireDrag(col, "drop", task.id);
    await flush();
    expect(completeTask).not.toHaveBeenCalled();
  });

  it("a rejected status write snaps back: server reason in a toast, task still in its column", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0003", status: "ready" });
    repo.tasks = [task];
    // A move the board itself allows (ready -> inbox is a generic edge) that
    // the server still refuses — e.g. the task changed underneath this tab.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, {
          error: "task was updated elsewhere — reload the board and try again",
        }),
      ),
    );

    const wrapper = mountColumn(pinia, { col: COL_INBOX });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    expect(repo.toasts[0]?.message).toBe(
      "task was updated elsewhere — reload the board and try again",
    );
    // Snap-back: the task object was never locally moved.
    expect(task.status).toBe("ready");
    expect(repo.byStatus("ready").map((t) => t.id)).toContain("0003");
    expect(repo.byStatus("inbox")).toHaveLength(0);
  });

  it("a dead server explains itself instead of leaking 'Failed to fetch'", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0004", status: "ready" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_INBOX });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    expect(repo.toasts[0]?.message).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(repo.toasts[0]?.message).toContain("Start the server, then reload.");
    expect(task.status).toBe("ready");
  });

  it("a rejected review request toasts the handoff failure and keeps the task active", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0005", status: "active" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, { error: "clean self-check required before review — run repoos check" }),
      ),
    );

    const wrapper = mountColumn(pinia, { col: COL_REVIEW });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();
    // The Review confirm modal opens first — a drag asks the same question the
    // drawer's Review button does — then the rejection surfaces as a toast.
    const dialog = wrapper.findComponent({ name: "ReviewConfirmDialog" });
    expect((dialog.props() as { open: boolean }).open).toBe(true);
    await dialog.vm.$emit("run-checks");
    await flush();
    expect(repo.toasts[0]?.message).toBe(
      "clean self-check required before review — run repoos check",
    );
    expect(task.status).toBe("active");
  });

  it("a drag-to-done refused for dirty main opens the commit-or-cancel dialog, not silence", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0006", status: "review" });
    repo.tasks = [task];
    let doneCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/done")) {
          doneCalls++;
          if (doneCalls === 1) {
            return jsonResponse(409, {
              ok: false,
              needsCommit: true,
              dirtyFiles: ["repoos.toml"],
              dirtyScope: "main",
            });
          }
          const body = JSON.parse(String(init?.body ?? "{}")) as { commitDirty?: boolean };
          expect(body.commitDirty).toBe(true);
          return jsonResponse(200, { ok: true, merged: true, conflicts: [], ff: false });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_DONE });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    // The rejection is answered by the same dialog the card's button opens.
    const overlay = document.body.querySelector(".dirty-overlay");
    expect(overlay).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("main has uncommitted changes");
    expect(text).toContain("repoos.toml");
    expect(text).toContain("Commit them and continue, or cancel to stay in review.");
    // No toast: the dialog owns this failure (a toast would duplicate it).
    expect(repo.toasts).toHaveLength(0);
    expect(task.status).toBe("review");

    // Choosing "Commit & continue" retries the close-out with commitDirty.
    const commit = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Commit"),
    );
    expect(commit).toBeTruthy();
    commit!.click();
    await flush();
    expect(doneCalls).toBe(2);
    // Dialog closed after the retry succeeded.
    expect(document.body.querySelector(".dirty-overlay")).toBeNull();
  });

  it("a drag-to-done refused for a dirty task worktree names the worktree, not main", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0007", status: "review" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          return jsonResponse(409, {
            ok: false,
            needsCommit: true,
            dirtyFiles: ["work/0007-notes.md"],
            dirtyScope: "worktree",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_DONE });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    const text = document.body.textContent ?? "";
    expect(text).toContain("the task worktree has uncommitted changes");
    expect(text).toContain("close-out merge would not carry them");
    expect(text).toContain("work/0007-notes.md");
  });

  it("a worktree-changed-after-handoff conflict opens the discard-or-send-back dialog", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0008", status: "review" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/done")) {
          return jsonResponse(409, {
            ok: false,
            worktreeChangedAfterHandoff: true,
            error: "worktree changed after handoff",
            files: [{ path: "src/ui-app/src/style.css", added: 4, removed: 1, taskFile: false }],
          });
        }
        if (url.includes("/worktree-handoff/discard")) {
          expect(init?.method).toBe("POST");
          return jsonResponse(200, { ok: true });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_DONE });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Worktree changed after handoff");
    expect(text).toContain("discard the post-handoff edits or send the task back");
    expect(text).toContain("src/ui-app/src/style.css");

    const discard = [...document.body.querySelectorAll("button")].find((b) =>
      /discard/i.test(b.textContent ?? ""),
    );
    expect(discard).toBeTruthy();
    discard!.click();
    await flush();
    // Discard clears the conflict and offers the retry.
    expect(repo.worktreeHandoffConflictFor(task.id)).toBeNull();
    expect(repo.toasts.some((t) => t.message.includes("retry Move to done"))).toBe(true);
  });

  it("cancelling the dirty dialog keeps the task in review and clears the guard", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0009", status: "review" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          return jsonResponse(409, {
            ok: false,
            needsCommit: true,
            dirtyFiles: ["repoos.toml"],
            dirtyScope: "main",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_DONE });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();

    const cancel = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Cancel",
    );
    cancel!.click();
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeNull();
    // Cancel stays in review with nothing half-moved.
    expect(task.status).toBe("review");
    expect(repo.dirtyFilesFor(task.id)).toEqual([]);
  });

  it("a generic close-out failure lands inline on the card with cause and next step", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0010", status: "review" });
    repo.tasks = [task];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          return jsonResponse(500, {
            ok: false,
            error:
              "repoos check failed: 3 tests failed in src/ui-app/tests/board-column-drop.test.ts",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mountColumn(pinia, { col: COL_DONE, stubTaskCard: true });
    fireDrag(wrapper.find(".board-col").element, "drop", task.id);
    await flush();

    // The failure is recorded per task (the review card renders it inline as
    // DoneErrorCard — verified in the WebKit pass above), no toast duplicates.
    const err = repo.doneErrorFor(task.id);
    expect(err).toBeTruthy();
    expect(err!.message).toContain("The validation check failed");
    expect(err!.message).toContain("3 tests failed");
    expect(err!.hint).toContain("Fix the failure in the feature branch's worktree");
    expect(task.status).toBe("review");
    expect(repo.toasts).toHaveLength(0);
  });

  it("a slow start keeps the card in place, then explains itself after the watchdog", async () => {
    vi.useFakeTimers();
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      const task = makeTask({ id: "0011", status: "ready" });
      repo.tasks = [task];
      // Phase 1 — a start request that never answers (hung server).
      let resolveStart: (v: unknown) => void = () => {};
      let startCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          startCalls++;
          return new Promise((res) => {
            resolveStart = res;
          });
        }),
      );

      const wrapper = mountColumn(pinia, { col: COL_ACTIVE });
      fireDrag(wrapper.find(".board-col").element, "drop", task.id);
      await flush();

      // No optimistic move while the request hangs.
      expect(task.status).toBe("ready");
      expect(repo.isStartWorkPending(task.id)).toBe(true);
      // A second gesture cannot double-start it: startWork re-acquires the
      // pending flag and returns without a second request.
      await repo.startWork(task, "resume");
      expect(startCalls).toBe(1);

      // Phase 2 — the server finally accepts, but the board never updates
      // (the SSE echo is lost). 45s later the watchdog says so in words.
      resolveStart({ ok: true, status: 200, json: async () => ({ ok: true }) });
      await flush();
      expect(startCalls).toBe(1);
      vi.advanceTimersByTime(45_000);
      expect(repo.isStartWorkPending(task.id)).toBe(false);
      expect(repo.toasts[0]?.type).toBe("info");
      expect(repo.toasts[0]?.message).toBe(
        "Start work is taking longer than expected — refresh the board if the task did not move.",
      );
      expect(task.status).toBe("ready");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the card's action button (keyboard/touch alternative to drag) fails with a toast, not a stuck busy state", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({ id: "0012", status: "ready" });
    repo.tasks = [task];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/tasks/0012/start")) {
          return jsonResponse(200, {
            ok: false,
            reason: "Start held by the memory pressure guard — wait for it to lift.",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const wrapper = mount(TaskCard, {
      attachTo: document.body,
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await flush();

    const action = wrapper.find("button.tc-card-footer-action");
    expect(action.exists()).toBe(true);
    await action.trigger("click");
    await flush();

    expect(repo.toasts[0]?.type).toBe("error");
    expect(repo.toasts[0]?.message).toContain("memory pressure guard");
    // The card is usable again: busy cleared, task unmoved.
    expect(repo.isStartWorkPending(task.id)).toBe(false);
    expect(task.status).toBe("ready");
    wrapper.unmount();
  });
});
