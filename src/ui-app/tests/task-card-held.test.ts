/**
 * #0960 — the board card's "Held" badge.
 *
 * A held task must render a "Held" badge carrying its reason, and only when the
 * hold is actually active (flag or `hold` tag, not an expired `holdUntil`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

// Unmount cards after each case (see task-drawer-landable.test.ts for why: a
// card left mounted re-renders on the shared useNow tick and can flip pinia's
// global active pinia for later cases).
enableAutoUnmount(afterEach);

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
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
  pmAgentOverride: null,
  reviewAgentOverride: null,
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

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function stubFetch(task: Task) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes("/diff-stats"))
        return json({ ok: true, stats: { filesChanged: 1, additions: 1, deletions: 1 } });
      if (url.includes(`/api/tasks/${task.id}`)) return json(task);
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountCard(pinia: Pinia, task: Task) {
  stubFetch(task);
  const repo = useRepoStore();
  await repo.init();
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  await vi.waitFor(() => expect(repo.diffStatsFor(task.id)).toBeDefined());
  await flush();
  return wrapper;
}

function newPinia(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal(
    "EventSource",
    class {
      static instances: unknown[] = [];
      addEventListener() {}
      close() {}
    },
  );
  return pinia;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaskCard Held badge (#0960)", () => {
  it("shows a Held badge with the reason for a flag-held task", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(
      pinia,
      makeTask({ isHeld: true, holdReason: "waiting on design sign-off" }),
    );

    const badge = wrapper.find(".tc-held");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("Held");
    // The reason travels in the tooltip so it is visible on hover/focus.
    expect(badge.attributes("data-tip")).toContain("waiting on design sign-off");
  });

  it("shows the badge for a task held only by a `hold` tag", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(pinia, makeTask({ tags: ["hold"] }));

    expect(wrapper.find(".tc-held").exists()).toBe(true);
  });

  it("does not show the badge for a non-held task", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(pinia, makeTask({ isHeld: false }));

    expect(wrapper.find(".tc-held").exists()).toBe(false);
  });

  it("drops the badge once a dated hold has auto-released", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(
      pinia,
      makeTask({
        isHeld: true,
        holdReason: "temporary freeze",
        holdUntil: "2000-01-01T00:00:00Z",
      }),
    );

    expect(wrapper.find(".tc-held").exists()).toBe(false);
  });
});

it.each([true, false])("expires the mounted card and Held group with flag=%s", async (flag) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  const pinia = newPinia();
  const task = makeTask({
    isHeld: flag,
    tags: flag ? [] : ["hold"],
    holdUntil: "2026-10-27T00:00:01Z",
  });
  const wrapper = await mountCard(pinia, task);
  const repo = useRepoStore();
  expect(wrapper.find(".tc-held").exists()).toBe(true);
  // The real store derives the group from its board tasks.
  repo.tasks = [task];
  expect(repo.heldTasks).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(wrapper.find(".tc-held").exists()).toBe(false);
  expect(repo.heldTasks).toHaveLength(0);
  wrapper.unmount();
  repo.$dispose();
});
