/**
 * #0647 — a diff button on the Changes tab whenever the task's worktree has
 * uncommitted changes.
 *
 * The button must reuse the full-screen diff the Changes tab already has: same
 * route, same handler as the per-file expand buttons, no second renderer. So
 * these tests assert the navigation target (route name + task id, and whether a
 * file is pinned), not any rendering of the diff itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "active",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/test",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-test.md",
    absPath: "/tmp/repo/work/0001-test.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/wt",
      dirty: false,
    },
    preview: null,
    automaticReview: { running: false, enabled: true },
    ...over,
  }) as Task;

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({
          tasks: [makeTask()],
          counts: { ...EMPTY_COUNTS, active: 1 },
          taskCount: 1,
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/diff-stats"))
        return json({
          ok: true,
          filesChanged: 1,
          additions: 2,
          deletions: 1,
          perFile: [{ filename: "a.ts", added: 2, removed: 1 }],
        });
      if (url.includes("/diff"))
        return json({
          ok: true,
          diff: {
            patch: [
              "diff --git a/a.ts b/a.ts",
              "index 1111111..2222222 100644",
              "--- a/a.ts",
              "+++ b/a.ts",
              "@@ -1 +1,2 @@",
              "-old",
              "+new",
              "+newer",
              "",
            ].join("\n"),
            truncated: false,
          },
        });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      if (url.includes("/checks")) return json({ ok: true, runs: [] });
      if (url.includes("/logs")) return json({ ok: true, logs: [] });
      return json({ ok: true });
    }),
  );
}

interface Mounted {
  wrapper: ReturnType<typeof mount>;
  router: Router;
}

async function mountChanges(pinia: Pinia, task: Task = makeTask()): Promise<Mounted> {
  // The real `diff` route, so `router.push({ name: "diff" })` resolves and we
  // can assert the full-screen view's location rather than a rejected promise.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "board", component: { template: "<div />" } },
      {
        path: "/tasks/:taskId/diff",
        name: "diff",
        component: { template: "<div />" },
      },
    ],
  });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true },
    },
  });
  // Switch tabs the way a human does, so the drawer's on-tab-open watchers fire.
  ui.activeTab = "changes";
  await flushPromises();
  return { wrapper, router };
}

/** The active task, with its git block overridable. */
function taskWithDirty(dirty: boolean): Task {
  return makeTask({ git: { ...makeTask().git, dirty } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Changes tab → dirty-worktree diff button (#0647)", () => {
  it("offers the button while the worktree has uncommitted changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const { wrapper } = await mountChanges(pinia, taskWithDirty(true));

    const btn = wrapper.find('[data-test-id="changes-view-diff"]');
    expect(btn.exists()).toBe(true);
    // Active voice: the label says what the click does.
    expect(btn.text()).toContain("View diff");
    expect(wrapper.find(".diff-dirty-text").text()).toContain("uncommitted changes");
  });

  it("hides the button entirely on a clean worktree", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const { wrapper } = await mountChanges(pinia, taskWithDirty(false));

    expect(wrapper.find(".diff-dirty").exists()).toBe(false);
    expect(wrapper.find('[data-test-id="changes-view-diff"]').exists()).toBe(false);
    // The rest of the tab is untouched — the per-file diff list still renders.
    expect(wrapper.find(".diff-file-list").exists()).toBe(true);
  });

  it("routes to the existing full-screen diff view for the active task", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const { wrapper, router } = await mountChanges(pinia, taskWithDirty(true));

    await wrapper.find('[data-test-id="changes-view-diff"]').trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("diff");
    expect(router.currentRoute.value.params.taskId).toBe("0001");
    // No file pinned: the view falls back to the first file in the patch, which
    // is the whole-diff view rather than one file.
    expect(router.currentRoute.value.query.file).toBeUndefined();
  });

  it("closes the drawer so the full-screen view is what the user sees", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const { wrapper } = await mountChanges(pinia, taskWithDirty(true));
    const ui = useUiStore();
    expect(ui.active?.id).toBe("0001");

    await wrapper.find('[data-test-id="changes-view-diff"]').trigger("click");
    await flushPromises();

    expect(ui.active).toBeNull();
  });

  it("reuses the per-file expand button's route, pinned to that file", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const { wrapper, router } = await mountChanges(pinia, taskWithDirty(true));

    // The same `expandable` affordance the drawer already had: one handler, so
    // the dirty button can't drift away from it later.
    await wrapper.find(".diff-file-expand").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.name).toBe("diff");
    expect(router.currentRoute.value.query.file).toBe("a.ts");
  });
});
