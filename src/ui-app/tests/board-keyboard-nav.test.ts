import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, watch } from "vue";
import { useBoardKeyboardNav } from "../src/composables/useBoardKeyboardNav";
import type { Task } from "../src/types";

function makeTask(id: string, title = "Task " + id): Task {
  return {
    id,
    title,
    type: "feature",
    status: "inbox",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: `work/${id}-task.md`,
    absPath: `/tmp/repo/work/${id}-task.md`,
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
  };
}

/** Minimal harness that exercises the composable against a real DOM of
 *  `.task-card` rows (the same selector the composable queries in the board).
 *  The highlighted row gets the `kb-highlight` class, mirroring how TaskCard
 *  derives it from the `highlighted` prop. Cards whose id appears in
 *  `collapsedIds` are wrapped in a `.board-col.collapsed` column, mirroring how
 *  the board hides collapsed columns. */
const Harness = defineComponent({
  name: "KeyboardHarness",
  props: {
    tasks: { type: Array as () => Task[], required: true },
    collapsedIds: { type: Array as () => string[], default: () => [] },
  },
  emits: ["opened"],
  setup(props, { emit }) {
    const containerRef = ref<HTMLElement | null>(null);
    const tasks = ref(props.tasks);
    watch(() => props.tasks, (v) => { tasks.value = v; });
    const nav = useBoardKeyboardNav({
      containerRef,
      tasks,
      open: (t) => emit("opened", t),
    });
    return () =>
      h(
        "div",
        { ref: containerRef },
        props.tasks.map((t) => {
          const card = h(
            "div",
            {
              class: ["task-card", nav.highlightId.value === t.id ? "kb-highlight" : ""],
              "data-task-id": t.id,
              key: t.id,
            },
            t.title,
          );
          if (props.collapsedIds.includes(t.id)) {
            return h("div", { class: "board-col collapsed", key: "col-" + t.id }, card);
          }
          return card;
        }),
      );
  },
});

async function press(
  key: string,
  target: EventTarget = window,
  opts: { shiftKey?: boolean } = {},
): Promise<void> {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, shiftKey: opts.shiftKey ?? false }),
  );
  // The highlighted class binds reactively; allow a render tick before asserting.
  await nextTick();
}

beforeEach(() => {
  // jsdom does not define scrollIntoView; the composable calls it on move.
  (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.document.body.innerHTML = "";
});

describe("useBoardKeyboardNav", () => {
  it("moves the highlight down with j and up with k", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002"), makeTask("0003")] },
    });

    await press("k"); // moving up from no highlight stays unhighlighted
    let kb = wrapper.find(".task-card.kb-highlight");
    expect(kb.exists()).toBe(false);

    await press("j");
    kb = wrapper.find(".task-card[data-task-id='0001']");
    expect(kb.classes()).toContain("kb-highlight");

    await press("j");
    kb = wrapper.find(".task-card[data-task-id='0002']");
    expect(kb.classes()).toContain("kb-highlight");

    await press("k");
    kb = wrapper.find(".task-card[data-task-id='0001']");
    expect(kb.classes()).toContain("kb-highlight");
  });

  it("treats arrows as equivalent to j/k", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });
    await press("ArrowDown");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
    await press("ArrowDown");
    expect(wrapper.find(".task-card[data-task-id='0002']").classes()).toContain("kb-highlight");
    await press("ArrowUp");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("stays clamped within the visible list at either end", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });
    await press("j");
    await press("j");
    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0002']").classes()).toContain("kb-highlight");
    await press("k");
    await press("k");
    await press("k");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("Enter opens the highlighted task and Esc clears the highlight", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });

    await press("j");
    await press("j");
    await press("Enter");
    let opened = wrapper.emitted("opened");
    expect(opened).toBeTruthy();
    expect((opened as unknown[][])[0][0]).toMatchObject({ id: "0002" });

    await press("Escape");
    expect(wrapper.find(".task-card.kb-highlight").exists()).toBe(false);

    // Enter with no highlight does nothing
    await press("Enter");
    opened = wrapper.emitted("opened");
    expect(opened).toHaveLength(1);
  });

  it("ignores keys typed inside an editable field", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });
    const input = window.document.createElement("input");
    window.document.body.appendChild(input);

    await press("j", input);
    expect(wrapper.find(".task-card.kb-highlight").exists()).toBe(false);
  });

  it("clears highlight when its task leaves the rendered list", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });
    await press("j");
    await press("Enter");

    // Rerender with the highlighted task gone — the highlight must move away.
    await wrapper.setProps({ tasks: [makeTask("0002")] });
    await nextTick();
    await nextTick();
    const kb = wrapper.find(".task-card.kb-highlight");
    // reconcile lands on the first remaining card rather than stranding an id.
    expect(kb.exists()).toBe(true);
    expect(kb.attributes("data-task-id")).toBe("0002");
  });

  it("never moves the highlight onto a collapsed column's cards", async () => {
    const wrapper = mount(Harness, {
      props: {
        tasks: [makeTask("0001"), makeTask("0002"), makeTask("0003")],
        collapsedIds: ["0002"],
      },
    });

    await press("Enter"); // nothing highlighted yet
    // First reachable card is 0001.
    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    // Moving down must skip the hidden 0002 and land on 0003.
    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0002']").classes()).not.toContain("kb-highlight");
    expect(wrapper.find(".task-card[data-task-id='0003']").classes()).toContain("kb-highlight");
  });

  it("does not hijack Enter on a focused interactive control", async () => {
    const wrapper = mount(Harness, {
      props: { tasks: [makeTask("0001"), makeTask("0002")] },
    });
    // Establish a highlight first.
    await press("j");

    // Dispatching Enter from a focused button must NOT open the highlighted
    // task — the button owns the key (its native activation).
    const button = window.document.createElement("button");
    window.document.body.appendChild(button);
    await press("Enter", button);
    expect(wrapper.emitted("opened")).toBeUndefined();
  });
});
