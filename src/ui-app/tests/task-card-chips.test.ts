/**
 * 0776: the board card's metadata row.
 *
 * - every area collapses into ONE space-separated chip (not one per area)
 * - the file-change chip shows only the changed-file count with a document
 *   icon; the +/- line counts live in the tooltip
 * - an AI-assigned task shows no assignee chip, so a default-new task is clean
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

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

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

type DiffStats = { filesChanged: number; additions: number; deletions: number };

function stubFetch(task: Task, stats: DiffStats | Promise<DiffStats>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      // Must be checked before the bare /api/tasks/<id> route below.
      if (url.includes("/diff-stats")) return json({ ok: true, stats: await stats });
      if (url.includes(`/api/tasks/${task.id}`)) return json(task);
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountCard(
  pinia: Pinia,
  task: Task,
  stats: DiffStats = { filesChanged: 10, additions: 377, deletions: 5 },
) {
  stubFetch(task, stats);
  const repo = useRepoStore();
  await repo.init();
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  // The card loads its diff stats on mount; wait for the stubbed response.
  await vi.waitFor(() => expect(repo.diffStatsFor(task.id)).toBeDefined());
  await flush();
  return wrapper;
}

function newPinia(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  return pinia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskCard area chip (#0776)", () => {
  it("renders multiple areas as one space-separated chip", async () => {
    const pinia = newPinia();
    const task = makeTask({ area: "web, server", areas: ["web", "server"] });
    const wrapper = await mountCard(pinia, task);

    const chips = wrapper.findAll(".tc-area-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toBe("web server");
  });

  it("falls back to the joined area string when only `area` is present", async () => {
    const pinia = newPinia();
    const task = makeTask({ area: "web, server" });
    const wrapper = await mountCard(pinia, task);

    const chips = wrapper.findAll(".tc-area-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toBe("web server");
  });
});

describe("TaskCard file-change chip (#0776)", () => {
  it("shows only the file count with a document icon", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(pinia, makeTask());

    const chip = wrapper.find(".tc-file-chip");
    expect(chip.exists()).toBe(true);
    // Count only — no line totals in the label.
    expect(chip.text()).toBe("10");
    expect(chip.text()).not.toContain("377");
    // The document icon renders as an inline SVG, like the dependency chip.
    expect(chip.find("svg").exists()).toBe(true);
    // Line counts stay available in the tooltip.
    expect(chip.attributes("title")).toBe("10 files, +377 −5");
  });

  it("shows no chip or placeholder when a branched task has no changes", async () => {
    const pinia = newPinia();
    const task = makeTask({ branch: "feat/no-changes" });
    const wrapper = await mountCard(pinia, task, {
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });

    expect(wrapper.find(".tc-file-chip").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("0 changes");
  });

  it("does not show a chip while diff stats are loading", async () => {
    const pinia = newPinia();
    const task = makeTask({ branch: "feat/no-changes" });
    let resolveStats!: (stats: DiffStats) => void;
    const stats = new Promise<DiffStats>((resolve) => {
      resolveStats = resolve;
    });
    stubFetch(task, stats);
    const repo = useRepoStore();
    await repo.init();
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await flush();

    expect(repo.diffStatsFor(task.id)).toBeUndefined();
    expect(wrapper.find(".tc-file-chip").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("0 changes");

    resolveStats({ filesChanged: 0, additions: 0, deletions: 0 });
    await vi.waitFor(() => expect(repo.diffStatsFor(task.id)).toBeDefined());
    await flush();
    expect(wrapper.find(".tc-file-chip").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("0 changes");
  });
});

describe("TaskCard assignee chip (#0776, #0816)", () => {
  it("shows no assignee chip for an AI-assigned task", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(pinia, makeTask({ assignee: "ai", assignedTo: "ai" }));
    expect(wrapper.find(".tc-assignee-chip").exists()).toBe(false);
    expect(wrapper.find(".tc-human-chip").exists()).toBe(false);
  });

  it("shows no assignee chip for an unassigned task (#0816)", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(
      pinia,
      makeTask({ id: "0002", assignee: "unassigned", assignedTo: "" }),
    );
    expect(wrapper.find(".tc-assignee-chip").exists()).toBe(false);
    expect(wrapper.find(".tc-human-chip").exists()).toBe(false);
  });
});

describe("TaskCard human chip (#0795)", () => {
  it("shows a person icon and the assignee for a human-assigned task", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(
      pinia,
      makeTask({ id: "0003", assignee: "human", assignedTo: "Nick" }),
    );

    const chip = wrapper.find(".tc-human-chip");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("Nick");
    // The person glyph renders as an inline SVG, like the file-change chip.
    expect(chip.find("svg").exists()).toBe(true);
    // A human task uses the distinct chip, not the neutral assignee chip.
    expect(wrapper.find(".tc-assignee-chip").exists()).toBe(false);
  });

  it("falls back to 'human' when no assignee name is set", async () => {
    const pinia = newPinia();
    const wrapper = await mountCard(
      pinia,
      makeTask({ id: "0004", assignee: "human", assignedTo: "" }),
    );

    expect(wrapper.find(".tc-human-chip").text()).toContain("human");
  });
});
