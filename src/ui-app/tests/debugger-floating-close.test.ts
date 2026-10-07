/**
 * Regression test for #0572: the Debugger floating-head panel could not be
 * dismissed. `repairTaskId`/`diagnosis` still referenced the `lineText` helper
 * that #0506 deleted, so the moment the panel's slot rendered Vue threw
 * `ReferenceError: lineText is not defined` and aborted the update — the X and
 * backdrop cleared `activeHead` but the panel DOM stayed on screen.
 *
 * Mounting the panel OPEN forces those computeds to evaluate, and clicking the
 * header X must emit `close`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import DebuggerChat from "../src/components/DebuggerChat.vue";

let wrapper: VueWrapper | null = null;
let pinia: ReturnType<typeof createPinia>;
let router: Router;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", name: "agents", component: { template: "<div />" } }],
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      enabled: true,
      running: false,
      lines: [{ type: "text", text: "diagnosis ready", at: "2026-09-28T00:00:00.000Z" }],
    }),
  } as Response);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe("DebuggerChat floating panel close (#0572)", () => {
  it("renders while open without the deleted lineText helper crashing the update", async () => {
    wrapper = mount(DebuggerChat, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [pinia, router] },
    });
    await flushPromises();

    // A render-time ReferenceError leaves the slot unrendered, so these vanish.
    expect(wrapper.find(".agent-chat-header").exists()).toBe(true);
    expect(wrapper.find(".debugger-close").exists()).toBe(true);
    expect(wrapper.text()).toContain("diagnosis ready");
  });

  it("emits close when the header X is clicked", async () => {
    wrapper = mount(DebuggerChat, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [pinia, router] },
    });
    await flushPromises();

    await wrapper.find(".debugger-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("hides the panel when open flips false", async () => {
    wrapper = mount(DebuggerChat, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [pinia, router] },
    });
    await flushPromises();

    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(wrapper.find(".agent-chat-header").exists()).toBe(false);
  });
});
