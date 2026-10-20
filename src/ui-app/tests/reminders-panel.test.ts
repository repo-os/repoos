import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import RemindersPanel from "../src/components/RemindersPanel.vue";
import { useRemindersStore } from "../src/stores/reminders";
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));
let wrapper: VueWrapper;
beforeEach(() => {
  setActivePinia(createPinia());
  useRemindersStore().refresh = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const drawer = () => document.body.querySelector('[data-testid="reminder-editor-drawer"]');
it("uses shared teleported drawer and controls; closes on X, outside and Escape", async () => {
  wrapper = mount(RemindersPanel, { attachTo: document.body });
  for (const close of ["x", "outside", "escape"]) {
    await wrapper.get('[data-testid="new-reminder"]').trigger("click");
    await flushPromises();
    expect(drawer()?.querySelector(".drawer-head")).toBeTruthy();
    expect(drawer()?.hasAttribute("data-overlay-layer")).toBe(true);
    expect(drawer()?.querySelector('button[role="combobox"]')).toBeTruthy();
    // Radix provides a hidden native select for form interoperability.
    expect(drawer()?.querySelector('select:not([aria-hidden="true"])')).toBeNull();
    expect(drawer()?.querySelector("input.ff-textarea")).toBeNull();
    expect(drawer()?.textContent).toContain("browser’s timezone");
    if (close === "x") await wrapper.get('[data-testid="reminder-editor-close"]').trigger("click");
    if (close === "outside")
      document.body
        .querySelector(".overlay")!
        .dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }),
        );
    if (close === "escape")
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(drawer()).toBeNull();
  }
});
it("saves local date/time as an ISO instant", async () => {
  const store = useRemindersStore();
  store.add = vi.fn().mockResolvedValue(undefined);
  wrapper = mount(RemindersPanel, { attachTo: document.body });
  await wrapper.get('[data-testid="new-reminder"]').trigger("click");
  await flushPromises();
  const input = drawer()!.querySelector<HTMLInputElement>("#reminder-text")!;
  input.value = "Check credit";
  input.dispatchEvent(new Event("input"));
  drawer()!
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flushPromises();
  expect(store.add).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Check credit", fireAt: expect.stringMatching(/Z$/) }),
  );
});
