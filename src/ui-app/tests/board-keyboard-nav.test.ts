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

interface Col {
  id: string;
  collapsed?: boolean;
  tasks: Task[];
}

function cols(
  ...groups: Array<[string, string[]] | [string, string[], { collapsed: boolean }]>
): Col[] {
  return groups.map(([id, ids, opts]) => ({
    id,
    collapsed: opts?.collapsed ?? false,
    tasks: ids.map((t) => makeTask(t)),
  }));
}

/** Minimal harness that exercises the composable against a real board-like DOM:
 *  one `.board-col` per group, each containing `.task-card` rows. The
 *  highlighted row gets the `kb-highlight` class, mirroring TaskCard. Collapsed
 *  columns get the `collapsed` class (the board hides their body). */
const Harness = defineComponent({
  name: "KeyboardHarness",
  props: {
    columns: { type: Array as () => Col[], required: true },
    enabled: { type: Boolean, default: true },
    panelOpen: { type: Boolean, default: false },
  },
  emits: ["opened", "close-panel"],
  setup(props, { emit }) {
    const containerRef = ref<HTMLElement | null>(null);
    const tasks = ref(props.columns.flatMap((c) => c.tasks));
    watch(
      () => props.columns,
      (v) => {
        tasks.value = v.flatMap((c) => c.tasks);
      },
    );
    const enabled = ref(props.enabled);
    watch(
      () => props.enabled,
      (v) => {
        enabled.value = v;
      },
    );
    const panelOpen = ref(props.panelOpen);
    watch(
      () => props.panelOpen,
      (v) => {
        panelOpen.value = v;
      },
    );
    const nav = useBoardKeyboardNav({
      containerRef,
      tasks,
      open: (t) => emit("opened", t),
      enabled,
      panelOpen,
      closePanel: () => emit("close-panel"),
    });
    return () =>
      h(
        "div",
        { ref: containerRef },
        props.columns.map((col) =>
          h(
            "div",
            {
              class: ["board-col", col.collapsed ? "collapsed" : ""],
              "data-col": col.id,
              key: "col" + col.id,
            },
            col.tasks.map((t) =>
              h(
                "div",
                {
                  class: ["task-card", nav.highlightId.value === t.id ? "kb-highlight" : ""],
                  "data-task-id": t.id,
                  key: t.id,
                },
                t.title,
              ),
            ),
          ),
        ),
      );
  },
});

async function press(
  key: string,
  target: EventTarget = window,
  opts: { shiftKey?: boolean } = {},
): Promise<void> {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      shiftKey: opts.shiftKey ?? false,
    }),
  );
  // The highlighted class binds reactively; allow a render tick before asserting.
  await nextTick();
}

function highlighted(wrapper: ReturnType<typeof mount>) {
  return wrapper.find(".task-card.kb-highlight");
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
      props: { columns: cols(["a", ["0001", "0002", "0003"]]) },
    });

    await press("k"); // moving up from no highlight stays unhighlighted
    expect(highlighted(wrapper).exists()).toBe(false);

    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0002']").classes()).toContain("kb-highlight");

    await press("k");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("treats arrows as equivalent to j/k", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]) },
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
      props: { columns: cols(["a", ["0001", "0002"]]) },
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

  it("moves horizontally between columns with h/l and Left/Right", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]], ["b", ["0101"]], ["c", ["0201", "0202"]]) },
    });

    await press("j"); // 0001 in column a
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    await press("l");
    expect(wrapper.find(".task-card[data-task-id='0101']").classes()).toContain("kb-highlight");

    await press("l");
    expect(wrapper.find(".task-card[data-task-id='0201']").classes()).toContain("kb-highlight");

    await press("h");
    expect(wrapper.find(".task-card[data-task-id='0101']").classes()).toContain("kb-highlight");

    await press("ArrowLeft");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("horizontal nav clamps at either end of the columns", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001"]], ["b", ["0101"]]) },
    });
    await press("l"); // right from nothing lands on first column
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
    await press("h"); // left from first column stays put
    await press("h");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("Enter opens the highlighted task and Esc clears the highlight", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]) },
    });

    await press("j");
    await press("j");
    await press("Enter");
    const opened = wrapper.emitted("opened");
    expect(opened).toBeTruthy();
    expect((opened as unknown[][])[0][0]).toMatchObject({ id: "0002" });

    await press("Escape");
    expect(highlighted(wrapper).exists()).toBe(false);

    // Enter with no highlight does nothing
    await press("Enter");
    expect(wrapper.emitted("opened")).toHaveLength(1);
  });

  it("Esc is two-stage: closes an open panel keeping the highlight, then clears", async () => {
    // Use a two-column layout so we can prove the highlight survives the close.
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001"]], ["b", ["0101"]]), panelOpen: false },
    });

    // Establish a highlight while the panel is closed.
    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    // A task panel opens (e.g. via Enter) — the highlight stays.
    await wrapper.setProps({ panelOpen: true });
    await nextTick();

    // Panel open: Esc closes the panel, keeps the highlight.
    await press("Escape");
    expect(wrapper.emitted("close-panel")).toHaveLength(1);
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    // Panel now closed: Esc clears the highlight.
    await wrapper.setProps({ panelOpen: false });
    await nextTick();
    await press("Escape");
    expect(highlighted(wrapper).exists()).toBe(false);
  });

  it("ignores keys typed inside an editable field", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]) },
    });
    const input = window.document.createElement("input");
    window.document.body.appendChild(input);

    await press("j", input);
    expect(highlighted(wrapper).exists()).toBe(false);
  });

  it("only navigates when the toggle is enabled", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]), enabled: false },
    });

    await press("j");
    await press("Enter");
    expect(highlighted(wrapper).exists()).toBe(false);
    expect(wrapper.emitted("opened")).toBeUndefined();

    // Turning the toggle on activates navigation.
    await wrapper.setProps({ enabled: true });
    await nextTick();
    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");
  });

  it("clears the highlight when the toggle is turned off", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]), enabled: true },
    });
    await press("j");
    expect(highlighted(wrapper).exists()).toBe(true);

    await wrapper.setProps({ enabled: false });
    await nextTick();
    expect(highlighted(wrapper).exists()).toBe(false);
  });

  it("clears highlight when its task leaves the rendered list", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]) },
    });
    await press("j");
    await press("Enter");

    // Rerender with the highlighted task gone — the highlight must move away.
    await wrapper.setProps({ columns: cols(["a", ["0002"]]) });
    await nextTick();
    await nextTick();
    const kb = highlighted(wrapper);
    // reconcile lands on the first remaining card rather than stranding an id.
    expect(kb.exists()).toBe(true);
    expect(kb.attributes("data-task-id")).toBe("0002");
  });

  it("never moves the highlight into a collapsed column", async () => {
    const wrapper = mount(Harness, {
      props: {
        columns: cols(["a", ["0001"]], ["b", ["0101"], { collapsed: true }], ["c", ["0201"]]),
      },
    });

    await press("j");
    expect(wrapper.find(".task-card[data-task-id='0001']").classes()).toContain("kb-highlight");

    // Moving right must skip the collapsed column b and land on c.
    await press("l");
    expect(wrapper.find(".task-card[data-task-id='0101']").classes()).not.toContain("kb-highlight");
    expect(wrapper.find(".task-card[data-task-id='0201']").classes()).toContain("kb-highlight");
  });

  it("does not hijack Enter on a focused interactive control", async () => {
    const wrapper = mount(Harness, {
      props: { columns: cols(["a", ["0001", "0002"]]) },
    });
    await press("j"); // establish a highlight

    // Dispatching Enter from a focused button must NOT open the highlighted
    // task — the button owns the key (its native activation).
    const button = window.document.createElement("button");
    window.document.body.appendChild(button);
    await press("Enter", button);
    expect(wrapper.emitted("opened")).toBeUndefined();
  });
});
