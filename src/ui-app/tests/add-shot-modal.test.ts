/**
 * The Add-shot modal's validation (#0627): inline validation runs on the
 * composed entry through the SHARED core validator (`parseShotEntry`), so the
 * modal can never submit something the API would reject — and a step error
 * that names "step #N" marks that row. A valid entry emits the typed
 * DeclaredShot; nothing is emitted while invalid.
 */
import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import AddShotModal from "../src/components/AddShotModal.vue";

// Render dialog children in place; real radix only adds portal/overlay behaviour.
const DialogStub = {
  props: { open: { type: Boolean, default: false } },
  template: `<div v-if="open"><slot /></div>`,
};
const AttrPassThrough = {
  inheritAttrs: false,
  setup(
    _props: unknown,
    { slots, attrs }: { slots: { default?: () => unknown }; attrs: Record<string, unknown> },
  ) {
    return () => h("div", attrs, slots.default?.() as never);
  },
};
const Slot = {
  setup(_props: unknown, { slots }: { slots: { default?: () => unknown } }) {
    return () => slots.default?.();
  },
};
const stubs = {
  teleport: true,
  Dialog: DialogStub,
  DialogContent: AttrPassThrough,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: AttrPassThrough,
  // Radix Select is interaction machinery this test doesn't drive; the
  // validation is what's under test and the model value is set directly.
  Select: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: `<div><slot name="trigger" /></div>`,
  },
  SelectTrigger: true,
  SelectValue: true,
  SelectContent: true,
  SelectViewport: true,
  SelectItem: true,
};

import { h } from "vue";

const TARGETS = [
  { name: "default", areas: [] },
  { name: "docs", areas: ["docs"] },
];

function mountModal(open = true): VueWrapper {
  return mount(AddShotModal, {
    props: { open, targets: TARGETS },
    global: { stubs },
  });
}

describe("AddShotModal validation (#0627)", () => {
  it("renders the plain-input form when open: no JSON anywhere", () => {
    const w = mountModal();
    expect(w.find("form").exists()).toBe(true);
    expect(w.text()).toContain("Target");
    expect(w.text()).toContain("Steps");
    // Raw JSON editing is exactly what this replaces — never offered.
    expect(w.find("textarea").exists()).toBe(false);
  });

  it("blocks submit and shows the shared validator's message for a bad step", async () => {
    const w = mountModal();
    // Target defaults to the first option; add an invalid waitMs step.
    const addStep = w.findAll("button").find((b) => b.text().includes("Add step"))!;
    await addStep.trigger("click");
    const kindButtons = w.findAll(".add-shot-step-kind-btn");
    await kindButtons.find((b) => b.text() === "wait")!.trigger("click");
    await w.find("form").trigger("submit");
    await nextTick();
    const err = w.find(".ff-error");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("waitMs");
    // The row is outlined.
    expect(w.find(".add-shot-step.invalid").exists()).toBe(true);
    expect(w.emitted("submit")).toBeUndefined();
  });

  it("emits the typed entry with defaults on a valid submit", async () => {
    const w = mountModal();
    await w.find("#add-shot-route").setValue("/repo");
    await w.find("#add-shot-label").setValue("Task drawer open");
    await w.find("form").trigger("submit");
    await nextTick();
    expect(w.emitted("submit")).toHaveLength(1);
    expect(w.emitted("submit")![0]).toEqual([
      { target: "default", route: "/repo", label: "Task drawer open" },
    ]);
  });

  it("shows a capture warning in the modal and blocks a duplicate submit", async () => {
    const w = mountModal();
    await w.setProps({ warning: "highlight .nope matched nothing" });
    const notice = w.find('[data-test-id="add-shot-warning"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain("highlight .nope matched nothing");
    // The shot is already saved: submit is disabled, cancel reads "Close".
    expect(w.find('button[type="submit"]').attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("Close");
  });

  it("a click step with a selector validates clean", async () => {
    const w = mountModal();
    await w
      .findAll("button")
      .find((b) => b.text().includes("Add step"))!
      .trigger("click");
    await w.find(".add-shot-step-inputs input").setValue("button.drawer-toggle");
    await w.find("form").trigger("submit");
    expect(w.emitted("submit")![0]![0]).toMatchObject({
      target: "default",
      steps: [{ click: "button.drawer-toggle" }],
    });
  });
});
