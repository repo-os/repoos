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
 * The fix mounts a (non-trapping) radix `FocusScope` inside each layer while
 * it is open: the scope's guard PAUSES the drawer's trap on radix's shared
 * guard stack — the same mechanism that makes nested radix dialogs work. No
 * focus event is suppressed, so document-level listeners (the global tooltip
 * handler) keep seeing every transition; the tooltip spies below pin that.
 *
 * The minimal harness mounts a real radix-vue modal Dialog ("the drawer")
 * next to the real components; it reproduces the exact trap, without the
 * weight of a full TaskDrawer mount.
 *
 * Pointer clicks, honestly: jsdom has no focus-on-click default action, so a
 * literal `click` can never move focus here. What jsdom CAN reproduce is the
 * event ordering that makes the bug bite in real browsers — a pointer-driven
 * shift completes first, then `focusout` fires on the previously focused
 * element with the new element as relatedTarget, and a refocus during that
 * dispatch (the trap) claws focus back. Each field is exercised through both
 * models below; the headless WebKit UI smoke test drives the same flows with
 * real pointer clicks in a real browser (src/commands/ui-smoke.ts).
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

/**
 * Document-level focus listeners registered the way `lib/tooltip.ts` does —
 * bubble phase on `document`. A capture-phase suppressor (the round-2 fix)
 * starves exactly these for layer-involving transitions, so the spies record
 * targets: the tests assert the layer's own focusin/focusout transitions were
 * seen, not merely that the spies fired for anything.
 */
function spyOnDocumentFocus(): {
  focusinTargets: Element[];
  focusoutTargets: Element[];
} {
  const focusinTargets: Element[] = [];
  const focusoutTargets: Element[] = [];
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof Element) focusinTargets.push(e.target);
  });
  document.addEventListener("focusout", (e) => {
    if (e.target instanceof Element) focusoutTargets.push(e.target);
  });
  return { focusinTargets, focusoutTargets };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("teleported floating layers keep focus against the drawer focus trap (#0638)", () => {
  it("send-to-engineer note textarea: opens focused, holds focus, typing works, document listeners see events", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const docFocus = spyOnDocumentFocus();
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
    // Flush far enough for radix's mount autofocus (runs after a nextTick).
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const note = document.querySelector<HTMLTextAreaElement>("textarea.ste-note");
    expect(note, "note textarea rendered").toBeTruthy();
    expect(
      document.activeElement,
      "dialog opens with the note textarea focused (radix mount autofocus, under the paused trap)",
    ).toBe(note);

    // jsdom's own focus model: the trap must not claw focus back.
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    note!.focus();
    await Promise.resolve();
    expect(document.activeElement, "focus stays in the note textarea").toBe(note);

    // Chrome's pointer-shift ordering: the shift has completed (the textarea
    // holds focus), then the transition's focusout fires on the drawer's
    // previously focused element. The paused trap must stay out of it.
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

    // Focus moving back out of the layer is untouched: it reaches the drawer,
    // the layer's own control sees its blur event, and — the round-2 review's
    // regression — the document-level listeners saw the LAYER's transitions
    // themselves (a capture-phase suppressor stops exactly these).
    const blurSeen = vi.fn();
    note!.addEventListener("focusout", blurSeen);
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    expect(blurSeen, "layer control's focusout fires on the way out").toHaveBeenCalled();
    expect(docFocus.focusinTargets, "document listeners saw focus enter the layer").toContain(
      note!,
    );
    expect(docFocus.focusoutTargets, "document listeners saw focus leave the layer").toContain(
      note!,
    );

    expect(consoleError, "no console errors while interacting").not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("area picker free-text input: focus holds, typing commits, document listeners see events, trap resumes on close", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const docFocus = spyOnDocumentFocus();
    const wrapper = mount(
      {
        setup: () => () =>
          h("div", {}, [
            h(Drawer),
            h(AreaPicker, { modelValue: [], options: VOCAB, "onUpdate:modelValue": () => {} }),
            // A focusable element outside every scope, used to observe the trap
            // RESUMING once the picker panel closes.
            h("input", { id: "outside-field", type: "text" }),
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

    // Focus moving back out of the layer is untouched (round-1 review), and
    // the document-level listeners saw the layer's own transitions (round-2).
    const blurSeen = vi.fn();
    input!.addEventListener("focusout", blurSeen);
    drawerField().focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(drawerField());
    expect(blurSeen, "layer control's focusout fires on the way out").toHaveBeenCalled();
    expect(docFocus.focusinTargets, "document listeners saw focus enter the layer").toContain(
      input!,
    );
    expect(docFocus.focusoutTargets, "document listeners saw focus leave the layer").toContain(
      input!,
    );

    // Closing the panel unmounts the layer's FocusScope, whose guard leaves
    // the shared stack — the drawer's trap resumes and yanks outside focus
    // back into the drawer again.
    await trigger.trigger("click");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    (document.getElementById("outside-field") as HTMLInputElement).focus();
    await Promise.resolve();
    expect(
      document.activeElement,
      "trap resumes after the panel closes: outside focus is yanked back into the drawer",
    ).toBe(drawerField());

    expect(consoleError, "no console errors while interacting").not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
