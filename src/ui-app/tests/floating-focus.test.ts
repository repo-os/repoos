import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from "radix-vue";
import AreaPicker from "../src/components/AreaPicker.vue";
import SendToEngineerDialog from "../src/components/SendToEngineerDialog.vue";

/**
 * Floating layers vs. the drawer's Radix focus trap (#0638).
 *
 * Both reported fields — the area picker's free-text input and the
 * send-to-engineer note — live in layers teleported to `<body>`, outside the
 * task drawer's radix-vue focus scope. The trap refocuses the drawer the
 * moment focus lands outside it, so the inputs could not hold the caret.
 *
 * The minimal harness below mounts a real radix-vue modal Dialog ("the
 * drawer") next to the real components; it reproduces the exact trap, without
 * the weight of a full TaskDrawer mount.
 *
 * jsdom quirk this suite leans on deliberately: a programmatic `.focus()`
 * still ends up on the layer's input when only `focusin` is stopped (the old
 * AreaPicker workaround), because jsdom completes the outer focus() call
 * after the trap's mid-dispatch refocus. Real browsers cancel the pending
 * transfer instead — the pointer-driven shift fires `focusout` on the
 * previously focused element first, and the trap refocuses during that
 * dispatch. The `focusout`-simulation test below reproduces that
 * real-browser ordering and is what pins the capture-phase fix.
 */

/** A stand-in for the task drawer: a radix-vue modal dialog with a field. */
const Drawer = defineComponent({
  setup(_, { expose }) {
    const open = ref(true);
    expose({ open });
    return () =>
      h(
        DialogRoot,
        { open: open.value, "onUpdate:open": (v: boolean) => (open.value = v) },
        {
          default: () => [
            h(
              DialogPortal,
              {},
              {
                default: () => [
                  h(DialogOverlay),
                  h(
                    DialogContent,
                    { style: "width:320px;height:220px" },
                    {
                      default: () => [
                        h(DialogTitle, {}, { default: () => "drawer" }),
                        h("input", { id: "drawer-field", type: "text" }),
                      ],
                    },
                  ),
                ],
              },
            ),
          ],
        },
      );
  },
});

const VOCAB: { name: string; description?: string }[] = [
  { name: "web", description: "web" },
  { name: "core", description: "core" },
];

const drawerField = (): HTMLInputElement => {
  const el = document.getElementById("drawer-field");
  if (!(el instanceof HTMLInputElement)) throw new Error("drawer field missing");
  return el;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("teleported floating layers keep focus against the drawer focus trap (#0638)", () => {
  it("send-to-engineer note textarea holds focus while the drawer modal is open", async () => {
    const wrapper = mount(
      {
        setup: () => () =>
          h("div", {}, [
            h(Drawer),
            h(SendToEngineerDialog, { open: true, busy: false, title: "Send to engineer" }),
          ]),
      },
      { attachTo: document.body },
    );
    await Promise.resolve();

    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());

    const note = document.querySelector<HTMLTextAreaElement>("textarea.ste-note");
    expect(note, "note textarea rendered").toBeTruthy();
    note!.focus();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement, "focus stays in the note textarea").toBe(note);

    // Focus returning to the drawer still works — the trap regains control.
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    wrapper.unmount();
  });

  it("area picker free-text input holds focus and commits an entry", async () => {
    const wrapper = mount(
      {
        setup: () => () =>
          h("div", {}, [
            h(Drawer),
            h(AreaPicker, { modelValue: [], options: VOCAB, "onUpdate:modelValue": () => {} }),
          ]),
      },
      { attachTo: document.body },
    );
    await Promise.resolve();

    // Open the picker's teleported panel.
    const trigger = wrapper.find("button");
    await trigger.trigger("click");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Add a custom area"]');
    expect(input, "free-text input rendered in the teleported panel").toBeTruthy();

    drawerField().focus();
    await Promise.resolve();

    input!.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(input);

    // Real-browser ordering for a pointer-driven focus shift: focusout fires
    // on the previously focused element with the new element as relatedTarget,
    // and the trap refocuses the drawer during that dispatch — the browser
    // then cancels the pending transfer. (jsdom's own focus() hides this, so
    // the transition is simulated explicitly.)
    drawerField().dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: input! }),
    );
    await Promise.resolve();
    expect(
      document.activeElement,
      "focusout on the drawer's element must not yank focus back",
    ).toBe(input);

    // And the field is functional: typing + Enter commits the area.
    input!.value = "infra";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
    const emitted = wrapper.findComponent(AreaPicker).emitted("update:modelValue");
    expect(emitted?.at(-1)?.[0]).toEqual(["infra"]);
    wrapper.unmount();
  });
});
