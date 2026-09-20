/**
 * 0455: every board card shows a small robot button in its bottom-right that
 * toggles a compact PM / Engineer / Reviewer agent assignment panel — override
 * when set, else the enabled board-default agent for that role.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "ui",
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

function stubFetch(task: Task): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/diff-stats")) return json({ filesChanged: 0, additions: 0, deletions: 0 });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountCard(pinia: Pinia, task: Task) {
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  await flush();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TaskCard agent assignments panel (0455)", () => {
  it("renders a robot button and reveals the three assignment rows on hover", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({
      agentOverride: "codex",
      pmAgentOverride: "Ross",
      reviewAgentOverride: "reviewer-pro",
    });
    stubFetch(task);
    await useRepoStore().init();

    const wrapper = await mountCard(pinia, task);

    expect(wrapper.find(".tc-agent-btn").exists()).toBe(true);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);

    await wrapper.find(".tc-agent").trigger("mouseenter");
    await flush();

    const rows = wrapper.findAll(".tc-agent-row");
    expect(rows).toHaveLength(3);
    const text = rows.map((r) => r.text());
    expect(text[0]).toContain("PM");
    expect(text[0]).toContain("Ross");
    expect(text[1]).toContain("Engineer");
    expect(text[1]).toContain("codex");
    expect(text[2]).toContain("Reviewer");
    expect(text[2]).toContain("reviewer-pro");

    // Mouse-leave collapses a hover-opened panel.
    await wrapper.find(".tc-agent").trigger("mouseleave");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
  });

  it("toggles on click and stays pinned across mouse-leave until a second click", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ agentOverride: "codex" });
    stubFetch(task);
    await useRepoStore().init();

    const wrapper = await mountCard(pinia, task);

    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);

    // Pinned: leaving the region does not collapse it.
    await wrapper.find(".tc-agent").trigger("mouseleave");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);

    // A second click collapses it.
    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
  });

  it("falls back to the enabled board-default agent per role when no override is set", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const config = useConfigStore();
    config.agents = [
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
      { name: "cto", cli: "opencode", model: "default", enabled: false },
    ];
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();

    const wrapper = await mountCard(pinia, task);
    await wrapper.find(".tc-agent").trigger("mouseenter");
    await flush();

    const text = wrapper.findAll(".tc-agent-row").map((r) => r.text());
    expect(text[0]).toContain("pm");
    expect(text[1]).toContain("engineer");
    expect(text[2]).toContain("reviewer");
  });
});
