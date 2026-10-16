/**
 * Task drawer "Open in editor" link (#0636): next to the Spec label, right
 * aligned, only when an editor is configured and the dev API is available.
 * Clicking it asks the server to open the task's own markdown file.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, json, makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

/** Router with a catch-all route so `router-link` resolves hrefs (#0805). */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

function stubApi(task: Task, calls: Array<{ url: string; body: unknown }>): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: { body?: string }) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/dev/open-in-editor")) return json({ ok: true });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(
  pinia: Pinia,
  task: Task,
  editor: { enabled?: boolean; editorCommand?: string } | null,
  apiAvailable = true,
  globalEditorCommand?: string,
): Promise<VueWrapper> {
  const config = useConfigStore();
  config.data = {
    dev: { inspector: editor ?? {} },
    ...(globalEditorCommand ? { editor: { command: globalEditorCommand } } : {}),
  };
  const repo = useRepoStore();
  repo.tasks = [task];
  repo.health = { ok: true, copyInspectorAvailable: apiAvailable } as typeof repo.health;
  const router = makeRouter();
  const wrapper = mount(TaskDrawer, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: { teleport: false, Transition: true },
    },
  });
  const ui = useUiStore();
  ui.open(task);
  ui.activeTab = "details";
  await flush();
  return wrapper;
}

describe("task drawer open in editor (#0636)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("shows a right-aligned link when an editor command is configured", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    const calls: Array<{ url: string; body: unknown }> = [];
    stubApi(task, calls);
    wrapper = await mountDrawer(pinia, task, { enabled: true, editorCommand: "zed {file}" });

    const link = wrapper.find('[data-test-id="open-in-editor"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("Open in editor ↗");
    expect(link.classes()).toContain("page-help-link");
    expect(link.element.parentElement?.classList.contains("spec-head")).toBe(true);

    await link.trigger("click");
    await flush();

    const open = calls.find((c) => c.url.includes("/api/dev/open-in-editor"));
    expect(open, "the open-in-editor endpoint should be called").toBeTruthy();
    expect(open!.body).toEqual({ file: "work/0001-test.md" });
  });

  it("hides the link when no editor command is configured", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task, []);
    wrapper = await mountDrawer(pinia, task, { enabled: true, editorCommand: "" });

    expect(wrapper.find('[data-test-id="open-in-editor"]').exists()).toBe(false);
  });

  it("hides the link when the copy inspector is disabled", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task, []);
    wrapper = await mountDrawer(pinia, task, { enabled: false, editorCommand: "zed {file}" });

    expect(wrapper.find('[data-test-id="open-in-editor"]').exists()).toBe(false);
  });

  it("hides the link when the dev editor API is unavailable", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task, []);
    wrapper = await mountDrawer(pinia, task, { enabled: true, editorCommand: "zed {file}" }, false);

    expect(wrapper.find('[data-test-id="open-in-editor"]').exists()).toBe(false);
  });

  it("shows a link on a normal install when only the general editor command is set", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    const calls: Array<{ url: string; body: unknown }> = [];
    stubApi(task, calls);
    wrapper = await mountDrawer(
      pinia,
      task,
      { enabled: true, editorCommand: "" },
      false,
      "zed {file}",
    );

    const link = wrapper.find('[data-test-id="open-in-editor"]');
    expect(link.exists()).toBe(true);

    await link.trigger("click");
    await flush();

    const open = calls.find((c) => c.url.includes("/api/dev/open-in-editor"));
    expect(open, "the open-in-editor endpoint should be called").toBeTruthy();
    expect(open!.body).toEqual({ file: "work/0001-test.md" });
  });

  it("hides the link when no editor is configured at all", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task, []);
    wrapper = await mountDrawer(pinia, task, { enabled: true, editorCommand: "" }, false);

    expect(wrapper.find('[data-test-id="open-in-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-test-id="open-in-editor-hint"]').exists()).toBe(true);
  });

  it("hint is a focusable link to the editor setting (#0805)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task, []);
    wrapper = await mountDrawer(pinia, task, { enabled: true, editorCommand: "" }, false);

    const hint = wrapper.get('[data-test-id="open-in-editor-hint"]');
    expect(hint.element.tagName).toBe("A");
    expect(hint.attributes("href")).toBe("/settings?tab=general&section=general");
    expect(hint.text()).toBe("Set editor in Settings → General");

    (hint.element as HTMLAnchorElement).focus();
    expect(document.activeElement).toBe(hint.element);
  });
});
