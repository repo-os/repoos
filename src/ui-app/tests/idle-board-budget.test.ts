/**
 * #1018 — an idle board must cost almost nothing.
 *
 * The runaway started because every `TaskCard` owned a `setInterval`: the
 * 15-second "now" timer was created for every card regardless of whether its
 * copy could change with time. A 500-task board therefore ran ~500 timers,
 * all started at mount and therefore firing in the same tick — hundreds of
 * full card re-renders every 15 seconds, forever, in a tab left open for days.
 *
 * These tests make the cost structural rather than wall-clock based (CI
 * machines vary too much for a millisecond budget): per-card timers must be
 * zero, one shared clock must pause while the document is hidden, and a
 * simulated idle minute must produce no DOM mutation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "ready",
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
    path: "work/0001-test.md",
    absPath: "/tmp/repo/work/0001-test.md",
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
    ...over,
  };
}

function newPinia(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, stats: { filesChanged: 0, additions: 0, deletions: 0 } }),
    })),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  return pinia;
}

function mountCards(pinia: Pinia, tasks: Task[]): VueWrapper {
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          "div",
          tasks.map((task) => h(TaskCard, { key: task.id, task, dragEnabled: false })),
        ),
    }),
    { global: { plugins: [pinia] } },
  );
  return wrapper;
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState): void {
  visibility = next;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const openWrappers: VueWrapper[] = [];
function track(wrapper: VueWrapper): VueWrapper {
  openWrappers.push(wrapper);
  return wrapper;
}

/** Let mocked fetch promises and their abort timers settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  for (const wrapper of openWrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("idle board cost (#1018)", () => {
  it("gives idle cards no per-card timer, however many are on the board", async () => {
    const pinia = newPinia();
    const repo = useRepoStore();

    const tasks = Array.from({ length: 20 }, (_, i) =>
      makeTask({ id: String(100 + i).padStart(4, "0"), status: "done" }),
    );
    repo.tasks = tasks;

    const first = track(mountCards(pinia, tasks.slice(0, 1)));
    await nextTick();
    await flush();
    expect(first.findAllComponents(TaskCard)).toHaveLength(1);
    const baseline = vi.getTimerCount();

    // Nineteen more idle cards must not add a timer per card. Before #1018
    // this was baseline + 19 (each card's own 15s interval).
    track(mountCards(pinia, tasks.slice(1)));
    await nextTick();
    await flush();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(baseline + 2);
  });

  it("does no DOM work over an idle minute", async () => {
    const pinia = newPinia();
    const repo = useRepoStore();
    repo.tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({ id: String(200 + i).padStart(4, "0"), status: "inbox" }),
    );

    const wrapper = track(mountCards(pinia, repo.tasks));
    await nextTick();

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(wrapper.element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    // Advance a full idle minute. Shared clock ticks stay cheap because no
    // idle card subscribes to them; no card re-renders.
    await vi.advanceTimersByTimeAsync(60_000);
    await nextTick();
    await Promise.resolve();
    observer.disconnect();

    expect(records.length).toBeLessThanOrEqual(2); // budget: effectively zero
  });

  it("keeps a timer for a live engineer and drops it while the tab is hidden", async () => {
    const pinia = newPinia();
    const repo = useRepoStore();
    const live = makeTask({ id: "0300", status: "active" });
    repo.tasks = [live];
    repo.runningIds = [live.id];
    repo.taskChecks = {
      [live.id]: [
        {
          id: "check-1",
          taskId: live.id,
          kind: "handoff-finalize",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "full",
          machine: "test",
          lastProgressAt: new Date().toISOString(),
        },
      ],
    };

    const wrapper = track(mountCards(pinia, [live]));
    await nextTick();
    await flush();
    const liveTimerCount = vi.getTimerCount();
    expect(liveTimerCount).toBeGreaterThan(0);

    setVisibility("hidden");
    // Any in-flight request timeout settles; no hidden timer may recreate it.
    await vi.advanceTimersByTimeAsync(16_000);
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);

    setVisibility("visible");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(wrapper.findAllComponents(TaskCard)).toHaveLength(1);
  });

  it("byStatus is memoised instead of filtering and sorting on every read", () => {
    newPinia();
    const repo = useRepoStore();
    repo.tasks = Array.from({ length: 40 }, (_, i) =>
      makeTask({ id: String(500 + i).padStart(4, "0"), status: "done" }),
    );

    const first = repo.byStatus("done");
    expect(repo.byStatus("done")).toBe(first);

    repo.sortOrder = "taskNumberNewest";
    const reSorted = repo.byStatus("done");
    expect(reSorted).not.toBe(first);
    expect(reSorted[0].id).toBe("0539");
  });
});
