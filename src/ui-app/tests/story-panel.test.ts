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
function definition(name: string, body: string, number: string | undefined = "0001") {
  return {
    key: name.toLowerCase(),
    name,
    number,
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
    // #0515 added PM directly after the body tab, matching the task panel's
    // strip (Task · PM · Dev · …).
    expect(labels).toEqual(["Story", "PM", "Tasks 2", "Details"]);
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
    // Roving tabindex: only the selected tab is in the tab order. Four tabs
    // since #0515 added PM (Story · PM · Tasks · Details).
    expect(list.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);

    await openTab("Tasks");
    const body2 = panel()!.querySelector('[role="tabpanel"]')!;
    expect(body2.getAttribute("aria-labelledby")).toBe(
      tabs().find((t) => t.textContent?.includes("Tasks"))!.id,
    );
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
    expect(tabs()[3]!.classList.contains("active")).toBe(true);
    // Wraps back to the first tab — the strip is a cycle, not a dead end.
    await key("ArrowRight");
    expect(tabs()[0]!.classList.contains("active")).toBe(true);
    await key("ArrowLeft");
    expect(tabs()[3]!.classList.contains("active")).toBe(true);
    await key("Home");
    expect(tabs()[0]!.classList.contains("active")).toBe(true);
    await key("End");
    expect(tabs()[3]!.classList.contains("active")).toBe(true);
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

describe("story copy-link number and deeplink (#0515)", () => {
  it("leads the panel header with the number, in the same slot as the task panel", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Alpha slice", status: "ready" })];
    useRepoStore().storyDefinitions = [definition("Alpha slice", ALPHA_BODY, "0042")];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    const number = panel()!.querySelector(".drawer-head .copyable-number")!;
    expect(number.textContent).toBe("#0042");
    expect(number.getAttribute("aria-label")).toBe("Copy link to story 0042");
    // The number row comes before the title, like the task panel's header.
    const head = panel()!.querySelector(".drawer-head")!;
    const ids = head.querySelector(".story-panel-ids")!;
    expect(ids.contains(number)).toBe(true);
    expect(
      head.querySelector("[data-radix-dialog-title], .drawer-head-title")!.textContent,
    ).toContain("Alpha slice");
  });

  it("shows no number for a story that exists only as a task tag", async () => {
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Tag only", status: "ready" })];
    useRepoStore().storyDefinitions = [];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();

    // There is no definition file to hold a number, so there is nothing stable
    // to show or deep-link — the same graceful degradation as an input written
    // before numbering existed.
    expect(panel()!.querySelector(".copyable-number")).toBeNull();
  });
});

describe("story panel PM tab (#0515)", () => {
  const sent: string[] = [];

  function stubFetch(outputLines: unknown[] = []): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
        if (u.includes("/pm/output")) return json({ ok: true, lines: outputLines });
        if (u.includes("/pm/message")) {
          const body = JSON.parse(String((init?.body as string) ?? "{}"));
          sent.push(body.text ?? "");
          return json({ ok: true });
        }
        if (u.includes("/api/health")) {
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        }
        if (u.includes("/api/board") || u.includes("/api/index")) {
          return json({
            tasks: [],
            counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 },
            taskCount: 0,
          });
        }
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/api/config")) return json({ agents: [] });
        throw new Error("unexpected fetch: " + u);
      }),
    );
  }

  beforeEach(() => {
    sent.length = 0;
  });

  async function openPmTab(outputLines: unknown[] = []): Promise<void> {
    stubFetch(outputLines);
    useRepoStore().tasks = [makeTask({ id: "0001", story: "Alpha slice", status: "ready" })];
    useRepoStore().storyDefinitions = [definition("Alpha slice", ALPHA_BODY, "0042")];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.find(".story-head").trigger("click");
    await flushPromises();
    await openTab("PM");
  }

  it("offers a PM tab next to the body tab and renders the chat surface", async () => {
    await openPmTab();
    expect(tabs().map((t) => (t.textContent ?? "").trim())).toEqual([
      "Story",
      "PM",
      "Tasks 1",
      "Details",
    ]);
    // The chat brings its own fixed body so only the transcript scrolls, the
    // same split the task panel's PM tab makes — never a scrolling body inside
    // another one.
    const tabpanel = panel()!.querySelector('[role="tabpanel"]')!;
    expect(tabpanel.classList.contains("drawer-body")).toBe(true);
    expect(tabpanel.classList.contains("drawer-session-body")).toBe(true);
    expect(tabpanel.querySelector(".pm-log-wrap")).toBeTruthy();
    expect(tabpanel.querySelector(".pm-compose")).toBeTruthy();
    expect(tabpanel.textContent).toContain("Chat about this story");
  });

  it("keeps the tab's ARIA wiring on the chat, not lost to a two-root component", async () => {
    await openPmTab();
    // StoryPmChat has two roots (the chat and the screenshot viewer), so Vue
    // cannot auto-inherit fallthrough attrs — the tab's role/id/label arrive
    // that way from StoryPanel. Without forwarding them by hand the whole tab
    // silently stops being a labelled tabpanel.
    const tabpanel = panel()!.querySelector('[role="tabpanel"]')!;
    expect(tabpanel).toBeTruthy();
    const tab = tabs().find((t) => t.textContent?.includes("PM"))!;
    expect(tabpanel.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(tab.getAttribute("aria-controls")).toBe(tabpanel.id);
    expect(tabpanel.getAttribute("tabindex")).toBe("0");
  });

  it("sends a message to the story PM endpoint and shows it optimistically", async () => {
    await openPmTab();
    const compose = panel()!.querySelector<HTMLTextAreaElement>(".pm-compose textarea")!;
    compose.value = "Break this story down into tasks.";
    compose.dispatchEvent(new Event("input"));
    await flushPromises();

    const form = panel()!.querySelector<HTMLFormElement>(".pm-compose")!;
    form.dispatchEvent(new Event("submit"));
    await flushPromises();

    expect(sent).toEqual(["Break this story down into tasks."]);
    // The optimistic bubble is on screen, and the server was addressed by the
    // story's key, URL-encoded.
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const post = calls.find((c) => String(c[0]).includes("/pm/message"));
    expect(String(post![0])).toContain(
      `/api/stories/${encodeURIComponent("alpha slice")}/pm/message`,
    );
    expect(panel()!.textContent).toContain("Break this story down into tasks.");
  });

  it("hydrates a retained transcript keyed by the story's number", async () => {
    await openPmTab([
      { type: "human", text: "what is left?", at: "2026-09-20T10:00:00Z" },
      { type: "text", text: "Two tasks remain.", at: "2026-09-20T10:00:05Z" },
    ]);
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => String(c[0]).includes("/api/stories/alpha%20slice/pm/output"))).toBe(
      true,
    );
    // The transcript lands in the store under `pm-story-v1:0042` — the same
    // shape as a task's `pm-task-v2:<id>`.
    expect(useRepoStore().outputs["pm-story-v1:0042"]).toHaveLength(2);
    expect(panel()!.querySelector(".pm-log-wrap")!.textContent).toContain("Two tasks remain.");
  });

  it("offers the same canned prompts the task panel shows", async () => {
    await openPmTab();
    const canned = Array.from(panel()!.querySelectorAll(".pm-canned-item")).map(
      (el) => el.textContent ?? "",
    );
    expect(canned.length).toBeGreaterThan(0);
    expect(canned.join(" ")).toContain("Break the remaining work down into tasks.");
  });
});

describe("story side panel styling contract", () => {
  const panelSource = readFileSync(
    join(resolve(__dirname, ".."), "src/components/StoryPanel.vue"),
    "utf8",
  );
  const drawerSource = readFileSync(
    join(resolve(__dirname, ".."), "src/components/TaskDrawer.vue"),
    "utf8",
  );
  const chatSource = readFileSync(
    join(resolve(__dirname, ".."), "src/components/StoryPmChat.vue"),
    "utf8",
  );
  const surfaceSource = readFileSync(
    join(resolve(__dirname, ".."), "src/components/PmChatSurface.vue"),
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

  it("leads the header with the shared copy-link number, like the task panel (#0515)", () => {
    // The task panel's badge leads `.drawer-head` too; the story one must be
    // the same component in the same slot, not a lookalike.
    expect(panelSource).toContain('import CopyableNumber from "./CopyableNumber.vue"');
    expect(panelSource).toContain('class="story-panel-ids"');
    expect(panelSource).toContain("CopyableNumber");
    expect(panelSource).toContain("`Copy link to story ${story?.number}`");
    expect(panelSource).toContain("/stories?story=");
    expect(drawerSource).toContain("CopyableNumber");
    // The number row sits above the title, in the same flex row the task panel
    // uses. 8px is the task panel's inline `gap: 8px` on that row; 7px is the
    // margin between the row and the title beneath it.
    expect(css).toMatch(/\.story-panel-ids\s*\{[^}]*gap:\s*8px[^}]*margin-bottom:\s*7px/);
  });

  it("shares one PM chat surface with the task panel, and one stylesheet (#0515)", () => {
    // The story panel must not carry its own chat. Both panels render the
    // shared <PmChatSurface>, which owns the .pm-* classes; those live in
    // style.css because dialog content is body-teleported, so a scoped rule
    // would reach neither panel.
    expect(panelSource).toContain('import StoryPmChat from "./StoryPmChat.vue"');
    expect(chatSource).toContain('from "./PmChatSurface.vue"');
    expect(drawerSource).toContain('from "./PmChatSurface.vue"');
    for (const cls of [
      "pm-log-wrap",
      "ai-chat-log",
      "pm-empty",
      "pm-bubble",
      "pm-markdown",
      "pm-compose",
      "pm-canned-item",
    ]) {
      expect(surfaceSource, `${cls} missing from the shared surface`).toContain(cls);
      expect(css, `${cls} must be global, not scoped to one component`).toContain(`.${cls}`);
    }
    // Neither host re-declares the surface's classes in a scoped block. (The
    // drawer legitimately still uses `useChatScroll` for its *other* tabs — the
    // Dev and Review chats, each registered in ai-chat.ts — so only assert that
    // the story host, which has no other chat, adds nothing of its own.)
    for (const host of [drawerSource, chatSource]) {
      for (const cls of ["pm-log-wrap", "pm-bubble", "pm-compose"]) {
        expect(host, `${cls} must not be re-declared in a host`).not.toContain(`.${cls} {`);
      }
    }
    expect(chatSource, "the story host must not hand-roll the standard").not.toContain(
      "useChatScroll(",
    );
    expect(chatSource, "the story host must not hand-roll tool-call grouping").not.toContain(
      "toDisplayRows(",
    );
    // The standard's hooks live in exactly one place.
    for (const hook of ["useChatScroll", "ChatJumpToLatest", "AiChatThinking", "toDisplayRows"]) {
      expect(surfaceSource, `${hook} missing from the shared surface`).toContain(hook);
    }
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
