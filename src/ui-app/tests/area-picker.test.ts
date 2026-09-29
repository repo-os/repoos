/**
 * The multi-select area picker (#0583): checkmark toggles over the
 * vocabulary, a free-text entry when nothing matches (the no-vocabulary
 * fallback never blocks), and the "add to repoos areas" offer for
 * out-of-vocabulary values. The panel teleports to <body> (#0575), so the
 * tests query `document.body` for its content.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import AreaPicker from "../src/components/AreaPicker.vue";

/** Panels leak into <body> if a wrapper is left mounted — clear between tests. */
afterEach(() => {
  document.body.innerHTML = "";
});

async function findTeleported(selector: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 10; i++) {
    const el = document.body.querySelector(selector);
    if (el) return el as HTMLElement;
    await new Promise((r) => setTimeout(r, 0));
  }
  return null;
}

const VOCAB = [{ name: "web", description: "the app" }, { name: "core" }];

function mountPicker(value: string[] = [], options = VOCAB) {
  return mount(AreaPicker, { props: { modelValue: value, options, id: "ap-test" } });
}

describe("AreaPicker (#0583)", () => {
  it("mounts with vocabulary rows and the free-text entry", async () => {
    const wrapper = mountPicker(["web"]);
    await wrapper.find("#ap-test").trigger("click");
    const options = document.body.querySelectorAll('[role="option"]');
    // Both vocabulary entries render; the selected one carries the check.
    expect(options.length).toBe(2);
    const input = await findTeleported('input[aria-label="Add a custom area"]');
    expect(input).not.toBeNull();
  });

  it("a typed value OUTSIDE the vocabulary commits through the same entry", async () => {
    const wrapper = mountPicker();
    await wrapper.find("#ap-test").trigger("click");
    const input = (await findTeleported(
      'input[aria-label="Add a custom area"]',
    )) as HTMLInputElement;
    input.value = "mobile";
    await input.dispatchEvent(new Event("input", { bubbles: true }));
    await input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([["mobile"]]);
  });

  it("free-text only mode: an empty vocabulary still allows typing an area", async () => {
    const wrapper = mountPicker([], []);
    await wrapper.find("#ap-test").trigger("click");
    const input = (await findTeleported(
      'input[aria-label="Add a custom area"]',
    )) as HTMLInputElement;
    input.value = "web";
    await input.dispatchEvent(new Event("input", { bubbles: true }));
    await input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([["web"]]);
  });

  it("shows an out-of-vocabulary selection with an add-to-areas offer", async () => {
    const wrapper = mountPicker(["mobile"]);
    await wrapper.find("#ap-test").trigger("click");
    const offer = (await findTeleported(
      'button[title^="Add mobile to the declared areas"]',
    )) as HTMLButtonElement;
    expect(offer).not.toBeNull();
    offer!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.emitted("addToVocabulary")?.[0]).toEqual(["mobile"]);
  });

  it("teleports its panel to body with its own layer (floating)", async () => {
    const wrapper = mountPicker();
    await wrapper.find("#ap-test").trigger("click");
    const panel = await findTeleported("[data-overlay-layer]");
    expect(panel?.getAttribute("data-overlay-layer")).not.toBe("");
  });
});
