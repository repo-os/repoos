/**
 * #0385 — the task drawer's error card must say an auto-repair is already in
 * flight, instead of showing a bare dead-end error + Fix button. The board
 * card already had this awareness (TaskCard's retry hints); the drawer did
 * not, so a user opening it during a covered retry thought they had to act.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0042",
  title: "Drawer retry task",
  type: "feature",
  status: "review",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/drawer-retry-task",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0042-drawer-retry-task.md",
  absPath: "/tmp/repo/work/0042-drawer-retry-task.md",
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
  automaticReview: { running: false, enabled: true },
  ...over,
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }

  emit(t: string, data: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ data: JSON.stringify(data) });
  }

  close(): void {
    /* noop */
  }
}

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const jsonFail = async (data: unknown) => ({ ok: false, status: 400, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

/** Boot a store whose `/api/index` has `task` and whose running set matches
 *  `running`; record a failed move-to-done so the error card is present. */
async function repoWithDoneError(
  task: Task,
  running: boolean,
): Promise<ReturnType<typeof useRepoStore>> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index") || url.includes("/api/board"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running"))
        return json({
          tasks: running ? [{ id: task.id, startedAt: new Date().toISOString() }] : [],
        });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: false, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      if (url.includes("/done"))
        return jsonFail({ ok: false, error: "check failed: deletion detected by watcher" });
      throw new Error("unexpected fetch: " + url);
    }),
  );
  const repo = useRepoStore();
  await repo.init();
  await expect(repo.completeTask(task)).rejects.toThrow();
  return repo;
}

async function mountDrawer(pinia: Pinia, task: Task): Promise<ReturnType<typeof mount>> {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drawer error card during an auto-repair retry (#0385)", () => {
  it("shows the being-resolved framing and relabels Fix while the retry runs", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);

    const task = makeTask({ checkRetryCount: 1, extra: { check_retry_count: 1 } });
    const repo = await repoWithDoneError(task, true);
    expect(repo.doneErrorFor(task.id)).not.toBeNull();

    const wrapper = await mountDrawer(pinia, task);

    const banner = wrapper.find(".done-error-retry");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("fixing check failure");
    expect(banner.text()).toContain("automatically fixing it");

    const fix = wrapper.find("button.done-error-fix");
    expect(fix.text()).toBe("Investigate anyway");
    expect(fix.attributes("title")).toMatch(/already repairing this automatically/i);
  });

  it("reverts to the plain dead-end Fix button once no retry is running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);

    // The counter is at the cap and the agent has stopped: handoff.ts has
    // given up, so this is genuinely a human's move.
    const task = makeTask({ checkRetryCount: 2, extra: { check_retry_count: 2 } });
    await repoWithDoneError(task, false);

    const wrapper = await mountDrawer(pinia, task);

    expect(wrapper.find(".done-error-retry").exists()).toBe(false);
    expect(wrapper.find("button.done-error-fix").text()).toBe("Fix");
  });
});
