/**
 * #1141 — Work Queue show/hide controls for human-assigned and held tasks.
 *
 * The header toggles filter those two categories out of the board columns
 * without changing status/assignment semantics, while the bottom-left parked
 * lists stay reachable in the Human, Held, Archived order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import BoardColumn from "../src/components/BoardColumn.vue";
import WorkView from "../src/views/WorkView.vue";
import { useRepoStore } from "../src/stores/repo";
import { EMPTY_COUNTS, flush, makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

function stubWideViewport(): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal("innerWidth", 1280);
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/client-board", component: { template: "<div />" } },
      { path: "/work", component: { template: "<div />" } },
    ],
  });
}

const selectStub = { template: "<div><slot /></div>" };

/** The real column would mount every TaskCard; the test only needs the list
 *  WorkView hands it, so render the ids the column received. */
const BoardColumnStub = {
  props: { col: { type: Object, required: true }, tasks: { type: Array, default: null } },
  template: `<div class="board-column-stub" :data-column="col.id">
    <span v-for="t in tasks ?? []" :key="t.id" class="stub-task" :data-task-id="t.id">{{ t.id }}</span>
  </div>`,
};

function mountWork(tasks: Task[]): VueWrapper {
  const pinia = createPinia();
  setActivePinia(pinia);
  const repo = useRepoStore();
  repo.loading = false;
  repo.tasks = tasks;
  repo.counts = { ...EMPTY_COUNTS };
  return mount(WorkView, {
    global: {
      plugins: [pinia, makeRouter()],
      stubs: {
        BoardColumn: BoardColumnStub,
        IntegrationStatusBar: true,
        PipelineView: true,
        Select: selectStub,
        SelectTrigger: selectStub,
        SelectContent: selectStub,
        SelectItem: selectStub,
        SelectViewport: selectStub,
        SelectValue: selectStub,
      },
    },
  });
}

function visibleIds(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".stub-task").map((el) => el.attributes("data-task-id") ?? "");
}

function headerToggle(wrapper: VueWrapper, kind: "human" | "held") {
  return wrapper.get(`[data-testid='toggle-${kind}-visibility']`);
}

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  stubWideViewport();
  localStorage.clear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Work Queue category visibility (#1141)", () => {
  const humanReady = makeTask({ id: "0101", status: "ready", assignee: "human" });
  const aiReady = makeTask({ id: "0102", status: "ready" });
  const heldActive = makeTask({ id: "0103", status: "active", isHeld: true });

  it("places both controls between Client board and the collapse toggle", async () => {
    wrapper = mountWork([aiReady]);
    await flush();

    const actions = wrapper.get(".work-header-actions").element;
    const children = Array.from(actions.children);
    const linkIndex = children.findIndex((el) => el.classList.contains("client-board-link"));
    const visibilityIndex = children.findIndex((el) => el.classList.contains("queue-visibility"));
    const collapseIndex = children.findIndex(
      (el) => el.tagName === "BUTTON" && el.getAttribute("aria-label")?.includes("columns"),
    );

    expect(visibilityIndex).toBeGreaterThan(linkIndex);
    expect(collapseIndex).toBeGreaterThan(visibilityIndex);
    expect(wrapper.findAll(".queue-visibility .queue-visibility-btn")).toHaveLength(2);
  });

  it("hides only human-assigned tasks and restores them on a second click", async () => {
    wrapper = mountWork([humanReady, aiReady, heldActive]);
    await flush();
    expect(visibleIds(wrapper).sort()).toEqual(["0101", "0102", "0103"]);

    const human = headerToggle(wrapper, "human");
    expect(human.attributes("aria-pressed")).toBe("true");
    expect(human.attributes("aria-label")).toBe("Hide human-assigned tasks");

    await human.trigger("click");
    expect(visibleIds(wrapper).sort()).toEqual(["0102", "0103"]);
    expect(human.attributes("aria-pressed")).toBe("false");
    expect(human.attributes("aria-label")).toBe("Show human-assigned tasks");
    // The other category is untouched.
    expect(headerToggle(wrapper, "held").attributes("aria-pressed")).toBe("true");

    await human.trigger("click");
    expect(visibleIds(wrapper).sort()).toEqual(["0101", "0102", "0103"]);
  });

  it("hides only held tasks and keeps the two settings independent", async () => {
    wrapper = mountWork([humanReady, aiReady, heldActive]);
    await flush();

    await headerToggle(wrapper, "held").trigger("click");
    expect(visibleIds(wrapper).sort()).toEqual(["0101", "0102"]);

    await headerToggle(wrapper, "human").trigger("click");
    expect(visibleIds(wrapper)).toEqual(["0102"]);

    // Restoring one category does not restore the other.
    await headerToggle(wrapper, "held").trigger("click");
    expect(visibleIds(wrapper).sort()).toEqual(["0102", "0103"]);

    await headerToggle(wrapper, "human").trigger("click");
    expect(visibleIds(wrapper).sort()).toEqual(["0101", "0102", "0103"]);
  });

  it("remembers each choice independently across a remount", async () => {
    wrapper = mountWork([humanReady, aiReady]);
    await flush();
    await headerToggle(wrapper, "human").trigger("click");
    wrapper.unmount();
    wrapper = undefined;

    wrapper = mountWork([humanReady, aiReady]);
    await flush();
    expect(visibleIds(wrapper)).toEqual(["0102"]);
    expect(headerToggle(wrapper, "human").attributes("aria-pressed")).toBe("false");
    expect(headerToggle(wrapper, "held").attributes("aria-pressed")).toBe("true");
  });

  it("keeps the bottom-left parked controls in Human, Held, Archived order", async () => {
    wrapper = mountWork([
      aiReady,
      humanReady,
      heldActive,
      makeTask({ id: "0104", status: "review", isArchived: true }),
    ]);
    await flush();

    const classes = wrapper
      .findAll(".parked-toggles button")
      .map((button) => button.classes().find((c) => c.endsWith("-toggle")));
    expect(classes).toEqual(["human-toggle", "held-toggle", "archived-toggle"]);
  });

  it("filters the single-status list count too", async () => {
    // ?status=ready renders one forced-open column and its own chip count.
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [humanReady, aiReady];
    repo.counts = { ...EMPTY_COUNTS };
    const router = makeRouter();
    await router.push("/work?status=ready");
    wrapper = mount(WorkView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          BoardColumn: BoardColumnStub,
          IntegrationStatusBar: true,
          PipelineView: true,
          Select: selectStub,
          SelectTrigger: selectStub,
          SelectContent: selectStub,
          SelectItem: selectStub,
          SelectViewport: selectStub,
          SelectValue: selectStub,
        },
      },
    });
    await flush();
    expect(wrapper.get(".filter-chip").text()).toContain("Ready · 2");

    await headerToggle(wrapper, "human").trigger("click");
    expect(wrapper.get(".filter-chip").text()).toContain("Ready · 1");
    expect(visibleIds(wrapper)).toEqual(["0102"]);
  });
});

describe("Work board first-run and load-error placement (#1183 review)", () => {
  it("keeps empty-board guidance in the page flow outside the column layout", async () => {
    wrapper = mountWork([]);
    await flush();

    const guidance = wrapper.get("[data-testid='work-empty-state']");
    expect(guidance.text()).toContain("Start this project with a task");
    expect(guidance.element.parentElement?.classList.contains("board")).toBe(false);
  });

  it("keeps load recovery visible outside the columns with a status filter active", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.loading = false;
    repo.tasks = [];
    repo.counts = { ...EMPTY_COUNTS };
    repo.boardLoadError = "Can't reach the RepoOS server — it may be down.";
    const router = makeRouter();
    await router.push("/work?status=ready");
    wrapper = mount(WorkView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          BoardColumn: BoardColumnStub,
          IntegrationStatusBar: true,
          PipelineView: true,
          Select: selectStub,
          SelectTrigger: selectStub,
          SelectContent: selectStub,
          SelectItem: selectStub,
          SelectViewport: selectStub,
          SelectValue: selectStub,
        },
      },
    });
    await flush();

    const error = wrapper.get("[data-testid='work-load-error']");
    expect(error.text()).toContain("Couldn't load this project's tasks");
    expect(error.text()).toContain("Can't reach the RepoOS server");
    expect(error.element.parentElement?.classList.contains("board")).toBe(false);
    expect(wrapper.get(".filter-chip").text()).toContain("Ready · 0");
  });
});

describe("BoardColumn with a filtered task list (#1141)", () => {
  const TaskCardStub = {
    props: ["task"],
    template: `<div class="card-stub" :data-task-id="task.id" />`,
  };

  it("counts and renders the list it is given, not the store's full list", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const first = makeTask({ id: "0201", title: "Visible" });
    const second = makeTask({ id: "0202", title: "Filtered out" });
    repo.loading = false;
    repo.tasks = [first, second];
    repo.counts = { ...EMPTY_COUNTS };

    const column = mount(BoardColumn, {
      props: {
        col: { id: "ready", label: "Ready", color: "#5b8def" },
        tasks: [first],
      },
      global: {
        plugins: [pinia],
        stubs: { TaskCard: TaskCardStub, RestartTaskDialog: true },
      },
    });
    await flush();

    expect(column.get(".col-count").text()).toBe("1");
    const cards = column.findAll(".card-stub");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.attributes("data-task-id")).toBe("0201");
    column.unmount();
  });
});
