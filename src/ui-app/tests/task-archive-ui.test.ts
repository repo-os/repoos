/**
 * #0657 — Archive UI: the confirm modal, the archived task panel state, and
 * the Work Queue's collapsible Archived list.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import ArchiveTaskDialog from "../src/components/ArchiveTaskDialog.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import WorkView from "../src/views/WorkView.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, json, makeTask } from "./component-test-helpers";
import type { Task } from "../src/types";

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function stubApi(task: Task): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      if (url.includes("/diff")) return json({ ok: true, stats: null });
      if (url.includes("/stats")) return json({ ok: true, stats: null });
      return json({ ok: true });
    }),
  );
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
}

describe("ArchiveTaskDialog (#0657)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.body.innerHTML = "";
  });

  // Render dialog children in place; real radix only adds portal/overlay
  // behaviour. Same stub set as the AddShotModal test.
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
  };

  it("offers the optional reason field and confirms with its text", async () => {
    wrapper = mount(ArchiveTaskDialog, {
      props: { open: true, task: { id: "0657", title: "Park me" } },
      global: { stubs },
    });
    await flush();

    expect(wrapper.find("#archive-detail").exists()).toBe(true);
    await wrapper.find("#archive-detail").setValue("waiting on upstream");
    await wrapper.findAll(".delete-confirm-actions button").at(-1)!.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual(["waiting on upstream"]);
  });

  it("confirms with an empty string when no reason is typed", async () => {
    wrapper = mount(ArchiveTaskDialog, {
      props: { open: true, task: { id: "0657", title: "Park me" } },
      global: { stubs },
    });
    await flush();
    await wrapper.findAll(".delete-confirm-actions button").at(-1)!.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([""]);
  });
});

describe("archived task panel (#0657)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  async function mountDrawer(task: Task): Promise<void> {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    stubApi(task);
    useConfigStore().data = { stories: { enabled: false } };
    useRepoStore().tasks = [task];
    const router = makeRouter();
    await router.push("/");
    await router.isReady();
    wrapper = mount(TaskDrawer, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: { teleport: false, Transition: true },
      },
    });
    const ui = useUiStore();
    ui.open(task);
    ui.activeTab = "details";
    await flush();
  }

  it("shows the Unarchive action and the reason card, and hides lifecycle controls", async () => {
    await mountDrawer(
      makeTask({ id: "0657", status: "review", isArchived: true, archiveDetail: "shelved" }),
    );

    expect(wrapper!.find(".archived-panel").exists()).toBe(true);
    expect(wrapper!.find(".archived-panel").text()).toContain("Unarchive");
    expect(wrapper!.find(".archived-reason").text()).toContain("shelved");
    // The lifecycle quickbar (status dropdown, Move to done, preview, …) is gone.
    expect(wrapper!.find(".drawer-quickbar").exists()).toBe(false);
    // Delete stays available.
    expect(wrapper!.text()).toContain("Delete task");
    // The archive affordance itself is gone for an already-archived task.
    expect(wrapper!.text()).not.toContain("Archive task");
  });

  it("shows no reason card when none was given, but still offers Unarchive", async () => {
    await mountDrawer(makeTask({ id: "0657", status: "active", isArchived: true }));

    expect(wrapper!.find(".archived-panel").exists()).toBe(true);
    expect(wrapper!.find(".archived-reason").exists()).toBe(false);
    expect(wrapper!.find(".archived-panel").text()).toContain("Unarchive");
  });
});

describe("Work Queue Archived list (#0657)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    localStorage.clear();
    document.body.innerHTML = "";
  });

  function mountWork(tasks: Task[]): void {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.tasks = tasks;
    repo.counts = { ...EMPTY_COUNTS };
    wrapper = mount(WorkView, {
      global: {
        plugins: [pinia, makeRouter()],
        stubs: { BoardColumn: true, IntegrationStatusBar: true },
      },
    });
  }

  it("shows the archived count, minimised by default, and expands on click", async () => {
    mountWork([
      makeTask({ id: "0001", status: "ready" }),
      makeTask({ id: "0002", status: "review", isArchived: true, archiveDetail: "later" }),
      makeTask({ id: "0003", status: "done", isArchived: true }),
    ]);
    await flush();

    const toggle = wrapper!.find(".archived-toggle");
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toContain("Archived (2)");
    // Minimised by default.
    expect(wrapper!.find(".archived-rows").exists()).toBe(false);

    await toggle.trigger("click");
    await flush();
    const rows = wrapper!.findAll(".archived-row");
    expect(rows).toHaveLength(2);
    // Archived task ids appear; the live one does not.
    const text = wrapper!.find(".archived-rows").text();
    expect(text).toContain("#0002");
    expect(text).toContain("#0003");
    expect(text).not.toContain("#0001");

    // Preference persists across a remount.
    wrapper!.unmount();
    mountWork([
      makeTask({ id: "0002", status: "review", isArchived: true, archiveDetail: "later" }),
    ]);
    await flush();
    expect(wrapper!.find(".archived-rows").exists()).toBe(true);
  });

  it("does not render the list when no tasks are archived", async () => {
    mountWork([makeTask({ id: "0001", status: "ready" })]);
    await flush();
    expect(wrapper!.find(".archived-toggle").exists()).toBe(false);
  });
});
