/**
 * Story side panel (#0502): the stories view opens a task/input-style side
 * panel per story, its content is split into tabs (full markdown body, related
 * tasks, metadata), selecting a second story swaps the contents in place and
 * resets the tab, and a related task hands off to the existing task drawer.
 *
 * Radix dialogs portal their content to `body`, so the assertions read the
 * teleported DOM off `document.body` rather than off the wrapper element.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import StoriesView from "../src/views/StoriesView.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const NewStoryPanelStub = { template: "<div />" };

/** Mounted wrappers, unmounted after each test so teleported panels go with them. */
let mounted: VueWrapper[] = [];

function mountView(): VueWrapper {
  const wrapper = mount(StoriesView, {
    attachTo: document.body,
    global: { stubs: { NewStoryPanel: NewStoryPanelStub } },
  });
  mounted.push(wrapper);
  return wrapper;
}

function panel(): HTMLElement | null {
  return document.body.querySelector(".drawer");
}

/** The tab buttons of the open panel, in strip order. */
function tabs(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(".drawer-tabs .tab-btn"));
}

async function openTab(label: string): Promise<void> {
  const btn = tabs().find((b) => b.textContent?.includes(label));
  expect(btn, `no tab labelled "${label}"`).toBeTruthy();
  btn!.click();
  await flushPromises();
}

/** A registered story definition. `key` is the lowercased story name. */
function definition(name: string, body: string) {
  return {
    key: name.toLowerCase(),
    name,
    path: `stories/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    body,
    createdAt: "2026-09-01T00:00:00Z",
    createdBy: "hello@repoos.org",
  };
}

const ALPHA_BODY = "# Alpha\n\nThe **whole** scope, in full.\n\n- one\n- two";
const BETA_BODY = "# Beta\n\nA different slice entirely.";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  useConfigStore().data = { stories: { enabled: true } };
});

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("story side panel opening", () => {
  it("opens a drawer-styled panel when a story row is selected", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Alpha slice", status: "ready" })];
    useRepoStore().storyDefinitions = [definition("Alpha slice", ALPHA_BODY)];
    const wrapper = mountView();
    await flushPromises();
    expect(panel()).toBeNull();

    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    // Same frame as the task and input panels: .drawer-wrap is the fixed
    // teleport target, .drawer is the sheet inside it.
    expect(document.body.querySelector(".drawer-wrap")).toBeTruthy();
    const el = panel();
    expect(el).toBeTruthy();
    expect(el!.querySelector(".drawer-head")!.textContent).toContain("Alpha slice");
    expect(el!.querySelector(".drawer-tabs")).toBeTruthy();
  });

  /**
   * The regression guard for round 1: a modal panel renders a full-screen
   * scrim, which makes "select a different story to swap the contents in place"
   * unreachable no matter how good the state handling is. Assert the two
   * things that actually block a real click, rather than relying on a
   * synthetic `trigger("click")` that bypasses hit-testing entirely.
   */
  it("leaves the stories list reachable — no scrim, no pointer-event lock", async () => {
    useRepoStore().tasks = [
      makeTask({ id: "0001", story: "Alpha slice", status: "active" }),
      makeTask({ id: "0002", story: "Beta slice", status: "ready" }),
    ];
    useRepoStore().storyDefinitions = [
      definition("Alpha slice", ALPHA_BODY),
      definition("Beta slice", BETA_BODY),
    ];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.findAll(".story-head")[0]!.trigger("click");
    await flushPromises();

    expect(panel()).toBeTruthy();
    // No .overlay element anywhere, and nothing has taken the body out of the
    // hit-testing path — both are what a modal dialog installs.
    expect(document.body.querySelector(".overlay")).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
    // The rows the user is supposed to click are still in the document.
    expect(wrapper.findAll(".story-head")).toHaveLength(2);
  });

  it("does not open a panel until a story is selected", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Alpha slice" })];
    mountView();
    await flushPromises();
    expect(panel()).toBeNull();
  });

  it("closes on the × control and on Escape, the task/input affordances", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Alpha slice" })];
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    expect(panel()).toBeTruthy();

    const close = document.body.querySelector<HTMLElement>(".drawer .close-x")!;
    expect(close).toBeTruthy();
    close.click();
    await flushPromises();
    expect(panel()).toBeNull();

    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    expect(panel()).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(panel()).toBeNull();
  });
});

describe("story side panel tabs", () => {
  beforeEach(() => {
    useRepoStore().tasks = [
      makeTask({ id: "0001", story: "Alpha slice", title: "First", status: "active" }),
      makeTask({ id: "0002", story: "Alpha slice", title: "Second", status: "ready" }),
    ];
    useRepoStore().storyDefinitions = [definition("Alpha slice", ALPHA_BODY)];
  });

  it("opens on the body tab and renders the full markdown, untruncated", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    const labels = tabs().map((t) => (t.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(labels).toEqual(["Story", "Tasks 2", "Details"]);
    expect(tabs()[0].classList.contains("active")).toBe(true);

    // Same renderer and same .md-rendered class the task panel's Task tab uses.
    const md = panel()!.querySelector(".md-rendered")!;
    expect(md.innerHTML).toContain("<h1>Alpha</h1>");
    expect(md.innerHTML).toContain("<strong>whole</strong>");
    expect(md.querySelectorAll("li")).toHaveLength(2);
    // The whole body, not the 200-char excerpt the card shows.
    expect(md.textContent).toContain("The whole scope, in full.");
  });

  it("wires up a complete ARIA tabs relationship", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    const strip = panel()!.querySelector('[role="tablist"]')!;
    expect(strip).toBeTruthy();
    const list = tabs();
    // Every tab points at the one rendered panel, and it points back.
    for (const t of list) {
      expect(t.getAttribute("aria-controls")).toBeTruthy();
      expect(t.id).toBeTruthy();
    }
    const body = panel()!.querySelector('[role="tabpanel"]')!;
    expect(body.getAttribute("aria-labelledby")).toBe(list[0]!.id);
    expect(list[0]!.getAttribute("aria-controls")).toBe(body.id);
    // Roving tabindex: only the selected tab is in the tab order.
    expect(list.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    await openTab("Tasks");
    const body2 = panel()!.querySelector('[role="tabpanel"]')!;
    expect(body2.getAttribute("aria-labelledby")).toBe(tabs()[1]!.id);
  });

  it("moves between tabs with the arrow, Home and End keys", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    // Focus enters the panel container on open; Tab then reaches the strip, so
    // the roving tabindex starts on the first tab.
    tabs()[0]!.focus();
    const key = async (k: string): Promise<void> => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true }),
      );
      await flushPromises();
    };

    await key("ArrowRight");
    expect(tabs()[1]!.classList.contains("active")).toBe(true);
    expect(document.activeElement).toBe(tabs()[1]);
    await key("ArrowRight");
    expect(tabs()[2]!.classList.contains("active")).toBe(true);
    await key("ArrowRight");
    expect(tabs()[0]!.classList.contains("active")).toBe(true);
    await key("ArrowLeft");
    expect(tabs()[2]!.classList.contains("active")).toBe(true);
    await key("Home");
    expect(tabs()[0]!.classList.contains("active")).toBe(true);
    await key("End");
    expect(tabs()[2]!.classList.contains("active")).toBe(true);
  });

  it("switches between the body, related-tasks and details tabs", async () => {
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    await openTab("Tasks");
    expect(panel()!.querySelector(".md-rendered")).toBeNull();
    const rows = panel()!.querySelectorAll(".story-panel-task");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("#0001");
    expect(rows[0].textContent).toContain("First");

    await openTab("Details");
    expect(panel()!.querySelector(".story-panel-task")).toBeNull();
    const facts = panel()!.querySelector(".story-panel-facts")!;
    expect(facts.textContent).toContain("alpha slice");
    expect(facts.textContent).toContain("stories/alpha-slice.md");
    expect(facts.textContent).toContain("0 of 2 tasks done");
    expect(facts.textContent).toContain("Active 1");
  });
});

describe("story side panel empty states", () => {
  it("shows an empty state when the story has no related tasks", async () => {
    const repo = useRepoStore();
    // A registered story nothing is tagged with yet.
    repo.tasks = [makeTask({ id: "0009" })];
    repo.storyDefinitions = [definition("Other slice", "Body text.")];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    await openTab("Tasks");

    const el = panel()!;
    expect(el.querySelector(".story-panel-task")).toBeNull();
    expect(el.querySelector(".story-panel-empty")!.textContent).toContain("No related tasks");
  });

  it("shows an empty state on the body tab when the story has no written body", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Tag only" })];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    const el = panel()!;
    expect(el.querySelector(".md-rendered")).toBeNull();
    expect(el.querySelector(".story-panel-empty")!.textContent).toContain("No story body yet");
  });
});

describe("story side panel navigation and swapping", () => {
  it("swaps contents in place for a second story and resets the tab", async () => {
    useRepoStore().tasks = [
      makeTask({ id: "0001", story: "Alpha slice", title: "First", status: "active" }),
      makeTask({ id: "0002", story: "Beta slice", title: "Second", status: "ready" }),
    ];
    useRepoStore().storyDefinitions = [
      definition("Alpha slice", ALPHA_BODY),
      definition("Beta slice", BETA_BODY),
    ];
    const wrapper = mountView();
    await flushPromises();

    // Ordering puts attention/active work first, so Alpha heads the list.
    const heads = wrapper.findAll(".story-head");
    expect(heads).toHaveLength(2);
    await heads[0].trigger("click");
    await flushPromises();
    await openTab("Tasks");
    expect(panel()!.querySelectorAll(".story-panel-task")).toHaveLength(1);

    // The real browser sequence for clicking the other row: pointerdown, then
    // click. Both matter — radix dismisses a non-modal dialog on the
    // pointerdown, which would close and re-open the panel (a new DOM node)
    // rather than swap its contents.
    const before = panel();
    const row = heads[1]!.element as HTMLElement;
    row.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await flushPromises();
    // Still the very same element: never closed, never remounted.
    expect(panel()).toBe(before);
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    const el = panel()!;
    expect(el).toBe(before);
    expect(el.querySelector(".drawer-head")!.textContent).toContain("Beta slice");
    expect(tabs()[0].classList.contains("active")).toBe(true);
    expect(tabs()[1].classList.contains("active")).toBe(false);
    expect(el.querySelector(".md-rendered")!.textContent).toContain("A different slice entirely.");
  });

  it("keeps the panel open when focus moves to the list, but Escape still closes", async () => {
    useRepoStore().tasks = [
      makeTask({ id: "0001", story: "Alpha slice", status: "active" }),
      makeTask({ id: "0002", story: "Beta slice", status: "ready" }),
    ];
    const wrapper = mountView();
    await flushPromises();
    const heads = wrapper.findAll(".story-head");
    await heads[0].trigger("click");
    await flushPromises();
    const before = panel();

    // Tabbing out of the panel into the stories list is a focusin outside, the
    // second dismissal path. It must not close the panel either.
    (heads[1]!.element as HTMLElement).focus();
    await flushPromises();
    expect(panel()).toBe(before);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(panel()).toBeNull();
  });

  it("opens the task drawer from a related task, reusing the existing path", async () => {
    const tasks: Task[] = [
      makeTask({ id: "0001", story: "Alpha slice", title: "First", status: "active" }),
    ];
    useRepoStore().tasks = tasks;
    useRepoStore().storyDefinitions = [definition("Alpha slice", ALPHA_BODY)];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    await openTab("Tasks");

    panel()!.querySelector<HTMLElement>(".story-panel-task")!.click();
    await flushPromises();

    // The one path every other task link uses — not a story-specific one.
    expect(useUiStore().active?.id).toBe("0001");
    // The story panel gets out of the way so the two modals never fight over focus.
    expect(panel()).toBeNull();
  });

  it("keeps the panel's progress live while it is open", async () => {
    const repo = useRepoStore();
    const task = makeTask({ id: "0001", story: "Alpha slice", status: "active" });
    repo.tasks = [task];
    repo.storyDefinitions = [definition("Alpha slice", ALPHA_BODY)];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    expect(panel()!.querySelector(".story-panel-sub")!.textContent).toContain("0 done");

    repo.tasks = [{ ...task, status: "done" }];
    await flushPromises();
    expect(panel()!.querySelector(".story-panel-sub")!.textContent).toContain("1 done");
  });
});

describe("story side panel styling contract", () => {
  const panelSource = readFileSync(
    join(resolve(__dirname, ".."), "src/components/StoryPanel.vue"),
    "utf8",
  );
  const css = readFileSync(join(resolve(__dirname, ".."), "src/style.css"), "utf8");

  it("carries no scoped styles — teleported dialog CSS is global (AGENTS.md)", () => {
    expect(panelSource).not.toMatch(/<style/);
  });

  it("reuses the shared dialog, tab and markdown classes", () => {
    expect(panelSource).toContain('from "./ui/dialog/root.vue"');
    expect(panelSource).toContain("ui.drawerWidth");
    expect(panelSource).toContain("ui.startResize");
    expect(panelSource).toContain('class="drawer-tabs drawer-tabs-scroll"');
    expect(panelSource).toContain('class="tab-btn"');
    expect(panelSource).toContain('class="drawer-body story-panel-body"');
    expect(panelSource).toContain("renderMarkdown");
    expect(panelSource).toContain('class="md-rendered"');
  });

  it("stacks the details facts on narrow viewports at the shared drawer breakpoint", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 600px)"));
    expect(narrow).toMatch(/\.story-panel-fact\s*\{[^}]*flex-direction:\s*column/);
  });

  it("opts its own tab strip into scrolling without changing the other drawers", () => {
    expect(panelSource).toContain('class="drawer-tabs drawer-tabs-scroll"');
    expect(css).toMatch(/\.drawer-tabs-scroll\s*\{[^}]*overflow-x:\s*auto/);
    // The shared rule must stay untouched: the task and input panels keep the
    // shrink-to-fit behaviour they had before this task.
    expect(css).not.toMatch(/^\.drawer-tabs \{[^}]*overflow-x/m);
  });

  it("declares the panel non-modal, with no scrim to block the list", () => {
    expect(panelSource).toContain(':modal="false"');
    expect(panelSource).not.toMatch(/<DialogOverlay/);
  });

  it("blocks both of radix's outside-dismissal paths, which run before the click", () => {
    expect(panelSource).toContain('@pointer-down-outside="keepOpenOnOutsideInteraction"');
    expect(panelSource).toContain('@focus-outside="keepOpenOnOutsideInteraction"');
    expect(panelSource).toMatch(
      /function keepOpenOnOutsideInteraction[\s\S]*?e\.preventDefault\(\)/,
    );
  });
});
