import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import HumanTaskDoneDialog from "../src/components/HumanTaskDoneDialog.vue";

describe("human task Mark done dialog", () => {
  let wrapper: VueWrapper | undefined;
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  it("submits the multiline report through a real button click and cancels through its button", async () => {
    wrapper = mount(HumanTaskDoneDialog, {
      attachTo: document.body,
      props: { open: true },
      global: { stubs: { teleport: false, Transition: true } },
    });
    const area = document.body.querySelector<HTMLTextAreaElement>("#human-completion-report")!;
    expect(area).toBeTruthy();
    area.value = "Observed\n\n- First\n- Second";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector("[data-overlay-layer]")).toBeTruthy();
    const buttons = Array.from(document.body.querySelectorAll("button"));
    await wrapper.vm.$nextTick();
    buttons.find((button) => button.textContent?.trim() === "Cancel")!.click();
    expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Mark done")!
      .click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("confirm")?.[0]).toEqual(["Observed\n\n- First\n- Second"]);
  });
});
