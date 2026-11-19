import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import Dialog from "../src/components/ui/dialog/root.vue";
import DialogClose from "../src/components/ui/dialog/close.vue";
import DialogContent from "../src/components/ui/dialog/content.vue";
import DialogDescription from "../src/components/ui/dialog/description.vue";
import DialogOverlay from "../src/components/ui/dialog/overlay.vue";
import DialogTitle from "../src/components/ui/dialog/title.vue";

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

describe("shared dialog keyboard accessibility", () => {
  it("names the dialog, contains focus, and restores focus to its opener", async () => {
    const Harness = defineComponent({
      components: {
        Dialog,
        DialogClose,
        DialogContent,
        DialogDescription,
        DialogOverlay,
        DialogTitle,
      },
      setup() {
        const open = ref(false);
        return { open };
      },
      template: `
        <button id="dialog-opener" @click="open = true">Open release options</button>
        <button id="outside-control">Outside action</button>
        <Dialog :open="open" @update:open="open = $event">
          <DialogOverlay />
          <DialogContent>
            <DialogTitle>Release options</DialogTitle>
            <DialogDescription>Choose how to continue.</DialogDescription>
            <DialogClose id="dialog-close">Close options</DialogClose>
            <button id="dialog-action">Continue</button>
          </DialogContent>
        </Dialog>`,
    });
    wrapper = mount(Harness, { attachTo: document.body });

    const opener = wrapper.get("#dialog-opener").element as HTMLButtonElement;
    opener.focus();
    await wrapper.get("#dialog-opener").trigger("click");
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog!.getAttribute("aria-describedby")).toBeTruthy();

    const outside = document.body.querySelector<HTMLButtonElement>("#outside-control")!;
    outside.focus();
    await nextTick();
    expect(dialog!.contains(document.activeElement)).toBe(true);

    document.body.querySelector<HTMLButtonElement>("#dialog-close")!.click();
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
