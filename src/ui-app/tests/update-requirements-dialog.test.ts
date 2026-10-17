/**
 * UpdateRequirementsDialog (#0817): the active-task requirements editor. Edit
 * mode seeds from the task body and saves the textarea; result mode renders
 * each changed section with an added/edited/removed badge and the per-item
 * `+`/`-` markers, which is the "changed sections highlighted when saved" UX.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { h, type VNode } from "vue";
import UpdateRequirementsDialog from "../src/components/UpdateRequirementsDialog.vue";
import type { RequirementsChange } from "../../core/task-body-diff";

// Render the dialog primitive children in place (Radix recursion under jsdom
// is not what this test exercises).
const Slot = {
  setup:
    (_props: unknown, { slots }: { slots: { default?: () => unknown } }) =>
    () =>
      slots.default?.(),
};
const ButtonStub = {
  inheritAttrs: false,
  setup:
    (
      _props: unknown,
      ctx: { slots: { default?: () => VNode[] }; attrs: Record<string, unknown> },
    ) =>
    () =>
      h("button", ctx.attrs, ctx.slots.default?.() ?? []),
};
const dialogStubs = {
  teleport: true,
  Dialog: Slot,
  DialogContent: Slot,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: Slot,
  Button: ButtonStub,
  VoiceDictate: true,
};

const BODY = ["## Acceptance criteria", "", "- one", "", "## Problem", "", "Why."].join("\n");

function resultChange(): RequirementsChange {
  return {
    summary: "Acceptance criteria (added 1, removed 1)",
    detail: "## Acceptance criteria\n+ two\n- one",
    sections: [
      {
        heading: "## Acceptance criteria",
        label: "Acceptance criteria",
        kind: "edited",
        added: ["- two"],
        removed: ["- one"],
      },
    ],
  };
}

function mountDialog(props: Record<string, unknown>) {
  return mount(UpdateRequirementsDialog, {
    props: { open: true, body: BODY, ...props },
    global: { stubs: dialogStubs },
  });
}

describe("UpdateRequirementsDialog", () => {
  it("seeds the editor from the body and emits the edited text on save", async () => {
    const wrapper = mountDialog({});
    const textarea = wrapper.find("textarea");
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe(BODY);

    await textarea.setValue(`${BODY}\n- two`);

    const save = wrapper.find('[data-test-id="requirements-save"]');
    expect(save.exists()).toBe(true);
    await save.trigger("click");
    expect(wrapper.emitted("save")?.at(-1)?.[0]).toBe(`${BODY}\n- two`);
  });

  it("renders the changed sections highlighted after saving", () => {
    const wrapper = mountDialog({ result: resultChange() });
    expect(wrapper.find('[data-test-id="requirements-result"]').exists()).toBe(true);
    // The editor is replaced by the result view.
    expect(wrapper.find("textarea").exists()).toBe(false);

    const section = wrapper.find(".reqs-diff-section");
    expect(section.exists()).toBe(true);
    expect(section.attributes("data-kind")).toBe("edited");
    expect(section.find(".reqs-diff-badge").text()).toBe("edited");

    const items = section.findAll(".reqs-diff-item");
    expect(items.map((i) => i.attributes("data-marker"))).toEqual(["+", "-"]);
    expect(items.map((i) => i.text())).toEqual(["- two", "- one"]);

    // Done closes the dialog.
    const done = wrapper.find('[data-test-id="requirements-done"]');
    expect(done.exists()).toBe(true);
  });
});
