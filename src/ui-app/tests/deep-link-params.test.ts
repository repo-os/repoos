/**
 * Deep-link query params (#0345): /work?task=<id|new>, /inputs?input=<id|new>,
 * /stories?story=<number|key|new> (#0515), and /settings?setting=<id> (an alias
 * of the existing ?focus=). Each handler opens its panel, then clears its param
 * with router.replace while preserving any other query keys, so a refresh
 * doesn't re-open the panel. Survival of the params through the login
 * round-trip itself is covered in router-guard.test.ts (the guard redirects with
 * redirect=to.fullPath).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField, Task } from "../src/types";
import type { Input } from "../../core/input.js";
import WorkView from "../src/views/WorkView.vue";
import InputsView from "../src/views/InputsView.vue";
import StoriesView from "../src/views/StoriesView.vue";
import SettingsView from "../src/views/SettingsView.vue";
import ContextView from "../src/views/ContextView.vue";
import { useDocsStore } from "../src/stores/docs";
import DialogContent from "../src/components/ui/dialog/content.vue";
import DialogTitle from "../src/components/ui/dialog/title.vue";

const api = vi.spyOn(apiMod, "api");

let currentQuery: Record<string, string | string[]> = {};
const replaceSpy = vi.fn(async () => {});

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: currentQuery }),
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

function makeTask(id: string, status: Task["status"] = "ready"): Task {
  return {
    id,
    title: `Task ${id}`,
    type: "feature",
    status,
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: `work/${id}-task.md`,
    absPath: `/tmp/repo/work/${id}-task.md`,
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
  };
}

function makeInput(id: string, number = ""): Input {
  return {
    id,
    number,
    title: `Idea ${id}`,
    status: "new",
    body: "A captured thought.",
    type: "idea",
    area: "web",
    createdBy: "human",
    createdAt: "2026-09-14T00:00:00Z",
    updatedAt: "2026-09-14T00:00:00Z",
    path: `inputs/${id}.md`,
    attachments: [],
    resolution: "",
    resolvedTask: "",
  };
}

function schemaField(key: string): ConfigField {
  return {
    key,
    label: key,
    type: "boolean",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: false,
    description: "",
    options: [],
  } as ConfigField;
}

async function loadConfig(): Promise<void> {
  api.mockResolvedValue({ config: { maxActiveTasks: 3 }, schema: [schemaField("maxActiveTasks")] });
  await useConfigStore().load();
}

const WORK_STUBS = { BoardColumn: true, IntegrationStatusBar: true } as const;

beforeEach(() => {
  setActivePinia(createPinia());
  currentQuery = {};
  replaceSpy.mockClear();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
  // jsdom does not implement scrollIntoView; the settings deep-link focuses a row.
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
  localStorage.clear();
});

describe("work ?task= deep-link (#0345)", () => {
  it("?task=<id> opens that task's drawer and clears the param", async () => {
    useRepoStore().tasks = [makeTask("0340"), makeTask("0341", "active")];
    currentQuery = { task: "0340" };
    api.mockResolvedValue(makeTask("0340")); // drawer background refresh
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    const ui = useUiStore();
    expect(ui.isNew).toBe(false);
    expect(ui.active?.id).toBe("0340");
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("?task=new opens the new-task panel and clears the param", async () => {
    useRepoStore().tasks = [];
    currentQuery = { task: "new" };
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    const ui = useUiStore();
    expect(ui.isNew).toBe(true);
    expect(ui.active).toBeNull();
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("an id missing from the board index is fetched directly and still opens", async () => {
    useRepoStore().tasks = [makeTask("0341")];
    currentQuery = { task: "0999" };
    api.mockResolvedValue(makeTask("0999"));
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    expect(api).toHaveBeenCalledWith("/api/tasks/0999");
    expect(useUiStore().active?.id).toBe("0999");
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("an unknown id (404) leaves the drawer closed and the param untouched", async () => {
    useRepoStore().tasks = [];
    currentQuery = { task: "9999" };
    api.mockRejectedValue(new Error("404"));
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    expect(useUiStore().active).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("a '#'-prefixed id still opens the task", async () => {
    useRepoStore().tasks = [makeTask("0340")];
    currentQuery = { task: "#0340" };
    api.mockResolvedValue(makeTask("0340"));
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    expect(useUiStore().active?.id).toBe("0340");
    wrapper.unmount();
  });

  it("clearing the param preserves other query keys (e.g. ?status=)", async () => {
    useRepoStore().tasks = [makeTask("0340", "active")];
    currentQuery = { status: "active", task: "0340" };
    api.mockResolvedValue(makeTask("0340"));
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ query: { status: "active" } });
    wrapper.unmount();
  });
});

describe("inputs ?input= deep-link (#0345)", () => {
  it("?input=<id> opens that input's drawer once the list loads, then clears the param", async () => {
    api.mockResolvedValue([makeInput("idea-1")]);
    currentQuery = { input: "idea-1" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    // The list loads after mount; the retry lands within ~100ms.
    await new Promise((r) => setTimeout(r, 200));

    expect(wrapper.findComponent(DialogContent).exists()).toBe(true);
    expect(wrapper.findComponent(DialogTitle).text()).toBe("Idea idea-1");
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("?input=new opens the new-input panel and clears the param", async () => {
    api.mockResolvedValue([]);
    currentQuery = { input: "new" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();

    const ui = useUiStore();
    expect(ui.isNewInput).toBe(true);
    expect(ui.active).toBeNull();
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("a deep-linked input opens even when its status is filtered out", async () => {
    api.mockResolvedValue([makeInput("idea-2"), { ...makeInput("idea-3"), status: "processed" }]);
    currentQuery = { input: "idea-3" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    // "processed" is unchecked by default, but the drawer still opens.
    expect(wrapper.findComponent(DialogContent).exists()).toBe(true);
    expect(wrapper.findComponent(DialogTitle).text()).toBe("Idea idea-3");
    wrapper.unmount();
  });

  it("?input=<number> opens the input with that stable number", async () => {
    api.mockResolvedValue([makeInput("idea-9", "0001"), makeInput("idea-10", "0002")]);
    currentQuery = { input: "0001" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    expect(wrapper.findComponent(DialogTitle).text()).toBe("Idea idea-9");
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("a bare numeric param (and a leading '#') still matches the padded number", async () => {
    api.mockResolvedValue([makeInput("idea-9", "0007")]);
    currentQuery = { input: "#7" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    expect(wrapper.findComponent(DialogTitle).text()).toBe("Idea idea-9");
    wrapper.unmount();
  });

  it("an unknown numeric param degrades gracefully (no drawer, no crash)", async () => {
    api.mockResolvedValue([makeInput("idea-9", "0001")]);
    currentQuery = { input: "9999" };
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    // No drawer opens and the param is left intact.
    expect(wrapper.findComponent(DialogTitle).exists()).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("displays the number with each input", async () => {
    api.mockResolvedValue([makeInput("idea-9", "0001")]);
    const wrapper = mount(InputsView, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find(".input-row .input-number").text()).toBe("#0001");
    wrapper.unmount();
  });
});

describe("stories ?story= deep-link (#0515)", () => {
  /**
   * The story side panel's drawer, found by its tablist. `NewStoryPanel` uses
   * the same `.drawer-head-title`, and earlier tests in this file leave their
   * teleported dialogs in `document.body`, so a bare class selector would match
   * the wrong panel.
   */
  function storyPanel(): HTMLElement | null {
    const drawers = Array.from(document.body.querySelectorAll<HTMLElement>(".drawer"));
    return (
      drawers.find((d) => d.querySelector('[role="tablist"][aria-label="Story details"]')) ?? null
    );
  }

  function storyTitle(): string {
    return storyPanel()?.querySelector(".drawer-head-title")?.textContent ?? "";
  }

  function storyDef(name: string, number: string) {
    return {
      key: name.toLowerCase(),
      name,
      number,
      path: `stories/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
      body: "Scope.",
      createdAt: "2026-09-01T00:00:00Z",
      createdBy: "hello@repoos.org",
    };
  }

  function openStories(): void {
    useConfigStore().data = { stories: { enabled: true } };
    useRepoStore().tasks = [makeTask("0001")];
  }

  it("?story=<number> opens that story's panel, then clears the param", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "0007" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();

    expect(storyTitle()).toContain("Alpha slice");
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("a bare numeric param (and a leading '#') still matches the padded number", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "#7" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();

    expect(storyTitle()).toContain("Alpha slice");
    wrapper.unmount();
  });

  it("?story=<key> opens a story whose file predates numbering", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "")];
    currentQuery = { story: "alpha slice" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();

    expect(storyTitle()).toContain("Alpha slice");
    wrapper.unmount();
  });

  it("preserves sibling query keys when clearing the param", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "0007", from: "digest" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ query: { from: "digest" } });
    wrapper.unmount();
  });

  it("?story=new still opens the new-story panel, not a story lookup", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "new" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();

    expect(useUiStore().isNewStory).toBe(true);
    expect(storyPanel()).toBeNull();
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("opens after the feature flag arrives, as on a cold load of a copied link", async () => {
    // The regression this guards: `App.vue` loads `config` in its `onMounted`,
    // AFTER `repo.init()` and the doc/skill loads, so a view mounting from a
    // pasted `/stories?story=0007` sees `config.data` still empty. A watcher
    // tracking only the query gated on `!enabled`, bailed, and never re-ran —
    // dropping the link on exactly the flow a deeplink exists for.
    useConfigStore().data = {};
    useRepoStore().tasks = [makeTask("0001")];
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "0007" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();
    expect(storyPanel()).toBeNull();

    // Config lands, flipping the flag — the link must resolve now.
    useConfigStore().data = { stories: { enabled: true } };
    await flushPromises();

    expect(storyTitle()).toContain("Alpha slice");
    expect(replaceSpy).toHaveBeenCalledWith({ query: {} });
    wrapper.unmount();
  });

  it("an unknown param degrades gracefully (no panel, param left intact)", async () => {
    openStories();
    useRepoStore().storyDefinitions = [storyDef("Alpha slice", "0007")];
    currentQuery = { story: "9999" };
    const wrapper = mount(StoriesView, { attachTo: document.body });
    await flushPromises();
    // Give the retry loop a chance to give up before asserting nothing opened.
    await new Promise((r) => setTimeout(r, 250));

    expect(storyPanel()).toBeNull();
    expect(replaceSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("settings ?setting= deep-link (#0345)", () => {
  it("?setting=<key> scrolls to and focuses that row, then clears the param", async () => {
    await loadConfig();
    currentQuery = { setting: "maxActiveTasks" };
    // attachTo: the deep-link lookup is document.getElementById, which only
    // sees elements attached to the document (a detached VTU root is invisible).
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    // The row must exist in the document before the retry focuses it.
    await new Promise((r) => setTimeout(r, 200));

    const scroll = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("setting-maxActiveTasks");
    // After focusing, the ?setting= param is cleared but the ?tab= query is kept
    // so the active tab survives the replace (#0402).
    expect(replaceSpy).toHaveBeenCalledWith({ name: "settings", query: { tab: "general" } });
    wrapper.unmount();
  });

  it("the existing ?focus= behavior is unchanged", async () => {
    await loadConfig();
    currentQuery = { focus: "maxActiveTasks" };
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    const scroll = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("setting-maxActiveTasks");
    // After focusing, the ?focus= param is cleared but the ?tab= query is kept
    // so the active tab survives the replace (#0402).
    expect(replaceSpy).toHaveBeenCalledWith({ name: "settings", query: { tab: "general" } });
    wrapper.unmount();
  });

  it("?setting= wins when both params are present", async () => {
    await loadConfig();
    currentQuery = { setting: "maxActiveTasks", focus: "bogus-key" };
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 200));

    const scroll = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("setting-maxActiveTasks");
    wrapper.unmount();
  });
});

describe("context ?doc= deep-link (#0557)", () => {
  const ctxStubs = {
    NewDocPanel: { template: "<div />" },
    NewSkillPanel: { template: "<div />" },
    RepoHistoryPanel: { template: "<div />" },
    SearchOverlay: { template: "<div />" },
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    currentQuery = {};
    replaceSpy.mockClear();
  });

  it("opens the Docs tab and loads the doc named in ?doc=", async () => {
    currentQuery = { doc: "docs/guide.md" };
    const docs = useDocsStore();
    docs.docs = [{ path: "docs/guide.md", title: "Guide", mtimeMs: 1 }];
    const loadDoc = vi.spyOn(docs, "loadDoc").mockResolvedValue(undefined);

    const wrapper = mount(ContextView, { global: { stubs: ctxStubs } });
    await flushPromises();

    expect(wrapper.find(".ctx-tab.on").text()).toBe("Docs");
    expect(loadDoc).toHaveBeenCalledWith("docs/guide.md");
    wrapper.unmount();
  });

  it("?tab=skills lands on the Skills tab", async () => {
    currentQuery = { tab: "skills" };
    const wrapper = mount(ContextView, { global: { stubs: ctxStubs } });
    await flushPromises();

    expect(wrapper.find(".ctx-tab.on").text()).toBe("Skills");
    wrapper.unmount();
  });
});
