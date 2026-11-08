/**
 * #1054 — active checks/handoff hide card and drawer work actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

function activeTask() {
  return makeTask({
    status: "active",
    branch: "feat/handoff-actions",
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/repo/.worktrees/0001",
      dirty: false,
    },
  });
}

function stubApi(task: ReturnType<typeof activeTask>): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/handoff-status")) return json({ state: "idle", step: null, attempt: 0 });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ now: new Date("2026-11-07T14:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("active checks gate work actions (#1054)", () => {
  it.each(["check", "verify", "review", "capture"])(
    "shows running checks during handoff step %s after the engineer exits",
    async (step) => {
      const task = activeTask();
      stubApi(task);
      const repo = useRepoStore();
      repo.handoffStatuses[task.id] = {
        state: "running",
        step,
        attempt: 1,
        progress: null,
        updatedAt: new Date().toISOString(),
        machine: null,
      };
      const card = mount(TaskCard, {
        props: { task, dragEnabled: false },
        global: { plugins: [pinia] },
      });
      await nextTick();
      expect(card.text()).toContain("running checks");
      expect(card.text()).not.toContain("paused");
      expect(card.find('[data-test-id="task-card-action-footer"]').exists()).toBe(false);
      card.unmount();
    },
  );

  it("hides the card action button while handoff checks run", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.handoffSteps[task.id] = "check";
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(wrapper.find('[data-test-id="task-card-action-footer"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("returns Restart after handoff ends and hides Pause while checks run with a live engineer", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.runningIds = [task.id];
    repo.handoffSteps[task.id] = "check";
    let card = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(card.find('[data-test-id="task-card-action-footer"]').exists()).toBe(false);
    card.unmount();

    repo.handoffStatuses[task.id] = {
      state: "passed",
      step: "done",
      attempt: 1,
      progress: null,
      updatedAt: new Date().toISOString(),
      machine: null,
    };
    delete repo.handoffSteps[task.id];
    card = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(card.find('[data-test-id="task-card-action-footer"]').text()).toContain("Pause work");
    card.unmount();

    repo.runningIds = [];
    card = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(card.find('[data-test-id="task-card-action-footer"]').text()).toContain("Restart work");
    card.unmount();
  });

  it("hides drawer Restart/Start and Pause while checks run", async () => {
    const task = activeTask();
    stubApi(task);
    const repo = useRepoStore();
    repo.runningIds = [task.id];
    repo.handoffSteps[task.id] = "check";
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    useUiStore().open(task);
    const drawer = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();
    expect(drawer.find('[data-test-id="task-drawer-start-work"]').exists()).toBe(false);
    expect(drawer.text()).not.toContain("Pause work");
    drawer.unmount();
  });
});
