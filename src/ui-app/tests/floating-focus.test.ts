import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "radix-vue";
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
 * Pointer clicks, honestly: jsdom has no focus-on-click default action, so a
 * literal `click` can never move focus here. What jsdom CAN reproduce is the
 * event ordering that makes the bug bite in real browsers — a pointer-driven
 * shift completes first, then `focusout` fires on the previously focused
 * element with the new element as relatedTarget, and a refocus during that
 * dispatch (the trap) claws focus back. Each field is exercised through both
 * models below:
 *
 * 1. `.focus()` — jsdom's own model (its outer focus() call completes after
 *    the dispatch). This alone catches a missing `focusin` guard.
 * 2. A synthetic `focusout` dispatched from the drawer's field after the
 *    layer already holds focus — Chrome's ordering. This is what catches the
 *    missing `focusout` guard that survived review round 1 of the old
 *    `@focusin.stop` workaround.
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
                        h(DialogDescription, { class: "sr-only" }, { default: () => "drawer" }),
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

/** Set a form control's value the way typing does (v-model listens for input). */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("teleported floating layers keep focus against the drawer focus trap (#0638)", () => {
  it("send-to-engineer note textarea: focus holds, typing works, blur events survive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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

    // jsdom's own focus model: the trap must not claw focus back.
    note!.focus();
    await Promise.resolve();
    expect(document.activeElement, "focus stays in the note textarea").toBe(note);

    // Chrome's pointer-shift ordering: the shift has completed (the textarea
    // holds focus), then the transition's focusout fires on the drawer's
    // previously focused element. The trap must stay out of it.
    drawerField().focus();
    await Promise.resolve();
    note!.focus();
    await Promise.resolve();
    drawerField().dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: note! }),
    );
    await Promise.resolve();
    expect(
      document.activeElement,
      "focusout on the drawer's element must not yank focus back",
    ).toBe(note);

    // Typing actually lands in the model, and the dialog reacts.
    typeInto(note!, "fix the padding on the review tab");
    await Promise.resolve();
    const confirmBtn = document.querySelector<HTMLButtonElement>(
      ".ste-actions button:nth-child(2)",
    );
    expect(confirmBtn?.textContent).toContain("with note");
    confirmBtn?.click();
    await Promise.resolve();
    const confirmed = wrapper.findComponent(SendToEngineerDialog).emitted("confirm");
    expect(confirmed?.at(-1)?.[0]).toBe("fix the padding on the review tab");

    // Focus moving back out of the layer is left alone: it reaches the drawer
    // AND the layer's own control still sees its blur event (round-1 review:
    // the guard must not suppress transitions out of the layer).
    const blurSeen = vi.fn();
    note!.addEventListener("focusout", blurSeen);
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    expect(blurSeen, "layer control's focusout fires on the way out").toHaveBeenCalled();

    expect(consoleError, "no console errors while interacting").not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("area picker free-text input: focus holds, typing commits, blur events survive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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

    // jsdom's own focus model.
    input!.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(input);

    // Chrome's pointer-shift ordering (see file comment).
    drawerField().focus();
    await Promise.resolve();
    input!.focus();
    await Promise.resolve();
    drawerField().dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: input! }),
    );
    await Promise.resolve();
    expect(
      document.activeElement,
      "focusout on the drawer's element must not yank focus back",
    ).toBe(input);

    // Typing + Enter commits the area.
    typeInto(input!, "infra");
    input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
    const emitted = wrapper.findComponent(AreaPicker).emitted("update:modelValue");
    expect(emitted?.at(-1)?.[0]).toEqual(["infra"]);

    // Focus moving back out of the layer is left alone (round-1 review).
    const blurSeen = vi.fn();
    input!.addEventListener("focusout", blurSeen);
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    expect(blurSeen, "layer control's focusout fires on the way out").toHaveBeenCalled();

    expect(consoleError, "no console errors while interacting").not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
