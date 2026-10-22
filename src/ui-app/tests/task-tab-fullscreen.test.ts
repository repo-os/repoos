/**
 * Fullscreen toggle on the selected task tab (#0750).
 *
 * The toggle lives in the task tab strip, expands the drawer to fill the
 * viewport (`.drawer-fullscreen`), hides the controls and alerts above the
 * tabs, and collapses back to the task. Escape leaves fullscreen instead of
 * closing the drawer.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import DialogContent from "../src/components/ui/dialog/content.vue";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, json, makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

// jsdom has no Element.scrollTo; TaskDrawer calls it while streaming session output.
(Element.prototype as unknown as { scrollTo: () => void }).scrollTo ??= () => {};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await nextTick();
}

function stubApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountDrawer(pinia: Pinia, task: Task): Promise<VueWrapper> {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const wrapper = mount(TaskDrawer, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      stubs: { teleport: false, Transition: true },
    },
  });
  useUiStore().open(task);
  await flush();
  return wrapper;
}

/** The rendered drawer shell (real dialog content, teleported to <body>). */
function drawerShell(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(".drawer-wrap.drawer");
  expect(el, "drawer shell not rendered").toBeTruthy();
  return el!;
}

/** The fullscreen toggle in the task tab strip. */
function toggleButton(): HTMLButtonElement {
  const el = document.body.querySelector<HTMLButtonElement>('[data-test-id="task-tab-fullscreen"]');
  expect(el, "fullscreen toggle not found").toBeTruthy();
  return el!;
}

describe("task tab fullscreen toggle (#0750)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("offers a fullscreen toggle on the task tab strip, not inside a tab body", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task);

    wrapper = await mountDrawer(pinia, task);

    const btn = toggleButton();
    // It is part of the tab strip and separate from any tab's contents.
    expect(btn.closest(".drawer-tabs")).toBeTruthy();
    expect(btn.closest(".drawer-body")).toBeNull();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("expands the drawer to fullscreen, then collapses back to the task", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(makeTask());

    wrapper = await mountDrawer(pinia, makeTask());

    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(false);

    toggleButton().click();
    await flush();
    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(true);
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");

    toggleButton().click();
    await flush();
    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(false);
    expect(toggleButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("hides the pre-tab controls without unmounting the active tab", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(makeTask());

    wrapper = await mountDrawer(pinia, makeTask());
    const ui = useUiStore();
    ui.activeTab = "agent";
    await flush();
    const preTabs = document.body.querySelector<HTMLElement>(".drawer-pre-tabs");
    const tabPanel = document.body.querySelector<HTMLElement>(".drawer-body");
    const draft = document.body.querySelector<HTMLTextAreaElement>(
      '.ai-chat-compose textarea[aria-label="Follow up with the task\'s agent"]',
    );
    expect(preTabs).toBeTruthy();
    expect(tabPanel).toBeTruthy();
    expect(draft).toBeTruthy();
    draft!.value = "keep this draft";
    draft!.dispatchEvent(new Event("input", { bubbles: true }));
    tabPanel!.scrollTop = 64;

    toggleButton().click();
    await flush();
    expect(preTabs!.style.display).toBe("none");
    expect(document.body.querySelector(".drawer-tabs")).toBeTruthy();
    expect(document.body.querySelector(".drawer-body")).toBe(tabPanel);
    expect(tabPanel!.scrollTop).toBe(64);
    expect(document.body.querySelector(".ai-chat-compose textarea")).toBe(draft);
    expect(draft!.value).toBe("keep this draft");
    expect(document.body.querySelector('[data-test-id="drawer-hidden-alerts"]')).toBeNull();

    toggleButton().click();
    await flush();
    expect(preTabs!.style.display).not.toBe("none");
    expect(document.body.querySelector(".drawer-body")).toBe(tabPanel);
    expect(tabPanel!.scrollTop).toBe(64);
    expect(document.body.querySelector(".ai-chat-compose textarea")).toBe(draft);
    expect(draft!.value).toBe("keep this draft");
  });

  it("shows a compact return control only when hidden alerts exist", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask();
    stubApi(task);

    wrapper = await mountDrawer(pinia, task);
    const active = useUiStore().active!;
    active.needsInputReason = "review-failed";
    toggleButton().click();
    await flush();

    const indicator = document.body.querySelector<HTMLButtonElement>(
      '[data-test-id="drawer-hidden-alerts"]',
    );
    expect(indicator?.textContent).toContain("alert");
    indicator!.click();
    await flush();
    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(false);
    expect(document.body.querySelector('[data-test-id="drawer-hidden-alerts"]')).toBeNull();
  });

  it("names the currently selected tab in the toggle's accessible label", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(makeTask());

    const ui = useUiStore();
    wrapper = await mountDrawer(pinia, makeTask());

    ui.activeTab = "changes";
    await flush();
    expect(toggleButton().getAttribute("aria-label")).toContain("Changes");

    ui.activeTab = "review";
    await flush();
    expect(toggleButton().getAttribute("aria-label")).toContain("Review");
  });

  it("Escape leaves fullscreen without closing the drawer", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(makeTask());

    wrapper = await mountDrawer(pinia, makeTask());

    toggleButton().click();
    await flush();
    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(true);

    // Radix would dismiss the dialog on Escape; the drawer intercepts it while
    // expanded and prevents the default dismissal.
    const content = wrapper.findComponent(DialogContent);
    const ev = { defaultPrevented: false, preventDefault: vi.fn() };
    content.vm.$emit("escapeKeyDown", ev);
    await flush();

    expect(ev.preventDefault).toHaveBeenCalled();
    expect(drawerShell().classList.contains("drawer-fullscreen")).toBe(false);
    // The task is still open behind.
    expect(useUiStore().active).toBeTruthy();
  });
});

describe("fullscreen drawer styles (#0750)", () => {
  const css = readFileSync(resolve(join(__dirname, "..", "src", "style.css")), "utf8");

  it("fills the viewport when expanded and hides the resize handle", () => {
    expect(css).toMatch(/\.drawer-wrap\.drawer-fullscreen\s*\{[^}]*width:\s*100vw\s*!important/);
    expect(css).toMatch(/\.drawer-fullscreen \.drawer-resize\s*\{[^}]*display:\s*none/);
  });
});
